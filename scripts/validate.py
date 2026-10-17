#!/usr/bin/env python3
"""Check registry data against data/schema.json and the rules the standard states in prose.

Checks data/registry.json and every file in data/examples/:
  * JSON Schema validation (draft 2020-12), including date formats
  * unique ids across all registries in a file
  * released entries fill every card field, and no field is a placeholder ("TBD", "to follow", ...)
  * replaced_by points at an existing id; local card URLs exist in the repository

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
PLACEHOLDER = re.compile(r"^\s*(tbd|tba|todo|to follow|to be added|coming soon|n/?a|none yet|-+|…|\.\.\.)\s*[.!]?\s*$", re.I)


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


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

        for r in registries:
            for i, entry in enumerate(data.get(r["key"], []) or []):
                target = isinstance(entry, dict) and entry.get("replaced_by")
                if target and target not in ids:
                    problems.append(f"{rel}: {r['key']}/{i}: replaced_by '{target}' is not an id in this file")

    if problems:
        print(f"{len(problems)} problem(s):")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    summary = ", ".join(f"{n} {s}" for s, n in sorted(counts.items())) or "no entries"
    print(f"OK: {len(files)} file(s) valid ({summary})")


if __name__ == "__main__":
    main()
