#!/usr/bin/env python3
"""Generate the parts of the site that restate data/schema.json.

data/schema.json is the single source of truth for the entry standard. This script writes:

  * field lists in HTML pages, between markers
        <!-- build:common -->            ... <!-- /build:common -->
        <!-- build:card <registry> -->   ... <!-- /build:card <registry> -->
        <!-- build:rules <registry> -->  ... <!-- /build:rules <registry> -->
  * one GitHub issue form per registry in .github/ISSUE_TEMPLATE/
  * the follow lists in follow.html, between <!-- build:follow registries --> and <!-- build:follow themes --> markers
  * RSS feeds in feeds/: releases.xml, one per registry, one per theme (theme-<slug>.xml), and one per released or
    deprecated entry (entry-<registry>-<id>.xml, which also lists every leaderboard result of a benchmark)
  * sitemap.xml: the static pages, follow.html, and one entry.html per released entry

Feeds are RSS 2.0, newest first, at most 50 items, and deterministic: the same data gives byte-identical files, because
every date comes from the data and never from the build time.

Usage:
    python scripts/build.py                       # rewrite generated content
    python scripts/build.py --check               # exit 1 if anything is out of date (used in CI)
    python scripts/build.py --registry PATH       # build from another registry file (testing only)

Standard library only.
"""
import datetime as dt
import email.utils
import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / "data" / "schema.json").read_text(encoding="utf-8"))
SITE = SCHEMA["x-site"]
DEFS = SCHEMA["$defs"]
REGISTRIES = SCHEMA["x-registries"]
SITE_KEY = SITE["name"].lower()
THEMES = {t["slug"]: t["label"] for t in SCHEMA.get("x-themes", [])}
NETWORK = "https://urbanscience.ai"
MAX_ITEMS = 50
REGISTRY_FILE = ROOT / "data" / "registry.json"


def resolve(prop):
    """Return (title, description) for a card property, honouring local overrides of a $ref."""
    title, desc = prop.get("title"), prop.get("description")
    ref = prop.get("$ref", "")
    while (title is None or desc is None) and ref.startswith("#/$defs/"):
        target = DEFS[ref.split("/")[-1]]
        title = title if title is not None else target.get("title")
        desc = desc if desc is not None else target.get("description")
        ref = target.get("$ref", "")
    return title, desc


def card_fields(registry):
    props = DEFS[registry["card"]]["properties"]
    return [(key,) + resolve(prop) for key, prop in props.items()]


def common_fields():
    return [(key, DEFS[key]["title"], DEFS[key]["description"]) for key in SCHEMA["x-common"]]


def esc(s):
    return html.escape(s, quote=False)


def an(word):
    """The right indefinite article: 'an agent', 'a model'."""
    return "an" if word[:1].lower() in "aeiou" else "a"


def keys_html(keys):
    return " ".join(f'<code class="key">{k}</code>' for k in keys)


def fields_dl(fields, artifacts_desc):
    rows = [f'<div><dt>{esc(t)} {keys_html([k])}</dt><dd>{esc(d)}</dd></div>' for k, t, d in fields]
    a = SITE["artifacts"]
    rows.append(f'<div><dt>{esc(a["title"])} {keys_html(a["keys"])}</dt><dd>{esc(artifacts_desc)}</dd></div>')
    return ['<dl class="fields">'] + ["  " + r for r in rows] + ["</dl>"]


def rules_div(fields, artifacts_desc):
    rows = [f'<div class="rule"><strong>{esc(t)} {keys_html([k])}</strong><span>{esc(d)}</span></div>' for k, t, d in fields]
    a = SITE["artifacts"]
    rows.append(f'<div class="rule"><strong>{esc(a["title"])} {keys_html(a["keys"])}</strong><span>{esc(artifacts_desc)}</span></div>')
    return ['<div class="rules">'] + ["  " + r for r in rows] + ["</div>"]


BELL = ('<svg class="follow-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" '
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>'
        '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>')


def attr(s):
    return html.escape(s, quote=True)


