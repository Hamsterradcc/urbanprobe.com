# urbanprobe.com

Public research platform for urban data, maps, sensing, and computational city science. Static site served by GitHub Pages at <https://urbanprobe.com>. No build step is needed to serve it.

## Site map

| Page | Role |
| --- | --- |
| `index.html` | Entry point: the three registries, the common fields, principles, release process |
| `datasets.html` | Registry 01: released datasets and the dataset card fields |
| `indicators.html` | Registry 02: released indicators and the indicator card fields |
| `methods.html` | Registry 03: released methods and the method card fields |
| `entry.html` | One resource, rendered from the data: `entry.html?registry=<key>&id=<id>` |
| `standards.html` | The full resource standard: fields, release checklist, status and versioning, out of scope |
| `follow.html` | Subscription centre: every feed, how each channel works, how to stop |
| `404.html` | Not-found page |

Shared assets: `assets/site.css`, `assets/site.js`, `assets/palette.js`, `assets/follow.js`, `assets/follow.css`, and `assets/og.png` (social preview card).

## How the standard is kept in one place

`data/schema.json` is the single source of truth. Everything else follows from it.

```
data/schema.json ──► scripts/build.py ──► field lists in index, standards and registry pages
       │                              └─► .github/ISSUE_TEMPLATE/<registry>-entry.yml
       └──────────► scripts/validate.py ──► checks data/registry.json and data/examples/
                    assets/site.js ───────► reads both files to render lists and entry pages
```

- **Change a field**: edit `data/schema.json`, then run `python scripts/build.py`. It rewrites the content between `<!-- build:... -->` markers in the pages and regenerates the issue forms. Do not edit those blocks by hand.
- **Add a resource**: add an object to the right array in `data/registry.json`, then run `python scripts/validate.py`. Resources with `status: "draft"` are kept but not shown.
- **CI**: `.github/workflows/validate.yml` runs both scripts with `--check` on every push and pull request. `.github/workflows/releases.yml` creates GitHub Releases (see below).

### Resource fields

| Field | Required when | Notes |
| --- | --- | --- |
| `id`, `title`, `summary`, `status` | always | `id` is a lowercase slug used in the URL; `status` is `draft`, `released` or `deprecated` |
| `version`, `released` | released, deprecated | semantic version; ISO date |
| `authors`, `license`, `links`, `citation`, `card` | released | `links` is a list of `{label, href}`; the first link is the primary button |
| `card` fields | released | every field defined for the registry; placeholders such as "TBD" or "to follow" fail validation |
| `access`, `updated`, `tags`, `url`, `replaced_by`, `themes`, `cities`, `doi`, `usage`, `related`, `changelog`, `spatial_unit`, `period`, `formats`, `variables`, `preview`, `distributions` | optional | `access` states access conditions; `url` points to an external card; `replaced_by` names the id that supersedes a deprecated resource |

### Preview and examples

`data/examples/registry.json` holds one complete example per registry. It is never listed on the site, but it renders on the entry page for previewing the layout:

- `entry.html?registry=datasets&id=example-dataset&src=example`
- `entry.html?registry=indicators&id=example-indicator&src=example`

Local preview needs a static server, because the pages fetch JSON:

```
python -m http.server 8000
```

## Platform features

Shared by XUrbanAI and UrbanProbe (`assets/site.js`, `assets/palette.js`):

- **Faceted browsing** on every registry page: filters declared per registry in `x-registries[].facets` of the schema, with counts, search, sort, and the state kept in the URL.
- **Entry pages** in sections with an in-page navigation: the card, then whatever the entry provides:
  - `leaderboard` (benchmarks): sortable by any metric, baselines shown but not ranked, a verified-only toggle; systems that appear on a leaderboard show their results on their own page.
  - `preview` (a CSV sample of at most 1 MB): first rows and per-column statistics; `variables`: a data dictionary; `distributions`: files to download.
  - `usage`: a copyable snippet; `related`: links to other entries, shown in both directions using the labels in `x-relations`; `changelog`: a version timeline; `citation` plus a generated BibTeX entry; `doi`.
  - schema.org metadata (`Dataset` or `SoftwareSourceCode`), so dataset search engines can index entries.
- **Themes shared across the network**: `themes` uses the research themes of the City Computing Collective (`x-themes`); theme tags link to its theme hubs, which list these entries.
- **Command palette** (`Ctrl K` / `⌘K`): entries, registries, standard fields, themes, and proposal forms.
- **Follow**: a bell in the header, `follow.html`, a Follow button on the home page, every registry page and every entry page, and feeds for releases, each registry, each theme and each entry (see below).

The validator also checks that related entries and leaderboard systems exist, that scores use declared metrics, that changelogs list the current version once per version, that local previews exist, that no text contains a control character (feeds cannot carry them), and that links use `http(s)` or site addresses only.

## Following, feeds and releases

Visitors can follow what they care about by email, in a feed reader, or on GitHub. There is no server: every channel is either a static file on this site or a third-party service that reads those files. This site stores nothing about visitors.

### Feeds

