# urbanprobe.com

Public research platform for urban data, maps, sensing, and computational city science. Static site served by GitHub Pages at <https://urbanprobe.com>.

## Site map

| Page | Role |
| --- | --- |
| `index.html` | Entry point: the three registries, the common resource standard, principles, release process |
| `datasets.html` | Registry 01 — released datasets and map layers, plus the dataset card fields |
| `indicators.html` | Registry 02 — released indicators, plus the indicator card fields |
| `methods.html` | Registry 03 — released methods, plus the method card fields |
| `standards.html` | The full resource standard: common fields, per-registry fields, release checklist, status and versioning, out of scope |
| `404.html` | Not-found page (served by GitHub Pages) |

Shared assets: `assets/site.css` (one stylesheet for every page) and `assets/site.js` (mobile navigation and registry rendering). No build step and no external dependencies.

## Registry data

`data/registry.json` is the single source of truth for resources. Each registry page renders its list from this file; the index shows entry counts. With no entries the pages show their built-in empty state, so the site works without the file or without JavaScript.

```json
{
  "datasets": [
    {
      "id": "example-dataset",
      "title": "Example dataset",
      "summary": "One sentence on what the dataset covers.",
      "status": "released",
      "version": "1.0.0",
      "released": "2026-01-01",
      "url": "entries/datasets/example-dataset.html",
      "tags": ["city", "years", "unit"]
    }
  ],
  "indicators": [],
  "methods": []
}
```

- `status` is one of `draft`, `released`, `deprecated`. Drafts are kept in the file but not shown.
- `url` points at the resource card. Reserve `entries/<registry>/<id>.html` for cards hosted here; external cards may link out.
- Fields the card must contain are listed on `standards.html`.

## Division of labour between the sites

UrbanProbe holds data, indicators, and methods. Models, agents, and benchmarks go to <https://xurbanai.com>; the research agenda sits at <https://urbanscience.ai>; community discussion runs through <https://citycomputingcollective.com>.

## Reserved sections

- **Cases** — a case study packages one or more datasets, a method, and an interpretation for a single city question. Added as a fourth registry when the first case is ready.

## Editing

Pages share the same header, footer, and `<head>` block. When changing them, change every page. Navigation marks the current page with `aria-current="page"`.
