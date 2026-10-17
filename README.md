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
| `404.html` | Not-found page |

Shared assets: `assets/site.css`, `assets/site.js`, and `assets/og.png` (social preview card).

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
- **CI**: `.github/workflows/validate.yml` runs both scripts with `--check` on every push and pull request.

### Resource fields

| Field | Required when | Notes |
| --- | --- | --- |
| `id`, `title`, `summary`, `status` | always | `id` is a lowercase slug used in the URL; `status` is `draft`, `released` or `deprecated` |
| `version`, `released` | released, deprecated | semantic version; ISO date |
| `authors`, `license`, `links`, `citation`, `card` | released | `links` is a list of `{label, href}`; the first link is the primary button |
| `card` fields | released | every field defined for the registry; placeholders such as "TBD" or "to follow" fail validation |
| `access`, `updated`, `tags`, `url`, `replaced_by` | optional | `access` states access conditions; `url` points to an external card; `replaced_by` names the id that supersedes a deprecated resource |

### Preview and examples

`data/examples/registry.json` holds one complete example per registry. It is never listed on the site, but it renders on the entry page for previewing the layout:

- `entry.html?registry=datasets&id=example-dataset&src=example`
- `entry.html?registry=indicators&id=example-indicator&src=example`

Local preview needs a static server, because the pages fetch JSON:

```
python -m http.server 8000
```

## Proposals, requests and corrections

Issue forms are generated from the schema, one per registry. A data-request form and a correction form are maintained by hand. Blank issues are disabled; general questions go to the City Computing Collective discussions.

## Reserved sections

- **Cases**: a case study packages one or more datasets, a method, and an interpretation for a single city question. Added as a fourth registry when the first case is ready.

## Editing

Pages share the same header, footer, and `<head>` block. When changing them, change every page. The footer lists the four sites of the network in the same order on every site: Urban Science AI Lab, UrbanProbe, XUrbanAI, City Computing Collective.
