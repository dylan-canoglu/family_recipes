#!/usr/bin/env python3
"""Parse a structured recipe markdown catalog into recipes.json."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

META_RE = re.compile(r"^-\s*\*\*(?P<label>[^*]+):\*\*\s*(?P<value>.*)\s*$")
TIME_RE = re.compile(
    r"Prep:\s*(?P<prep>\d+)\s*mins?\s*\|\s*Cook:\s*(?P<cook>\d+)\s*mins?\s*\|\s*Total:\s*(?P<total>\d+)\s*mins?",
    re.IGNORECASE,
)
SECTION_RE = re.compile(
    r"^###\s+(?P<name>Ingredients|Instructions(?:\s*\(Recipe\))?|Other Notes)\s*$",
    re.IGNORECASE | re.MULTILINE,
)
HEADING_RE = re.compile(r"^##\s+(?P<title>.+?)\s*$", re.MULTILINE)
H1_RE = re.compile(r"^#\s+", re.MULTILINE)
LEADING_MARKER_RE = re.compile(r"^(?:[-*+•]|\d+[.)]|->)\s+")

INGREDIENT_WRAPPERS = {
    "ingredients",
    "ingredient",
    "ingrédients",
    "ingrédient",
    "malzemeler",
    "malzeme",
}
INSTRUCTION_WRAPPERS = {
    "directions",
    "direction",
    "instructions",
    "instruction",
    "yapılışı",
    "préparation",
    "preparation",
}
NOTES_WRAPPERS = {
    "notes",
    "note",
    "english notes",
    "original notes",
}
SKIP_ENTIRE_LINES = {
    "none",
    "none listed in source",
    "english translation",
    "english notes",
}
INGREDIENT_META_LABELS = {
    "préparation",
    "preparation",
    "cuisson",
    "pour",
    "prep time",
    "cook time",
    "servings",
}


def resolve_input(path: str | None) -> Path:
    if path:
        candidate = Path(path)
        if not candidate.exists():
            raise FileNotFoundError(f"Input file not found: {candidate}")
        return candidate

    for name in ("recipes.md", "organized-recipes-v3.md"):
        candidate = Path(name)
        if candidate.exists():
            return candidate

    raise FileNotFoundError(
        "Could not find recipes.md or organized-recipes-v3.md. "
        "Pass an input path explicitly."
    )


def strip_md_emphasis(text: str) -> str:
    prev = None
    while prev != text:
        prev = text
        text = text.strip()
        text = re.sub(r"^\*\*(.+?)\*\*$", r"\1", text)
        text = re.sub(r"^\*(.+?)\*$", r"\1", text)
        text = re.sub(r"^_(.+?)_$", r"\1", text)
    return text.strip()


def unwrap_inline_emphasis(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"\1", text)
    return text.strip()


def strip_leading_markers(line: str) -> str:
    text = line.strip()
    while True:
        updated = LEADING_MARKER_RE.sub("", text).strip()
        if updated == text:
            break
        text = updated
    return text


def split_label(text: str) -> tuple[str | None, str]:
    match = re.match(r"^([^:]{1,60}):\s*(.*)$", text)
    if not match:
        return None, text
    return match.group(1).strip(), match.group(2).strip()


def normalize_key(text: str) -> str:
    return re.sub(r"[.:]+$", "", text.strip()).lower()


def clean_line(line: str) -> str | None:
    text = line.strip()
    if not text or text == "---":
        return None

    text = strip_leading_markers(text)
    text = strip_md_emphasis(text)
    text = unwrap_inline_emphasis(text)
    text = re.sub(r"\s+", " ", text).strip()
    text = text.strip(" \t")

    if not text or text == "---":
        return None
    return text


def is_skip_line(
    text: str,
    wrappers: set[str],
    meta_labels: set[str] | None = None,
) -> bool:
    if normalize_key(text) in SKIP_ENTIRE_LINES:
        return True

    label, rest = split_label(text)
    if not label:
        return False

    key = normalize_key(label)
    if key in SKIP_ENTIRE_LINES and not rest:
        return True
    if key in wrappers and not rest:
        return True
    if meta_labels and key in meta_labels:
        return True
    return False


def peel_wrapper(text: str, wrappers: set[str]) -> str:
    label, rest = split_label(text)
    if label and normalize_key(label) in wrappers:
        return rest
    return text


def parse_list_block(
    block: str,
    wrappers: set[str],
    meta_labels: set[str] | None = None,
) -> list[str]:
    items: list[str] = []
    for raw_line in block.splitlines():
        cleaned = clean_line(raw_line)
        if cleaned is None:
            continue
        if is_skip_line(cleaned, wrappers, meta_labels):
            continue
        peeled = peel_wrapper(cleaned, wrappers)
        if not peeled:
            continue
        if is_skip_line(peeled, wrappers, meta_labels):
            continue
        items.append(peeled)
    return items


def parse_notes(block: str) -> str | None:
    items = parse_list_block(block, NOTES_WRAPPERS)
    if not items:
        return None
    notes = " ".join(items).strip()
    return notes or None


def extract_metadata(header: str) -> dict[str, str]:
    meta: dict[str, str] = {}
    for line in header.splitlines():
        match = META_RE.match(line.strip())
        if match:
            meta[match.group("label").strip().lower()] = match.group("value").strip()
    return meta


def parse_times(estimated: str | None) -> tuple[int | None, int | None, int | None]:
    if not estimated:
        return None, None, None
    match = TIME_RE.search(estimated)
    if not match:
        return None, None, None
    return (
        int(match.group("prep")),
        int(match.group("cook")),
        int(match.group("total")),
    )


def split_sections(body: str) -> tuple[str, dict[str, str]]:
    matches = list(SECTION_RE.finditer(body))
    header = body[: matches[0].start()] if matches else body
    sections: dict[str, str] = {}

    for index, match in enumerate(matches):
        name = match.group("name").lower()
        if name.startswith("ingredient"):
            key = "ingredients"
        elif name.startswith("instruction"):
            key = "instructions"
        else:
            key = "notes"

        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        sections[key] = body[start:end].strip()

    return header.strip(), sections


def normalize_title(title: str) -> str:
    return title.strip().rstrip(":").strip()


def parse_recipe(title: str, body: str) -> dict | None:
    body = H1_RE.split(body, maxsplit=1)[0].strip()
    header, sections = split_sections(body)
    meta = extract_metadata(header)

    cuisine = meta.get("cuisine type", "").strip()
    dish_type = meta.get("dish type", "").strip()
    complexity = meta.get("complexity level", "").strip()

    if not cuisine and not dish_type:
        return None

    prep_time, cook_time, total_time = parse_times(meta.get("estimated time"))

    return {
        "title": normalize_title(title),
        "cuisine": cuisine,
        "dish_type": dish_type,
        "prep_time_min": prep_time,
        "cook_time_min": cook_time,
        "total_time_min": total_time,
        "complexity": complexity,
        "ingredients": parse_list_block(
            sections.get("ingredients", ""),
            INGREDIENT_WRAPPERS,
            INGREDIENT_META_LABELS,
        ),
        "instructions": parse_list_block(
            sections.get("instructions", ""),
            INSTRUCTION_WRAPPERS,
        ),
        "notes": parse_notes(sections.get("notes", "")),
    }


def parse_recipes(markdown: str) -> list[dict]:
    matches = list(HEADING_RE.finditer(markdown))
    recipes: list[dict] = []

    for index, match in enumerate(matches):
        title = match.group("title")
        if title.strip().lower() == "table of contents":
            continue

        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        recipe = parse_recipe(title, markdown[start:end])
        if recipe:
            recipes.append(recipe)

    return recipes


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract recipes.md into recipes.json")
    parser.add_argument("input", nargs="?", help="Markdown catalog (default: recipes.md)")
    parser.add_argument("output", nargs="?", default="recipes.json", help="JSON output path")
    args = parser.parse_args(argv)

    input_path = resolve_input(args.input)
    output_path = Path(args.output)
    markdown = input_path.read_text(encoding="utf-8")
    recipes = parse_recipes(markdown)

    output_path.write_text(
        json.dumps(recipes, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Read {input_path}")
    print(f"Wrote {len(recipes)} recipes to {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
