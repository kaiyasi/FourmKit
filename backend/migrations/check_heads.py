#!/usr/bin/env python3
"""
Quick Alembic heads checker without requiring Alembic installed.
Parses migration files under backend/migrations/versions to build a DAG and
prints current revisions, parents, and computed heads.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path
from typing import Dict, List, Set


def parse_revisions(versions_dir: Path) -> tuple[Dict[str, List[str]], Dict[str, Path]]:
    rev_parents: Dict[str, List[str]] = {}
    rev_files: Dict[str, Path] = {}
    # Support both: revision = 'x' and revision: str = 'x'
    rx_rev = re.compile(r"^revision(?:\s*:\s*[^=\n]+)?\s*=\s*['\"]([A-Za-z0-9_\-]+)['\"]", re.M)
    rx_down = re.compile(r"^down_revision(?:\s*:\s*[^=\n]+)?\s*=\s*(?:\[([^\]]*)\]|['\"]([^'\"]*)['\"])", re.M)

    for py in sorted(versions_dir.glob("*.py")):
        if py.name == "__init__.py":
            continue
        text = py.read_text(encoding="utf-8", errors="ignore")
        m_rev = rx_rev.search(text)
        if not m_rev:
            continue
        revision = m_rev.group(1).strip()
        parents: List[str] = []
        m_down = rx_down.search(text)
        if m_down:
            if m_down.group(1):
                # list style: [ 'a', 'b' ]
                inner = m_down.group(1)
                parents = [p.strip().strip("'\" ") for p in inner.split(',') if p.strip()]
            else:
                # single string
                val = (m_down.group(2) or '').strip()
                if val:
                    parents = [val]
        rev_parents[revision] = parents
        rev_files[revision] = py

    return rev_parents, rev_files


def compute_heads(rev_parents: Dict[str, List[str]]) -> Set[str]:
    all_revs: Set[str] = set(rev_parents.keys())
    all_parents: Set[str] = set(p for parents in rev_parents.values() for p in parents if p)
    # Heads are those which are not referenced as a parent
    return all_revs - all_parents


def main() -> int:
    root = Path(__file__).resolve().parents[0]
    versions = root / "versions"
    if not versions.exists():
        print(f"❌ versions directory not found: {versions}")
        return 2

    rev_parents, rev_files = parse_revisions(versions)
    if not rev_parents:
        print("⚠️  No migration files found.")
        return 0

    print("📦 Loaded migrations:")
    for rev, parents in sorted(rev_parents.items()):
        parent_str = ", ".join(parents) if parents else "<base>"
        print(f" - {rev}  (down_revision: {parent_str})  [{rev_files[rev].name}]")

    heads = compute_heads(rev_parents)
    print("\n🧠 Computed heads:")
    for h in sorted(heads):
        print(f" - {h}")

    if len(heads) == 0:
        print("\n✅ Looks consistent (no heads found) – check definitions.")
    elif len(heads) == 1:
        print("\n✅ Single head – migration chain is linear.")
    else:
        print("\n⚠️ Multiple heads detected. You should merge them:")
        print("   Example: alembic -c backend/alembic.ini merge -m 'merge heads' " + " ".join(sorted(heads)))

    # Suggest next steps
    print("\n👉 Common commands:")
    print("   alembic -c backend/alembic.ini heads -v")
    print("   alembic -c backend/alembic.ini current -v")
    print("   alembic -c backend/alembic.ini upgrade head")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