def follow_item(title, text, feed, what, github=None, extra="", newsletter=False):
    """One row of the subscription centre: name, sentence, a follow button, and the raw feed link for readers without JavaScript."""
    gh = f' data-follow-github="{attr(github)}" data-follow-github-kind="releases"' if github else ""
    gh += ' data-follow-newsletter="true"' if newsletter else ""
    return [
        '<li class="fw-item">',
        f'  <div class="fw-text"><h4>{esc(title)}</h4><p>{esc(text)}</p></div>',
        '  <div class="fw-actions">',
        # A link, not a button: without JavaScript it still opens the feed. follow.js turns it into the dialog.
        f'    <a class="follow-btn" data-follow href="{attr(feed)}" aria-label="Follow {attr(title)}" data-follow-title="{attr(title)}" data-follow-what="{attr(what)}" data-follow-feed="{attr(feed)}"{gh}>{BELL}<span>Follow</span></a>',
        f'    <a class="fw-raw" href="{attr(feed)}" aria-label="Feed address for {attr(title)}">Feed address</a>{extra}',
        "  </div>",
        "</li>",
    ]


def follow_block(arg):
    rows = []
    if arg == "registries":
        rows += follow_item(f"All {SITE['name']} releases",
                            "Every new and updated entry in all three registries. Low volume: an item appears only when an entry is released, updated or deprecated.",
                            "feeds/releases.xml", "Every new and updated release.", SITE["repo"], newsletter=True)
        for r in REGISTRIES:
            rows += follow_item(r["label"], f"New and updated {r['label'].lower()} only. An item appears when {an(r['singular'])} {r['singular']} is released, updated or deprecated.",
                                f"feeds/{r['key']}.xml", f"New and updated {r['label'].lower()}.", SITE["repo"])
    elif arg == "themes":
        for slug, label in THEMES.items():
            net = f'    <a class="fw-raw" href="{NETWORK}/feeds/theme-{slug}.xml" aria-label="Whole network: {attr(label)}" data-follow data-follow-title="{attr(label + " across the network")}" '                   f'data-follow-what="Discussions and releases from all the network sites that are tagged with this theme." data-follow-feed="{NETWORK}/feeds/theme-{slug}.xml">Whole network</a>'
            rows += follow_item(label, f"Entries on {SITE['name']} tagged with this theme. Low volume.", f"feeds/theme-{slug}.xml",
                                f"New and updated {SITE['name']} entries tagged with this theme.", None, "\n" + net)
    elif arg == "digest":
        rows += follow_item("Weekly network digest",
                            "One summary a week of the new discussions, open calls, events and releases across the four network sites. A digest is published only after a week with activity.",
                            f"{NETWORK}/feeds/digest.xml", "A weekly summary of the whole network.", None, newsletter=True)
    else:
        raise ValueError(arg)
    return ['<ul class="fw-list">'] + ["  " + r for r in rows] + ["</ul>"]


def block(name, arg=None):
    if name == "follow":
        return follow_block(arg)
    if name == "common":
        return fields_dl(common_fields(), SITE["artifacts"]["description"])
    registry = next(r for r in REGISTRIES if r["key"] == arg)
    if name == "card":
        return fields_dl(card_fields(registry), registry["artifacts"])
    if name == "rules":
        return rules_div(card_fields(registry), registry["artifacts"])
    raise ValueError(name)


MARKER = re.compile(r"^(?P<indent>[ \t]*)<!-- build:(?P<name>\w+)(?: (?P<arg>[\w-]+))? -->\n.*?^[ \t]*<!-- /build:(?P=name)(?: (?P=arg))? -->", re.M | re.S)


def render_page(text):
    def sub(m):
        indent, name, arg = m.group("indent"), m.group("name"), m.group("arg")
        tag = name + (f" {arg}" if arg else "")
        body = "\n".join(indent + line for line in block(name, arg))
        return f"{indent}<!-- build:{tag} -->\n{body}\n{indent}<!-- /build:{tag} -->"
    return MARKER.sub(sub, text)


def q(s):
    """YAML double-quoted scalar (JSON strings are valid YAML)."""
    return json.dumps(s, ensure_ascii=False)