`scripts/build.py` writes every feed from `data/registry.json` and `data/schema.json`. Feeds are RSS 2.0, newest first, at most 50 items, and deterministic: dates come from the data and never from the build time, so a file changes only when content changes. CI runs `python scripts/build.py --check`. All registry and theme feeds are written even when empty, so every advertised address works.

| File | What it contains |
| --- | --- |
| `feeds/releases.xml` | One item per released resource and changelog version (or one for the current version when there is no changelog), plus a "Deprecated: ..." item for deprecated resources |
| `feeds/datasets.xml`, `feeds/indicators.xml`, `feeds/methods.xml` | The same items for one registry |
| `feeds/theme-<slug>.xml` | The same items for one of the eight research themes, on this site only. The feed for the same theme across all four network sites is `https://urbanscience.ai/feeds/theme-<slug>.xml` |
| `feeds/entry-<registry>-<id>.xml` | One resource: its versions, its deprecation notice, and for benchmarks every leaderboard result ("New result on ...: ..."). Feeds of resources that no longer exist are deleted by the build |

Item guids are `urbanprobe-<registry>-<id>-v<version>`, `...-<id>-deprecated` and `...-<id>-result-<system>-<date>`, and are never reused. `sitemap.xml` is generated too: the static pages, `follow.html`, and one `entry.html?registry=...&id=...` with `lastmod` for every released resource.

To test feed generation with the example data without touching the real feeds, copy the repository to a scratch folder and run `python scripts/build.py --registry data/examples/registry.json` there. Do not commit the result.

### GitHub Releases

`scripts/releases.py` plans one GitHub Release for every released resource: tag `<registry>/<id>/v<version>`, title `<title> v<version>`, notes with the summary, the resource page, the changelog note for that version, and the citation. `python scripts/releases.py --dry-run` prints the plan and contacts nothing. Without `--dry-run` it creates the releases that do not exist yet with the GitHub CLI. It is safe to run again, and it never edits or deletes a release.

`.github/workflows/releases.yml` runs it on every push to `main` that changes `data/registry.json`, and on demand (`Run workflow`). It validates the data first, runs with `contents: write`, and uses `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.

Not yet verified: whether GitHub emails people who Watch the repository (Watch, Custom, Releases) about releases created by the workflow token. Check this once with a second GitHub account before telling visitors to rely on it.

### The follow dialog

`assets/follow.js` and `assets/follow.css` are the same on all four network sites. Any element with `data-follow` opens a dialog with the ways to follow it: email through Blogtrottr, copy-and-paste feed address, Feedly and Feedbin links, and a GitHub instruction. Attributes: `data-follow-title` (required), `data-follow-what`, `data-follow-feed`, `data-follow-github`, `data-follow-github-kind` (`discussions`, `releases` or `thread`), `data-follow-ics`, `data-follow-ics-name`, `data-follow-newsletter="true"`. Use an `<a href="follow.html">` as the trigger so the link still works without JavaScript. `window.Follow.open({title, feed, ...})` does the same from code. This site maps its own colours onto the component with the `--follow-*` custom properties at the end of `assets/site.css`.

### Subscription centre

`follow.html` lists everything that can be followed: all releases, each registry, each theme (with a link to the network feed for that theme), the weekly network digest, and an explanation of the four channels and of how to stop following. It is plain HTML, so it works without JavaScript. The rows are generated by `scripts/build.py` between `<!-- build:follow ... -->` markers, so they always match the schema. The header has a bell link to it (`aria-label="Follow updates"`), the footer links to it, and so does the command palette.

### Owner newsletter (off)

`data/follow.json` holds a hidden email-signup slot. While `newsletter.provider` is `null` nothing is shown. To switch it on, create a Buttondown account, then set `"provider": "buttondown"` and `"username"` to its username. The dialog then shows a plain HTML form for the buttons marked `data-follow-newsletter="true"` (all releases, the weekly digest). The form posts to Buttondown in a new tab and sends the site key as a tag; no JavaScript request is made.

### New since your last visit

`assets/site.js` keeps the time of the last visit in `localStorage` (`lastVisit`; `lastVisit:example` in preview mode) and writes it when the page is hidden. On a return visit, entries released after that day get a "New" badge and the list says how many are new. Nothing is shown on a first visit or when storage is blocked. The earlier time is read once per browser tab, so pages in the same visit agree.

### Preview mode

With `?src=example` every same-site page link keeps `src=example` (static links are rewritten when the page loads, and again whenever links are added), so a preview survives navigation. Do not put `src=example` in data files.

## Proposals, requests and corrections

Issue forms are generated from the schema, one per registry. A data-request form and a correction form are maintained by hand. Blank issues are disabled; general questions go to the City Computing Collective discussions.

## Reserved sections

- **Cases**: a case study packages one or more datasets, a method, and an interpretation for a single city question. Added as a fourth registry when the first case is ready.

## Editing

Pages share the same header, footer, and `<head>` block. When changing them, change every page. The footer lists the four sites of the network in the same order on every site: Urban Science AI Lab, UrbanProbe, XUrbanAI, City Computing Collective.
