#!/usr/bin/env python3
"""
Normalize Alembic migration revisions and filenames to short, uniform IDs.
- New revision id pattern: feature_0001, feature_0002, ... (ASCII, <= 32 chars)
- Updates each file's `revision` and `down_revision` accordingly
- Renames files to `<new_revision>.py`
- Generates a mapping report `backend/migrations/versions/_rev_map.json`

Usage:
  python scripts/normalize_migrations.py           # dry-run (default)
  python scripts/normalize_migrations.py --apply   # apply changes

Notes:
- Make sure you have a clean working tree or a backup before applying.
- After applying, you may need to `alembic stamp <new_head>` then `alembic upgrade head`.
- If your DB limits `alembic_version.version_num` to VARCHAR(32), these IDs fit.
"""

import argparse
import json
import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

ROOT = Path(__file__).resolve().parents[1]
VERSIONS_DIR = ROOT / "backend" / "migrations" / "versions"
MAP_FILE = VERSIONS_DIR / "_rev_map.json"

REV_RE = re.compile(r"^\s*revision\s*[:=]\s*['\"]([^'\"]+)['\"]", re.MULTILINE)
DOWN_RE = re.compile(r"^\s*down_revision\s*[:=]\s*(.+)$", re.MULTILINE)
# Docstring style (Alembic autogenerate sometimes uses header block)
DOC_REV_RE = re.compile(r"^Revision ID:\s*([\w\-\.]+)$", re.MULTILINE)
DOC_DOWN_RE = re.compile(r"^Revises:\s*(.+)$", re.MULTILINE)
STR_RE = re.compile(r"['\"]([^'\"]+)['\"]")
TUPLE_ITEMS_RE = re.compile(r"\(([^)]*)\)")

class Mig:
    def __init__(self, path: Path, revision: str, down: List[str]):
        self.path = path
        self.revision = revision
        self.down = down  # zero, one, or many
        self.new_rev: Optional[str] = None

    def __repr__(self) -> str:
        return f"Mig(rev={self.revision}, down={self.down}, file={self.path.name})"


def _parse_down_list_from_literal(raw: str) -> List[str]:
    raw = raw.strip()
    if not raw or raw.lower().startswith("none"):
        return []
    if raw.startswith("("):
        mt = TUPLE_ITEMS_RE.search(raw)
        if mt:
            items = mt.group(1)
            return [m.group(1) for m in STR_RE.finditer(items)]
        return []
    ms = STR_RE.search(raw)
    return [ms.group(1)] if ms else []


def parse_file(path: Path) -> Optional[Mig]:
    text = path.read_text(encoding="utf-8", errors="ignore")

    # Try python variable style first
    mrev = REV_RE.search(text)
    if mrev:
        revision = mrev.group(1).strip()
        mdown = DOWN_RE.search(text)
        downs: List[str] = _parse_down_list_from_literal(mdown.group(1)) if mdown else []
        return Mig(path, revision, downs)

    # Fallback to docstring header style
    drev = DOC_REV_RE.search(text)
    if not drev:
        return None
    revision = drev.group(1).strip()
    ddown = DOC_DOWN_RE.search(text)
    downs: List[str] = []
    if ddown:
        raw = ddown.group(1).strip()
        # Could be tuple-like in string or comma separated quoted revs
        # Normalize: extract all quoted tokens, else single token word
        quoted = STR_RE.findall(raw)
        if quoted:
            downs = quoted
        else:
            # maybe comma separated without quotes
            parts = [p.strip() for p in raw.strip("() ").split(',') if p.strip() and p.strip().lower() != 'none']
            downs = parts
    return Mig(path, revision, downs)


def topo_sort(migs: Dict[str, Mig]) -> List[Mig]:
    # Kahn's algorithm
    incoming: Dict[str, int] = {r: 0 for r in migs}
    children: Dict[str, Set[str]] = {r: set() for r in migs}
    for r, m in migs.items():
        for d in m.down:
            if d in migs:
                incoming[r] += 1
                children[d].add(r)
            else:
                # dangling dependency; ignore for order, but keep count minimal
                pass
    queue = [migs[r] for r, c in incoming.items() if c == 0]
    order: List[Mig] = []
    while queue:
        n = queue.pop(0)
        order.append(n)
        for ch in children.get(n.revision, set()):
            incoming[ch] -= 1
            if incoming[ch] == 0:
                queue.append(migs[ch])
    # append any remaining (cycles/merges) in deterministic order
    seen = {m.revision for m in order}
    for r in migs:
        if r not in seen:
            order.append(migs[r])
    return order


def assign_new_ids(order: List[Mig]) -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    for idx, m in enumerate(order, start=1):
        new_id = f"feature_{idx:04d}"
        m.new_rev = new_id
        mapping[m.revision] = new_id
    return mapping


