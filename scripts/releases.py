#!/usr/bin/env python3
"""Create one GitHub Release for every released entry, so people can follow the registry with GitHub Watch.

For each entry with status "released" this script works out a release:

    tag    {registry}/{id}/v{version}        e.g. models/example-model/v1.0.0
    title  {title} v{version}
    notes  summary, link to the entry page, the changelog note for this version, and the citation

Without --dry-run it creates the releases that do not exist yet with the GitHub CLI (gh release create). It is safe to run
again: a tag that already has a release is skipped. It never edits and never deletes a release.

Usage:
    python scripts/releases.py --dry-run               # print the plan; creates nothing
    python scripts/releases.py                         # create the missing releases (needs gh and GH_TOKEN)
    python scripts/releases.py --registry PATH         # plan from another registry file (testing; use with --dry-run)
    python scripts/releases.py --sha SHA --repo OWNER/NAME

The target commit defaults to $GITHUB_SHA, then to the current git HEAD. The repository defaults to
$GITHUB_REPOSITORY, then to the repo in data/schema.json.

Standard library only, plus the gh command line tool when not using --dry-run.
"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / "data" / "schema.json").read_text(encoding="utf-8"))
SITE = SCHEMA["x-site"]
REGISTRIES = SCHEMA["x-registries"]


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def plan(data):
    """Return one dict per release that should exist, in a stable order."""
    out = []
    for r in REGISTRIES:
        for e in sorted(data.get(r["key"], []) or [], key=lambda x: x.get("id", "")):
            if e.get("status") != "released" or not e.get("version"):
                continue
            version = e["version"]
            note = next((c["note"] for c in e.get("changelog", []) or [] if c.get("version") == version), None)
            page = f"{SITE['url']}/entry.html?registry={r['key']}&id={e['id']}"
            lines = [e.get("summary", ""), "", f"Entry page: {page}"]
            if note:
                lines += ["", f"Changes in v{version}: {note}"]
            if e.get("citation"):
                lines += ["", "How to cite:", "", e["citation"]]
            out.append({"tag": f"{r['key']}/{e['id']}/v{version}", "title": f"{e['title']} v{version}", "notes": "\n".join(lines).strip() + "\n"})
    return out


def exists(repo, tag):
    """True or False when GitHub answers; None when it cannot be checked (no gh, no network, no token)."""
    try:
        res = subprocess.run(["gh", "release", "view", tag, "--repo", repo], capture_output=True, text=True)
    except FileNotFoundError:
        return None
    if res.returncode == 0:
        return True
    if "release not found" in (res.stderr or "").lower():
        return False
    return None


def head_sha():
    if os.environ.get("GITHUB_SHA"):
        return os.environ["GITHUB_SHA"]
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True, cwd=ROOT).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def main():
    dry = "--dry-run" in sys.argv
    registry = pathlib.Path(arg("--registry", ROOT / "data" / "registry.json"))
    data = json.loads(registry.read_text(encoding="utf-8"))
    repo = arg("--repo") or os.environ.get("GITHUB_REPOSITORY") or SITE["repo"].replace("https://github.com/", "")
    sha = arg("--sha") or head_sha()
    releases = plan(data)
    print(f"{len(releases)} released entr{'y' if len(releases) == 1 else 'ies'} in {registry.name}; repository {repo}; target {sha[:12] or 'unknown'}")

    created = failed = 0
    for rel in releases:
        state = None if dry else exists(repo, rel["tag"])  # a dry run never contacts GitHub
        if dry:
            print(f"  {rel['tag']}  ->  {rel['title']}  [would be created unless a release with this tag already exists]")
            print("    " + rel["notes"].strip().replace("\n", "\n    "))
            continue
        if state is True:
            print(f"  skip   {rel['tag']} (release exists)")
            continue
        if state is None:
            print(f"  ERROR  {rel['tag']}: could not check GitHub; not creating it", file=sys.stderr)
            failed += 1
            continue
        if not sha:
            print("  ERROR  no target commit; pass --sha or run inside a git checkout", file=sys.stderr)
            sys.exit(1)
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8", newline="\n") as f:
            f.write(rel["notes"])
            notes_path = f.name
        try:
            res = subprocess.run(["gh", "release", "create", rel["tag"], "--repo", repo, "--target", sha, "--title", rel["title"],
                                  "--notes-file", notes_path, "--latest=false"], capture_output=True, text=True)
        finally:
            os.unlink(notes_path)
        if res.returncode == 0:
            print(f"  create {rel['tag']}")
            created += 1
        else:
            print(f"  ERROR  {rel['tag']}: {res.stderr.strip()}", file=sys.stderr)
            failed += 1
    if not dry:
        print(f"Created {created}, failed {failed}.")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
