"""Extract concept reading materials from the course export, in course order.

Usage: python3 pipeline/extract_reading_materials.py [src.json] [out.json]

Selection rules:
  - only LEARNING_SET units with MARKDOWN content whose name contains "Reading Material"
  - skip "Problem Solving" reading materials
  - skip videos / slides / iframes, NxtMock, Platform Walkthrough (not "Reading Material")
  - every unit is kept as its own entry; units sharing a title are NOT merged
  - content is copied verbatim from the source, then the course team's curation rules
    (content/curation.json) are applied: each rule cuts a material from one heading to the end
Ordering: topics by `order`, then array position; units the same way.
The output is plain course content and carries no game/story fields.
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Windows consoles default to cp1252 and would die on the em dash printed at the end — force UTF-8.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "intro_to_databases.json"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "content" / "reading_materials.json"
CURATION = ROOT / "content" / "curation.json"

IMG_RE = re.compile(r"""(?:src|imageSrc)\s*=\s*['"]([^'"]+)['"]""")
HEADING_RE = re.compile(r"^(#{1,6})\s*(.+?)\s*#*\s*$", re.M)
COMPONENT_RE = re.compile(r"<([A-Z][A-Za-z]{2,}[A-Za-z0-9]*)")  # skip notation like <T1>
# Fenced code blocks can contain '#' comments that are not headings
FENCE_RE = re.compile(r"```.*?```", re.S)


def clean_title(unit_name):
    title = re.sub(r"\|\s*Reading Material\s*$", "", unit_name).strip()
    return re.sub(r"\s+", " ", title.rstrip("| ").strip())


def headings(md):
    md = FENCE_RE.sub("", md)
    return [
        {"level": len(h), "text": re.sub(r"[*_`]", "", t).strip()}
        for h, t in HEADING_RE.findall(md)
    ]


def load_curation():
    if not CURATION.exists():
        return {}
    return {r["unit_id"]: r for r in json.loads(CURATION.read_text())["rules"]}


def truncate_from_heading(md, heading):
    """Cut the markdown at the start of the line holding `heading` (outside code fences)."""
    target = re.sub(r"[*_`]", "", heading).strip().lower()
    pos, in_fence = 0, False
    for line in md.splitlines(keepends=True):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
        m = None if in_fence else HEADING_RE.match(line.rstrip("\r\n"))
        if m and re.sub(r"[*_`]", "", m.group(2)).strip().lower() == target:
            return md[:pos]
        pos += len(line)
    raise ValueError(f"curation heading not found: {heading!r}")


def ordered(items):
    return [x for _, x in sorted(enumerate(items), key=lambda p: (p[1]["order"], p[0]))]


def candidate(unit):
    if unit["unit_type"] != "LEARNING_SET":
        return None, "not a learning set"
    name = unit.get("unit_name") or ""
    if "reading material" not in name.lower():
        return None, "not a reading material (video/slides/mock/walkthrough)"
    if "problem solving" in name.lower():
        return None, "problem solving reading material"
    contents = [c for c in unit["contents"] if c.get("content_type") == "MARKDOWN" and c.get("content")]
    if not contents:
        return None, "no markdown content"
    return contents, None


def main():
    course = json.loads(SRC.read_text())[0]
    curation = load_curation()
    applied = set()
    topics_out, excluded = [], []
    global_seq = 0

    for topic in ordered(course["topics"]):
        materials = []
        for unit in ordered(topic["units"]):
            contents, reason = candidate(unit)
            if reason:
                if unit["unit_type"] == "LEARNING_SET":
                    excluded.append({
                        "topic_name": topic["topic_name"],
                        "unit_id": unit["unit_id"],
                        "unit_name": unit.get("unit_name"),
                        "reason": reason,
                    })
                continue
            for res in contents:
                md = res["content"]
                curated = None
                rule = curation.get(unit["unit_id"])
                if rule:
                    original = len(md)
                    md = truncate_from_heading(md, rule["truncate_from_heading"])
                    if rule.get("also_remove_separator_above"):
                        md = re.sub(r"-{3,}[ \t]*(?:\r?\n)*$", "", md)   # drop the trailing --- line only
                    curated = {"removed_from_heading": rule["truncate_from_heading"],
                               "original_char_count": original, "removed_chars": original - len(md)}
                    applied.add(unit["unit_id"])
                global_seq += 1
                materials.append({
                    "sequence": len(materials) + 1,
                    "global_sequence": global_seq,
                    "title": clean_title(unit["unit_name"]),
                    "unit_id": unit["unit_id"],
                    "learning_resource_id": res["learning_resource_id"],
                    "source_unit_name": unit["unit_name"],
                    "source_order": unit["order"],
                    "source_unit_tags": [t["tag"] for t in unit["unit_tags"]],
                    "content_type": res["content_type"],
                    "content_language": res.get("content_language"),
                    "char_count": len(md),
                    "headings": headings(md),
                    "images": sorted(set(IMG_RE.findall(md))),
                    "components": sorted(set(COMPONENT_RE.findall(md))),
                    **({"curated": curated} if curated else {}),
                    "content_markdown": md,
                })

        # Informational only: point at other entries in the same topic with the same title
        for m in materials:
            m["same_title_unit_ids"] = [
                o["unit_id"] for o in materials
                if o is not m and o["title"].lower() == m["title"].lower()
            ]

        if materials:
            topics_out.append({
                "sequence": len(topics_out) + 1,
                "topic_id": topic["topic_id"],
                "topic_name": topic["topic_name"],
                "source_order": topic["order"],
                "reading_materials": materials,
            })

    out = {
        "course_id": course["course_id"],
        "course_title": course["course_title"],
        "source_file": SRC.name,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "selection_rules": [
            "LEARNING_SET units with MARKDOWN content and 'Reading Material' in the name",
            "Problem Solving reading materials excluded",
            "Videos, slides, iframes, NxtMock and Platform Walkthrough excluded",
            "MCQs, coding questions, quizzes and assessments excluded",
            "Every unit kept as a separate entry; same-title units are not merged",
            "content_markdown copied verbatim from the source, then content/curation.json applied (cuts from a heading to the end)",
            "Ordering: topic order then array position; unit order then array position",
        ],
        "stats": {
            "topics": len(topics_out),
            "reading_materials": global_seq,
            "total_chars": sum(m["char_count"] for t in topics_out for m in t["reading_materials"]),
            "excluded_learning_sets": len(excluded),
        },
        "curation": {"file": "content/curation.json", "applied_to_unit_ids": sorted(applied)},
        "topics": topics_out,
        "excluded": excluded,
    }
    missing = set(curation) - applied
    if missing:
        raise SystemExit(f"curation rules for unknown units: {sorted(missing)}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {OUT} — {out['stats']}")


if __name__ == "__main__":
    main()
