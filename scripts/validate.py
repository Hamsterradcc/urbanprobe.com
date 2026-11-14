#!/usr/bin/env python3
"""Check registry data against data/schema.json and the rules the standard states in prose.

Checks data/registry.json and every file in data/examples/:
  * JSON Schema validation (draft 2020-12), including date formats
  * unique ids across all registries in a file
  * released entries fill every card field, and no field is a placeholder ("TBD", "to follow", ...)
  * replaced_by, related entries, and leaderboard system references point at existing entries
  * leaderboard scores use declared metrics; changelogs list the current version once per version; local previews exist
  * no control characters in any string, and links use http(s) or site addresses only

Usage:
    python scripts/validate.py
Requires: jsonschema (pip install jsonschema)
"""
import json
import pathlib
import re
import sys

from jsonschema import Draft202012Validator, FormatChecker

ROOT = pathlib.Path(__file__).resolve().parents[1]
# Characters XML 1.0 forbids: they would make every feed that carries the text unreadable.
XML_ILLEGAL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]")
PLACEHOLDER = re.compile(r"^\s*(tbd|tba|todo|to follow|to be added|coming soon|n/?a|none yet|-+|…|\.\.\.)\s*[.!]?\s*$", re.I)


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def strings(node, path=""):
    """Every string in a JSON document, with its path."""
    if isinstance(node, str):
        yield path or "(root)", node
    elif isinstance(node, dict):
        for k, v in node.items():
            yield from strings(v, f"{path}/{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from strings(v, f"{path}/{i}")


def safe_href(value):
    """http(s) addresses, or addresses on this site. Any other scheme (javascript:, data:) is refused."""
    return bool(re.match(r"^https?://\S+$", value)) or not re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", value)


def main():
    schema = load(ROOT / "data" / "schema.json")
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    registries = schema["x-registries"]
    card_keys = {r["key"]: list(schema["$defs"][r["card"]]["properties"]) for r in registries}

    files = [ROOT / "data" / "registry.json"] + sorted((ROOT / "data" / "examples").glob("*.json"))
    problems, counts = [], {}
    for f in files:
        rel = f.relative_to(ROOT).as_posix()
        data = load(f)
        for e in sorted(validator.iter_errors(data), key=lambda e: [str(p) for p in e.absolute_path]):
            where = "/".join(str(p) for p in e.absolute_path) or "(root)"
            problems.append(f"{rel}: {where}: {e.message}")

        for where, text in strings(data):
            if XML_ILLEGAL.search(text):
                problems.append(f"{rel}: {where}: contains a control character that feeds cannot carry")
        ids = {}
        for r in registries:
            for i, entry in enumerate(data.get(r["key"], []) or []):
                if not isinstance(entry, dict):
                    continue
                where = f"{rel}: {r['key']}/{i}"
                eid = entry.get("id")
                if eid in ids:
                    problems.append(f"{where}: duplicate id '{eid}' (already used in {ids[eid]})")
                ids[eid] = r["key"]
                counts[entry.get("status", "?")] = counts.get(entry.get("status", "?"), 0) + 1

                card = entry.get("card") or {}
                for key, value in card.items():
                    if isinstance(value, str) and PLACEHOLDER.match(value):
                        problems.append(f"{where}: card field '{key}' is a placeholder ('{value.strip()}'), which the standard does not accept")
                if entry.get("status") == "released":
                    for key in card_keys[r["key"]]:
                        if not str(card.get(key, "")).strip():
                            problems.append(f"{where}: released entry is missing card field '{key}'")

                url = entry.get("url")
                if url and not re.match(r"^https?://", url) and not (ROOT / url.split("#")[0].split("?")[0]).exists():
                    problems.append(f"{where}: url '{url}' does not exist in the repository")

        keyed = {(r["key"], e.get("id")) for r in registries for e in (data.get(r["key"], []) or []) if isinstance(e, dict)}
        for r in registries:
            for i, entry in enumerate(data.get(r["key"], []) or []):
                if not isinstance(entry, dict):
                    continue
                where = f"{rel}: {r['key']}/{i}"
                target = entry.get("replaced_by")
                if target and target not in ids:
                    problems.append(f"{where}: replaced_by '{target}' is not an id in this file")
                for link in entry.get("related", []) or []:
                    if not link.get("site") and (link.get("registry"), link.get("id")) not in keyed:
                        problems.append(f"{where}: related entry {link.get('registry')}/{link.get('id')} does not exist")
                log = entry.get("changelog") or []
                versions = [c.get("version") for c in log]
                for v in sorted({v for v in versions if versions.count(v) > 1}):
                    problems.append(f"{where}: changelog lists version {v} more than once")
                for j, l in enumerate((entry.get("links") or []) + (entry.get("distributions") or [])):
                    if isinstance(l, dict) and isinstance(l.get("href"), str) and not safe_href(l["href"]):
                        problems.append(f"{where}: links/{j}: '{l['href']}' is not an http(s) or site address")
                if log and entry.get("version") and entry["version"] not in [c.get("version") for c in log]:
                    problems.append(f"{where}: changelog does not list the current version {entry['version']}")
                preview = entry.get("preview")
                if preview and not preview.startswith("https://") and not (ROOT / preview).exists():
                    problems.append(f"{where}: preview file '{preview}' does not exist")
                board = entry.get("leaderboard")
                if board:
                    metric_keys = [m["key"] for m in board.get("metrics", [])]
                    if len(metric_keys) != len(set(metric_keys)):
                        problems.append(f"{where}: leaderboard metric keys are not unique")
                    for j, res in enumerate(board.get("results", [])):
                        if isinstance(res.get("link"), str) and not safe_href(res["link"]):
                            problems.append(f"{where}: leaderboard result {j}: link '{res['link']}' is not an http(s) or site address")
                        unknown = set(res.get("scores", {})) - set(metric_keys)
                        if unknown:
                            problems.append(f"{where}: leaderboard result {j} scores unknown metrics {sorted(unknown)}")
                        ref = res.get("system_ref")
                        if ref and not ref.get("site") and (ref.get("registry"), ref.get("id")) not in keyed:
                            problems.append(f"{where}: leaderboard result {j} refers to missing entry {ref.get('registry')}/{ref.get('id')}")

    if problems:
        print(f"{len(problems)} problem(s):")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    summary = ", ".join(f"{n} {s}" for s, n in sorted(counts.items())) or "no entries"
    print(f"OK: {len(files)} file(s) valid ({summary})")


if __name__ == "__main__":
    main()