def issue_form(registry):
    one = registry["singular"]
    std = f'{SITE["url"]}/{SITE["standard"]}#{registry["key"]}'
    out = [
        f"# Generated by scripts/build.py from data/schema.json. Do not edit by hand.",
        f"name: {q('Propose ' + an(one) + ' ' + one + ' entry')}",
        f"description: {q('Propose ' + an(one) + ' ' + one + ' for the ' + SITE['name'] + ' ' + registry['label'] + ' registry. Every field follows the published standard.')}",
        f"title: {q(one.capitalize() + ' entry: ')}",
        f"labels: [{q(registry['key'])}, \"entry-proposal\"]",
        "body:",
        "  - type: markdown",
        "    attributes:",
        f"      value: {q('Proposals are reviewed against the [' + registry['label'].lower() + ' standard](' + std + '). Fill every field. Answers such as \"to follow\" or \"TBD\" block a release; if something is not known yet, say what is missing and why.')}",
    ]

    def field(kind, fid, label, desc, required, placeholder=None):
        out.extend([
            f"  - type: {kind}",
            f"    id: {fid}",
            "    attributes:",
            f"      label: {q(label)}",
            f"      description: {q(desc)}",
        ])
        if placeholder:
            out.append(f"      placeholder: {q(placeholder)}")
        out.extend(["    validations:", f"      required: {'true' if required else 'false'}"])

    field("input", "entry_title", "Title", f"Name of the {one} as it should appear in the registry.", True)
    field("textarea", "summary", "Summary", "One sentence, up to 280 characters, shown in the registry list.", True)
    field("input", "authors", "Authors", "Names, separated by commas.", True)
    field("textarea", "links", "Links", "One per line: a label, then the URL. Include the code, data or weights, and any paper.", True,
          "Code — https://github.com/...\nPaper — https://arxiv.org/abs/...")
    field("input", "license", "Licence", "Licence of the released artifacts, e.g. MIT, Apache-2.0, CC BY 4.0.", True)
    if "access" in SITE["artifacts"]["keys"]:
        field("textarea", "access", "Access conditions", "Any conditions on access, and what may not be redistributed. Write 'None' if open.", False)
    field("textarea", "citation", "Citation", "How the entry should be cited.", True)
    if SCHEMA.get("x-themes"):
        out.extend([
            "  - type: dropdown",
            "    id: themes",
            "    attributes:",
            f"      label: {q('Research themes')}",
            f"      description: {q('Themes shared across the network. They place the entry on the matching theme hubs of the City Computing Collective.')}",
            "      multiple: true",
            "      options:",
        ] + [f"        - {q(t['label'])}" for t in SCHEMA["x-themes"]] + ["    validations:", "      required: false"])
    field("input", "cities", "Cities or regions", "Where the work was built or tested, separated by commas.", False)
    for key, title, desc in card_fields(registry):
        field("textarea", key, title, desc, True)
    out.extend([
        "  - type: checkboxes",
        "    id: confirm",
        "    attributes:",
        "      label: Before submitting",
        "      options:",
        f"        - label: {q('I have the right to release everything linked above, and restricted data is described rather than redistributed.')}",
        "          required: true",
        f"        - label: {q('The released artifacts reproduce the results reported in this proposal.')}",
        "          required: true",
    ])
    return "\n".join(out) + "\n"


def load_data():
    return json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))


def rfc822(date):
    """RFC 822 date in GMT for a YYYY-MM-DD date; noon UTC so every time zone shows the same day."""
    return email.utils.format_datetime(dt.datetime.fromisoformat(date + "T12:00:00+00:00"), usegmt=True)


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def page_url(r, e):
    return f"{SITE['url']}/entry.html?registry={r['key']}&id={e['id']}"


def card_url(r, e):
    url = e.get("url") or page_url(r, e)
    return url if url.startswith("http") else f"{SITE['url']}/{url}"


def entry_date(e):
    log = [c["date"] for c in e.get("changelog", []) or []]
    return e.get("updated") or (max(log) if log else None) or e.get("released")


def cats(r, e, kind):
    return [kind, r["label"]] + [THEMES.get(t, t) for t in e.get("themes", []) or []]