def rewrite_content(text: str, old_to_new: Dict[str, str]) -> str:
    # replace revision
    def repl_rev(match: re.Match) -> str:
        old = match.group(1)
        new = old_to_new.get(old, old)
        return match.group(0).replace(old, new)

    text = REV_RE.sub(repl_rev, text)

    # replace down_revision (string or tuple)
    def repl_down(match: re.Match) -> str:
        raw = match.group(1)
        # string literal
        ms = STR_RE.findall(raw)
        if not ms:
            return match.group(0)
        replaced = raw
        for s in ms:
            if s in old_to_new:
                replaced = replaced.replace(f"'{s}'", f"'{old_to_new[s]}'")
                replaced = replaced.replace(f'"{s}"', f'"{old_to_new[s]}"')
        return match.group(0).replace(raw, replaced)

    text = DOWN_RE.sub(repl_down, text)

    # Docstring header replacements
    def repl_doc_rev(m: re.Match) -> str:
        old = m.group(1)
        new = old_to_new.get(old, old)
        return m.group(0).replace(old, new)

    text = DOC_REV_RE.sub(repl_doc_rev, text)

    def repl_doc_down(m: re.Match) -> str:
        raw = m.group(1)
        # Replace quoted tokens if present
        ms = STR_RE.findall(raw)
        replaced = raw
        if ms:
            for s in ms:
                if s in old_to_new:
                    replaced = replaced.replace(f"'{s}'", f"'{old_to_new[s]}'")
                    replaced = replaced.replace(f'"{s}"', f'"{old_to_new[s]}"')
        else:
            # space/comma separated
            tokens = [t.strip() for t in raw.strip().split(',')]
            new_tokens = [old_to_new.get(t, t) for t in tokens]
            replaced = ', '.join(new_tokens)
        return m.group(0).replace(raw, replaced)

    text = DOC_DOWN_RE.sub(repl_doc_down, text)
    return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="apply changes (default is dry-run)")
    args = ap.parse_args()

    if not VERSIONS_DIR.exists():
        print(f"❌ versions dir not found: {VERSIONS_DIR}")
        return

    files = sorted([p for p in VERSIONS_DIR.glob("*.py") if p.name != "__init__.py"])
    migs: Dict[str, Mig] = {}
    for f in files:
        m = parse_file(f)
        if not m:
            print(f"⚠️ skip (no revision): {f.name}")
            continue
        if m.revision in migs:
            print(f"⚠️ duplicate revision {m.revision} in {f.name} (already in {migs[m.revision].path.name})")
        migs[m.revision] = m

    if not migs:
        print("ℹ️ no migration files found")
        return

    order = topo_sort(migs)
    mapping = assign_new_ids(order)

    print("📋 Planned revision mapping (old → new):")
    for m in order:
        print(f"  {m.revision} → {m.new_rev}")

    # simulate rewrites
    changes: List[Tuple[Path, Path]] = []
    for m in order:
        text = m.path.read_text(encoding="utf-8", errors="ignore")
        new_text = rewrite_content(text, mapping)
        new_name = f"{m.new_rev}.py"
        new_path = m.path.with_name(new_name)
        if new_text != text or new_path.name != m.path.name:
            changes.append((m.path, new_path))

    print(f"\n🧩 Files to rewrite/rename: {len(changes)}")
    for src, dst in changes:
        print(f"  {src.name} -> {dst.name}")

    # write mapping file
    mapping_json = {m.revision: m.new_rev for m in order}
    if not args.apply:
        print("\n🔎 Dry-run only. Use --apply to perform changes.")
        print(f"💡 A mapping file will be written on apply to: {MAP_FILE}")
        return

    # Apply changes
    # 1) write mapping
    VERSIONS_DIR.mkdir(parents=True, exist_ok=True)
    MAP_FILE.write_text(json.dumps(mapping_json, ensure_ascii=False, indent=2), encoding="utf-8")

    # 2) rewrite files and rename
    for m in order:
        path = m.path
        text = path.read_text(encoding="utf-8", errors="ignore")
        new_text = rewrite_content(text, mapping)
        new_name = f"{m.new_rev}.py"
        new_path = path.with_name(new_name)
        if new_text != text:
            path.write_text(new_text, encoding="utf-8")
        if new_path.name != path.name:
            # avoid overwrite conflicts by staging temp rename if needed
            if new_path.exists() and new_path != path:
                new_path.unlink()
            os.replace(path, new_path)
            m.path = new_path

    print(f"\n✅ Applied. Mapping saved to: {MAP_FILE}")
    print("📌 Next steps:")
    print("  1) If needed, update DB alembic_version to new head using stamp:")
    print("     cd backend && alembic stamp head && alembic upgrade head")
    print("  2) If you had multiple heads, use `alembic heads` to verify after normalization.")

if __name__ == "__main__":
    main()