def version_items(r, e, data):
    """One item per changelog version, or one for the current version when there is no changelog."""
    out = []
    log = sorted(e.get("changelog", []) or [], key=lambda c: (c["date"], c["version"]))
    steps = [(c["version"], c["date"], c["note"]) for c in log] or [(e.get("version", ""), e.get("updated") or e.get("released"), None)]
    seen = set()
    for version, date, note in steps:
        if version in seen:  # a repeated version would reuse its guid; the first entry wins
            continue
        seen.add(version)
        title = f"{e['title']} v{version}" if version else e["title"]
        desc = e.get("summary", "") + (f" Change in v{version}: {note}" if note else "")
        out.append({"title": title, "link": card_url(r, e), "guid": f"{SITE_KEY}-{r['key']}-{e['id']}-v{version}", "date": date,
                    "desc": desc.strip(), "cats": cats(r, e, "Release"), "e": e, "r": r})
    return out


def deprecation_item(r, e, data):
    target = e.get("replaced_by")
    replacement = next((x for x in data.get(r["key"], []) or [] if x.get("id") == target), None)
    desc = f"{e['title']} is deprecated and kept for the record."
    if target:
        desc += f" It is replaced by {replacement['title'] if replacement else target}."
    return {"title": f"Deprecated: {e['title']}", "link": card_url(r, e), "guid": f"{SITE_KEY}-{r['key']}-{e['id']}-deprecated",
            "date": entry_date(e), "desc": desc, "cats": cats(r, e, "Deprecation"), "e": e, "r": r}


def result_items(r, e):
    board = e.get("leaderboard") or {}
    metrics = {m["key"]: m for m in board.get("metrics", [])}
    out, seen = [], set()
    for res in board.get("results", []):
        scores = []
        for key, value in res.get("scores", {}).items():
            m = metrics.get(key, {"label": key})
            if value is not None:
                scores.append(f"{m['label']} {value:.{m.get('decimals', 2)}f}{m.get('unit', '')}")
        note = "baseline" if res.get("baseline") else ("verified" if res.get("verified") else "not verified")
        guid = f"{SITE_KEY}-{r['key']}-{e['id']}-result-{slugify(res['system'])}-{res['date']}"
        while guid in seen:
            guid += "-2"
        seen.add(guid)
        out.append({"title": f"New result on {e['title']}: {res['system']}", "link": page_url(r, e) + "#leaderboard", "guid": guid, "date": res["date"],
                    "desc": f"{res['system']} on {e['title']}: {', '.join(scores) or 'no scores'} ({note}).", "cats": cats(r, e, "Result"), "e": e, "r": r})
    return out


def release_items(data):
    """Every release and deprecation across the registry, unsorted."""
    items = []
    for r in REGISTRIES:
        for e in data.get(r["key"], []) or []:
            if e.get("status") == "released":
                items += version_items(r, e, data)
            elif e.get("status") == "deprecated" and entry_date(e):
                items.append(deprecation_item(r, e, data))
    return items


_XML_ILLEGAL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]")


def xml_text(s):
    """Escape text for an XML feed and drop the characters XML 1.0 forbids, so one stray control character cannot break a feed."""
    return html.escape(_XML_ILLEGAL.sub("", str(s)))


def rss(title, link, description, path, items):
    items = sorted(items, key=lambda i: (i["date"], i["guid"]), reverse=True)[:MAX_ITEMS]
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">', "<channel>",
           f"<title>{xml_text(title)}</title><link>{xml_text(link)}</link><description>{xml_text(description)}</description><language>en</language>"]
    if items:
        out.append(f"<lastBuildDate>{rfc822(items[0]['date'])}</lastBuildDate>")
    out.append(f'<atom:link href="{SITE["url"]}/feeds/{path}" rel="self" type="application/rss+xml"/>')
    for i in items:
        cat = "".join(f"<category>{xml_text(c)}</category>" for c in i["cats"])
        out.append(f'<item><title>{xml_text(i["title"])}</title><link>{xml_text(i["link"])}</link><guid isPermaLink="false">{xml_text(i["guid"])}</guid>'
                   f'<pubDate>{rfc822(i["date"])}</pubDate>{cat}<description>{xml_text(i["desc"])}</description></item>')
    out += ["</channel>", "</rss>"]
    return "\n".join(out) + "\n"


def feed_files(data):
    """Return {file name: text} for every feed this site publishes."""
    name = SITE["name"]
    items = release_items(data)
    files = {"releases.xml": rss(f"{name} releases", SITE["url"] + "/", f"New and updated entries on {name}.", "releases.xml", items)}
    for r in REGISTRIES:
        mine = [i for i in items if i["r"] is r]
        files[f"{r['key']}.xml"] = rss(f"{name} {r['label'].lower()}", f"{SITE['url']}/{r['page']}", f"New and updated {r['label'].lower()} on {name}.", f"{r['key']}.xml", mine)
    for slug, label in THEMES.items():
        mine = [i for i in items if slug in (i["e"].get("themes") or [])]
        files[f"theme-{slug}.xml"] = rss(f"{name}: {label}", SITE["url"] + "/", f"New and updated {name} entries tagged {label}.", f"theme-{slug}.xml", mine)
    for r in REGISTRIES:
        for e in data.get(r["key"], []) or []:
            if e.get("status") not in ("released", "deprecated"):
                continue
            mine = version_items(r, e, data) if e["status"] == "released" or e.get("changelog") else []
            if e["status"] == "deprecated" and entry_date(e):
                mine.append(deprecation_item(r, e, data))
            mine += result_items(r, e)
            fname = f"entry-{r['key']}-{e['id']}.xml"
            files[fname] = rss(f"{e['title']} ({name})", page_url(r, e), f"New versions, deprecation notices and results for {e['title']} on {name}.", fname, mine)
    return files


def sitemap(data):
    pages = ["/"] + [f"/{r['page']}" for r in REGISTRIES] + [f"/{SITE['standard']}", "/follow.html"]
    rows = [f"  <url><loc>{SITE['url']}{p}</loc></url>" for p in pages]
    for r in REGISTRIES:
        for e in sorted((x for x in data.get(r["key"], []) or [] if x.get("status") == "released"), key=lambda x: x["id"]):
            rows.append(f"  <url><loc>{xml_text(page_url(r, e))}</loc><lastmod>{entry_date(e)}</lastmod></url>")
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(rows) + "\n</urlset>\n"


def targets():
    """Yield (path, expected_text) for every generated file."""
    pages = set(SITE.get("pages_with_common", [])) | {SITE["standard"], "follow.html"} | {r["page"] for r in REGISTRIES}
    for name in sorted(pages):
        path = ROOT / name
        text = path.read_text(encoding="utf-8")
        yield path, render_page(text)
    forms = ROOT / ".github" / "ISSUE_TEMPLATE"
    for r in REGISTRIES:
        yield forms / r["template"], issue_form(r)
    data = load_data()
    for fname, text in feed_files(data).items():
        yield ROOT / "feeds" / fname, text
    yield ROOT / "sitemap.xml", sitemap(data)


def stale_feeds():
    """Per-entry feeds whose entry is gone."""
    wanted = set(feed_files(load_data()))
    return [p for p in sorted((ROOT / "feeds").glob("entry-*.xml")) if p.name not in wanted]


def main():
    global REGISTRY_FILE
    check = "--check" in sys.argv
    if "--registry" in sys.argv:
        REGISTRY_FILE = pathlib.Path(sys.argv[sys.argv.index("--registry") + 1]).resolve()
    stale = []
    for path, expected in targets():
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == expected:
            continue
        stale.append(path.relative_to(ROOT).as_posix())
        if not check:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(expected, encoding="utf-8", newline="\n")
    for path in stale_feeds():
        stale.append(path.relative_to(ROOT).as_posix() + " (entry no longer exists)")
        if not check:
            path.unlink()
    if check and stale:
        print("Out of date with data/schema.json (run python scripts/build.py):")
        for s in stale:
            print("  " + s)
        sys.exit(1)
    print(("Up to date" if check else "Wrote " + (", ".join(stale) if stale else "nothing; already up to date")))


if __name__ == "__main__":
    main()
