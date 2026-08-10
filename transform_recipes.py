#!/usr/bin/env python3
"""Normalize recipes.json into a PostgreSQL-ready schema (recipes_v4.json).

Rules
-----
Title
    Strip source annotations (page side, sticky notes, websites, author tags).
    Strip dish-type prefixes like "Appetizer:".
    Drop page-number parentheses and duplicate bilingual duplicates.
    Title-case ALL-CAPS English names. Extract servings from the title when present.

Cuisine
    "International / Not Specified" → "International".

Dish type
    "Appetizer / Salad / Side" → "Appetizer"
    "Dough / Pastry" → "Dough"
    "Sauce / Dressing" → "Sauce"
    Other values kept as-is (Dessert, Main Dish, Soup, Other).

Times / complexity
    Passed through. Missing times stay null.

base_servings
    Taken from title (Serves / Yields / personnes) or notes (Servings / Yields).
    Defaults to 4.

Ingredients
    Prefer the English block when a recipe is bilingual.
    Skip language/section headers and stray direction sentences.
    Split comma / "OR" / "+" lists when segments look like separate ingredients.
    Parse quantity, optional quantity_max (ranges), unit, item, item_key, note.
    Unparseable lines are still emitted with null quantity/unit.

Instructions
    Prefer English. Join remaining steps into a single string (null if empty).

Notes
    Keep real commentary. Drop prep/cook/servings metadata after extraction.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

DEFAULT_SERVINGS = 4

DISH_TYPE_MAP = {
    "appetizer / salad / side": "Appetizer",
    "dessert": "Dessert",
    "dough / pastry": "Dough",
    "main dish": "Main Dish",
    "other": "Other",
    "sauce / dressing": "Sauce",
    "soup": "Soup",
}

CUISINE_MAP = {
    "international / not specified": "International",
    "not specified": "International",
    "": "International",
}

UNICODE_FRACTIONS = {
    "¼": 0.25,
    "½": 0.5,
    "¾": 0.75,
    "⅓": 1 / 3,
    "⅔": 2 / 3,
    "⅛": 0.125,
    "⅜": 0.375,
    "⅝": 0.625,
    "⅞": 0.875,
    "⅕": 0.2,
    "⅖": 0.4,
    "⅗": 0.6,
    "⅘": 0.8,
}

NUMBER_RE = (
    r"(?:\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d+(?:[.,]\d+)?|"
    + "|".join(re.escape(ch) for ch in UNICODE_FRACTIONS)
    + r")"
)

UNIT_CANONICAL: list[tuple[str, str]] = [
    (r"c\.?\s*à\s*soupe", "tbsp"),
    (r"c\.?\s*a\s*soupe", "tbsp"),
    (r"cuill[eè]res?\s+à\s+soupe", "tbsp"),
    (r"yemek\s+ka[sş][iı][gğ][iı]", "tbsp"),
    (r"tablespoons?", "tbsp"),
    (r"tbsps?", "tbsp"),
    (r"tbsp\.?", "tbsp"),
    (r"big\s+spoons?", "tbsp"),
    (r"c\.?\s*à\s*caf[eé]", "tsp"),
    (r"c\.?\s*a\s*caf[eé]", "tsp"),
    (r"cuill[eè]res?\s+à\s+caf[eé]", "tsp"),
    (r"[cç]ay\s+ka[sş][iı][gğ][iı]", "tsp"),
    (r"teaspoons?", "tsp"),
    (r"tsps?", "tsp"),
    (r"tsp\.?", "tsp"),
    (r"c\.\s*caf[eé]", "tsp"),
    (r"c\.\s*soupe", "tbsp"),
    (r"spoons?", "tbsp"),
    (r"cuill[eè]res?", "tbsp"),
    (r"glass(?:es)?", "glass"),
    (r"verres?", "glass"),
    (r"su\s+barda[gğ][iı]", "cup"),
    (r"barda[gğ][iı]", "glass"),
    (r"sachets?", "sachet"),
    (r"packets?", "sachet"),
    (r"packages?", "package"),
    (r"pkgs?", "package"),
    (r"pinch(?:es)?", "pinch"),
    (r"pinc[eé]es?", "pinch"),
    (r"pieces?", "piece"),
    (r"pcs?\.?", "piece"),
    (r"adet", "piece"),
    (r"cloves?", "clove"),
    (r"gousses?", "clove"),
    (r"cups?", "cup"),
    (r"ounces?", "oz"),
    (r"oz\.?", "oz"),
    (r"pounds?", "lb"),
    (r"lbs?\.?", "lb"),
    (r"kilograms?", "kg"),
    (r"kg\.?", "kg"),
    (r"grammes?", "g"),
    (r"grams?", "g"),
    (r"grs?\.?", "g"),
    (r"millilitres?", "ml"),
    (r"milliliters?", "ml"),
    (r"ml\.?", "ml"),
    (r"centilitres?", "cl"),
    (r"cl\.?", "cl"),
    (r"d[eé]cilitres?", "dl"),
    (r"dl\.?", "dl"),
    (r"litres?", "l"),
    (r"liters?", "l"),
    (r"sheets?", "sheet"),
    (r"bunch(?:es)?", "bunch"),
    (r"bouquets?", "bunch"),
    (r"slices?", "slice"),
    (r"tranches?", "slice"),
    (r"jars?", "jar"),
    (r"pots?", "jar"),
    (r"cans?", "can"),
    (r"bo[iî]tes?", "can"),
    (r"handfuls?", "handful"),
    (r"sticks?", "stick"),
    (r"quarts?", "quart"),
    (r"pints?", "pint"),
    (r"l(?![a-z])", "l"),
    (r"g(?![a-z])", "g"),
]

UNIT_PATTERN = "(?:%s)" % "|".join(pat for pat, _ in UNIT_CANONICAL)
UNIT_LOOKUP = [(re.compile(rf"^{pat}$", re.I), canon) for pat, canon in UNIT_CANONICAL]

PREP_MODIFIERS = {
    "grated", "diced", "minced", "chopped", "sliced", "melted", "softened",
    "beaten", "crushed", "pitted", "peeled", "fresh", "dried", "ground",
    "large", "small", "medium", "ripe", "big", "baby", "finely", "roughly",
    "optional", "warm", "cold", "hot", "cooked", "uncooked", "whole",
    "halved", "quartered", "cubed", "shredded", "whipped", "soaked",
    "drained", "rinsed", "toasted", "roasted", "blanched", "room",
    "temperature", "extra", "virgin", "light", "dark", "thin", "thick",
}

DO_NOT_SINGULARIZE = {
    "molasses", "couscous", "asparagus", "oats", "grits", "rice", "hummus",
    "couscous", "notes", "plus", "species", "series",
}

SOURCE_PAREN_RE = re.compile(
    r"""
    \s*\(\s*
    (?:
        left\s+(?:&\s+right\s+)?pages?
        | right\s+page
        | loose\s+ruled\s+sheet
        | printed\s+sheet
        | yellow\s+sticky\s+note(?:\s*-\s*right\s+column)?
        | fatimata | nadege | chiroko | alina | pascal
        | marmiton | pinterest | quick
        | homemade\s+recipe!
        | [\w.-]+\.(?:com|fr|net|org)
        | [\w.-]+\.com\s*/\s*marmiton
        | king\s+arthur\s+flour\s+website
        | pascal\s*/\s*steph(?:\s*\(mese\))?
        | cafedelites\.com
        | cuisineculinaire\.com
        | lesyeuxgrogneons\.com\s*/\s*marmiton
    )
    \s*\)
    """,
    re.I | re.X,
)

PAGE_MARK_RE = re.compile(r"\s*[-–—]\s*Page\s+\d+", re.I)
PAGE_PAREN_RE = re.compile(r"\s*\(\s*Page\s+\d+\s*\)", re.I)
DISH_PREFIX_RE = re.compile(
    r"^(?:appetizer|dessert|soup|main\s+dish|sauce|other)\s*:\s*",
    re.I,
)
REDUNDANT_PAREN_RE = re.compile(r"\s*\(\s*(?:appetizer|dessert|soup|main dish|quick)\s*\)", re.I)
SERVES_TITLE_RE = re.compile(
    r"\((?:serves|yields|servings)\s+(\d+)(?:\s+\w+)?\)|\((\d+)\s*personnes?\)",
    re.I,
)
SERVES_TEXT_RE = re.compile(
    r"(?:serves|servings|yields|pour)\s*:?\s*(\d+)(?:\s*-\s*\d+)?(?:\s*(?:personnes?|people|waffles|crepes|cupcakes|choux))?",
    re.I,
)
LANG_HEADER_RE = re.compile(r"^(?:english|original(?:\s*\([^)]+\))?)\s*:?\s*$", re.I)
SECTION_HEADER_RE = re.compile(
    r"^(?P<label>[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 +/'’-]{0,40})\s*:\s*(?P<rest>.*)$"
)
DIRECTION_START_RE = re.compile(
    r"^(?:directions?|instructions?|yapılışı|préparation|preparation)\b",
    re.I,
)
LEADING_VERB_RE = re.compile(
    r"^(?:add|mix|use|include|combine|stir\s+in)\s+",
    re.I,
)
INSTRUCTION_LINE_RE = re.compile(
    r"^(?:whisk|melt|cook|follow|preheat|pour|bake|fold|roll|beat|cream|"
    r"put|make|saut[eé]|heat|bring|remove|drain|serve|slice|chop|ground|"
    r"wait|transfer|knead|cover|rest|simmer|boil|fry|blend|decorate|"
    r"garnish|microwave|let\b|once\b|when\b)",
    re.I,
)
SKIP_INGREDIENT_RE = re.compile(
    r"^(?:none(?:\s+listed.*)?|n/?a|see\s+notes?|title\s+only)\.?$",
    re.I,
)
NOTES_META_RE = re.compile(
    r"(?:prep\s*time|cook\s*time|bake\s*time|resting\s*time|grill\s*time|"
    r"bake\s*temp|yields?|servings?)\s*:[^|]*",
    re.I,
)

QTY_UNIT_RE = re.compile(
    rf"""
    ^\s*
    (?P<approx>~|about|approx\.?)?
    \s*
    (?:
        (?:a|an|one\s+)?
        (?P<qty>{NUMBER_RE})
        (?:\s*(?:-|–|—|to)\s*(?P<qty_max>{NUMBER_RE}))?
        \s*
        (?P<unit>{UNIT_PATTERN})?
      |
        (?P<article>a|an|one)\s+(?P<unit2>{UNIT_PATTERN})
    )
    \s*
    (?:of|de|d'|d’)?
    \s*
    (?P<rest>.*?)
    \s*$
    """,
    re.I | re.X,
)
IMPLIED_UNIT_RE = re.compile(
    rf"^(?P<unit>pinch(?:es)?|handfuls?|dash(?:es)?)\s+(?:of|de|d'|d’)?\s*(?P<rest>.+)$",
    re.I,
)
SIZE_OR_RE = re.compile(
    rf"""
    ^\s*(?P<q1>{NUMBER_RE})\s+(?:big|large|small|medium|baby)\s+or\s+
    (?P<q2>{NUMBER_RE})\s+(?:big|large|small|medium|baby)\s+
    (?P<item>.+?)\s*$
    """,
    re.I | re.X,
)

TRAILING_QTY_RE = re.compile(
    rf"""
    ^(?P<item>.+?)\s*\(
    (?P<qty>{NUMBER_RE})
    (?:\s*(?:-|–|—|to)\s*(?P<qty_max>{NUMBER_RE}))?
    \s*(?P<unit>{UNIT_PATTERN})?
    \s*\)$
    """,
    re.I | re.X,
)


def parse_number(text: str | None) -> float | None:
    if text is None:
        return None
    raw = text.strip().replace(" ", "")
    if not raw:
        return None
    if raw in UNICODE_FRACTIONS:
        return float(UNICODE_FRACTIONS[raw])
    raw = raw.replace(",", ".")
    mixed = re.match(r"^(\d+)\s+(\d+)\s*/\s*(\d+)$", text.strip())
    if mixed:
        return int(mixed.group(1)) + int(mixed.group(2)) / int(mixed.group(3))
    frac = re.match(r"^(\d+)\s*/\s*(\d+)$", text.strip())
    if frac:
        denom = int(frac.group(2))
        if denom == 0:
            return None
        return int(frac.group(1)) / denom
    try:
        return float(raw)
    except ValueError:
        return None


def canonicalize_unit(unit: str | None) -> str | None:
    if not unit:
        return None
    token = unit.strip().rstrip(".")
    for pattern, canon in UNIT_LOOKUP:
        if pattern.match(token):
            return canon
    return token.lower() or None


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower().strip())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def singularize(word: str) -> str:
    lower = word.lower()
    if lower in DO_NOT_SINGULARIZE or len(lower) <= 3:
        return lower
    if lower.endswith("ies") and len(lower) > 4:
        return lower[:-3] + "y"
    if lower.endswith("oes"):
        return lower[:-2]
    if lower.endswith("ses") or lower.endswith("xes") or lower.endswith("zes"):
        return lower[:-2]
    if lower.endswith("s") and not lower.endswith(("ss", "us", "is")):
        return lower[:-1]
    return lower


def item_key_from(item: str) -> str:
    words = [w for w in re.split(r"[\s,/]+", item.lower()) if w]
    kept = [singularize(re.sub(r"[^a-z0-9à-ÿ'-]+", "", w)) for w in words if w not in PREP_MODIFIERS]
    kept = [w for w in kept if w]
    return slugify(" ".join(kept) if kept else item)


def smart_title_case(text: str) -> str:
    small = {"a", "an", "and", "at", "de", "des", "du", "et", "for", "in", "la", "le", "les", "of", "on", "or", "the", "to", "with", "à", "au", "aux"}
    words = re.split(r"(\s+|-)", text)
    result: list[str] = []
    index = 0
    for part in words:
        if not part.strip() or part in {" ", "-", " / "} or not any(ch.isalpha() for ch in part):
            result.append(part)
            continue
        lower = part.lower()
        if index > 0 and lower in small:
            result.append(lower)
        else:
            result.append(part[:1].upper() + part[1:].lower() if part else part)
        index += 1
    return "".join(result)


def looks_all_caps(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    return bool(letters) and all(ch.isupper() for ch in letters)


def extract_servings(*texts: str | None) -> int | None:
    for text in texts:
        if not text:
            continue
        match = SERVES_TITLE_RE.search(text) or SERVES_TEXT_RE.search(text)
        if match:
            for group in match.groups():
                if group:
                    return int(group)
    return None


def title_case_if_caps(text: str) -> str:
    return smart_title_case(text) if looks_all_caps(text) else text


def clean_title(title: str) -> tuple[str, int | None]:
    servings = extract_servings(title)
    text = SERVES_TITLE_RE.sub("", title)
    text = SOURCE_PAREN_RE.sub("", text)
    text = PAGE_MARK_RE.sub("", text)
    text = PAGE_PAREN_RE.sub("", text)
    text = DISH_PREFIX_RE.sub("", text)
    text = REDUNDANT_PAREN_RE.sub("", text)
    text = re.sub(r"\(\s*\)", "", text)
    text = re.sub(r"\s+", " ", text).strip(" -:;")

    parens = [re.sub(r"\s+", " ", p).strip() for p in re.findall(r"\(([^()]*)\)", text)]
    if len(parens) >= 2 and parens[-1].casefold() == parens[-2].casefold():
        text = text[: text.rfind("(")].rstrip()
        parens = parens[:-1]

    main = re.sub(r"\s*\(.*$", "", text).strip()
    if parens and parens[-1].casefold() == main.casefold():
        text = text[: text.rfind("(")].rstrip()
        parens = parens[:-1]

    if "(" in text:
        main_part, rest = text.split("(", 1)
        inner = rest.rsplit(")", 1)[0] if ")" in rest else rest
        suffix = rest[len(inner) + 1 :] if ")" in rest else ""
        text = f"{title_case_if_caps(main_part.strip())} ({title_case_if_caps(inner.strip())}){suffix}".strip()
    else:
        text = title_case_if_caps(text)

    text = re.sub(r"\s+", " ", text).strip(" -:;")
    return text or title.strip(), servings


def normalize_cuisine(value: str | None) -> str:
    raw = (value or "").strip()
    return CUISINE_MAP.get(raw.lower(), raw or "International")


def normalize_dish_type(value: str | None) -> str:
    raw = (value or "").strip()
    return DISH_TYPE_MAP.get(raw.lower(), raw or "Other")


def normalize_complexity(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw:
        return "Medium"
    return raw[:1].upper() + raw[1:].lower()


def prefer_english(lines: list[str]) -> list[str]:
    english: list[str] = []
    other: list[str] = []
    unmarked: list[str] = []
    lang: str | None = None

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if LANG_HEADER_RE.match(stripped):
            lang = "en" if stripped.lower().startswith("english") else "orig"
            continue
        if lang == "en":
            english.append(stripped)
        elif lang == "orig":
            other.append(stripped)
        else:
            unmarked.append(stripped)

    if english:
        return english
    return unmarked + other


def looks_like_quantity_segment(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    if re.match(rf"^(?:~|about|approx\.?)?\s*(?:a|an|one\s+)?(?:{NUMBER_RE})(?!\d)", stripped, re.I):
        return True
    if re.match(rf"^(?:a|an|one)\s+(?:{UNIT_PATTERN})(?![a-z])", stripped, re.I):
        return True
    if re.match(rf"^(?:{UNIT_PATTERN})(?![a-z])", stripped, re.I) and stripped.lower().startswith(("pinch", "handful", "dash")):
        return True
    return False


def split_ingredient_line(line: str) -> list[str]:
    text = LEADING_VERB_RE.sub("", line.strip()).strip()
    text = re.sub(r"\s*->\s*", "; ", text)
    if not text:
        return []

    alternatives = re.split(r"\s+OR\s+", text)
    pieces: list[str] = []
    for alt in alternatives:
        plus_parts = re.split(r"\s+\+\s+", alt)
        if len(plus_parts) > 1 and sum(
            looks_like_quantity_segment(p) or bool(re.search(rf"\b{UNIT_PATTERN}\b", p, re.I))
            for p in plus_parts
        ) >= 2:
            pieces.extend(plus_parts)
        else:
            pieces.append(alt)

    split_out: list[str] = []
    for piece in pieces:
        parts = [p.strip() for p in re.split(r",\s*", piece) if p.strip()]
        qty_like = sum(1 for p in parts if looks_like_quantity_segment(p))
        bare_list = (
            len(parts) >= 2
            and qty_like == 0
            and all(len(p.split()) <= 3 and not INSTRUCTION_LINE_RE.match(p) for p in parts)
        )
        if len(parts) >= 2 and qty_like >= 2:
            split_out.extend(parts)
        elif len(parts) >= 3 and qty_like >= 1:
            split_out.extend(parts)
        elif bare_list:
            split_out.extend(parts)
        else:
            split_out.append(piece.strip())
    return [p for p in split_out if p]


def extract_parenthetical_note(text: str) -> tuple[str, str | None]:
    notes: list[str] = []

    def keep_or_note(match: re.Match) -> str:
        inner = match.group(1).strip()
        if TRAILING_QTY_RE.match(f"x ({inner})") or re.match(rf"^{NUMBER_RE}", inner):
            return match.group(0)
        if re.search(r"\bpage\b|\.com|\.fr", inner, re.I):
            return ""
        notes.append(inner)
        return ""

    cleaned = re.sub(r"\(([^)]*)\)", keep_or_note, text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,;")
    return cleaned, "; ".join(notes) if notes else None


def parse_one_ingredient(raw: str, group_note: str | None = None) -> dict | None:
    original = re.sub(r"\s+", " ", raw).strip(" .;")
    if not original or SKIP_INGREDIENT_RE.match(original):
        return None
    if LANG_HEADER_RE.match(original):
        return None
    if re.fullmatch(r"\([^()]*\)", original):
        return None

    note_parts: list[str] = []
    if group_note:
        note_parts.append(group_note)

    text = original
    header = SECTION_HEADER_RE.match(text)
    if header and not looks_like_quantity_segment(text):
        label = header.group("label").strip()
        rest = header.group("rest").strip()
        if not rest:
            return None
        if DIRECTION_START_RE.match(label):
            return None
        note_parts.append(label.lower())
        text = rest

    if DIRECTION_START_RE.match(text) or (INSTRUCTION_LINE_RE.match(text) and not looks_like_quantity_segment(text)):
        return None

    size_or = SIZE_OR_RE.match(text)
    if size_or:
        qty = parse_number(size_or.group("q1"))
        qty_max = parse_number(size_or.group("q2"))
        item = size_or.group("item").strip()
        note_parts.append("big/small size options")
        item = re.sub(r"\s+", " ", item).strip(" ,.;:-")
        if not item:
            return None
        item_display = item[:1].lower() + item[1:] if item else item
        return {
            "raw": original,
            "quantity": qty,
            "quantity_max": qty_max,
            "unit": None,
            "item": item_display,
            "item_key": item_key_from(item_display),
            "note": "; ".join(dict.fromkeys(p for p in note_parts if p)) or None,
        }

    text, paren_note = extract_parenthetical_note(text)
    if paren_note:
        note_parts.append(paren_note)
    if not text.strip():
        return None

    qty = qty_max = None
    unit = None
    item = text

    trailing = TRAILING_QTY_RE.match(text)
    leading = QTY_UNIT_RE.match(text)

    if trailing and (trailing.group("qty") or trailing.group("unit")):
        item = trailing.group("item").strip()
        qty = parse_number(trailing.group("qty"))
        qty_max = parse_number(trailing.group("qty_max"))
        unit = canonicalize_unit(trailing.group("unit"))
    elif leading and (leading.group("qty") or leading.group("unit") or leading.group("unit2")):
        qty = parse_number(leading.group("qty"))
        qty_max = parse_number(leading.group("qty_max"))
        unit = canonicalize_unit(leading.group("unit") or leading.group("unit2"))
        item = (leading.group("rest") or "").strip()
        if leading.group("approx") and qty is not None:
            note_parts.append("approximate")
        if qty is None and (leading.group("article") or leading.group("unit2")):
            qty = 1.0
    else:
        implied = IMPLIED_UNIT_RE.match(text)
        if implied:
            qty = 1.0
            unit = canonicalize_unit(implied.group("unit"))
            item = implied.group("rest").strip()

    item = re.sub(r"\s+", " ", item).strip(" ,.;:-")
    item = re.sub(r"^(?:of|de|d'|d’)\s+", "", item, flags=re.I).strip()

    extra_note = None
    if "," in item and not looks_like_quantity_segment(item.split(",", 1)[1]):
        maybe_item, maybe_note = [p.strip() for p in item.split(",", 1)]
        if maybe_item and len(maybe_note.split()) <= 6 and not looks_like_quantity_segment(maybe_note):
            item, extra_note = maybe_item, maybe_note
    if extra_note:
        note_parts.append(extra_note)

    if not item:
        item = original

    item_display = item[:1].lower() + item[1:] if item else item
    note = "; ".join(dict.fromkeys(p for p in note_parts if p)) or None

    return {
        "raw": original,
        "quantity": qty,
        "quantity_max": qty_max,
        "unit": unit,
        "item": item_display,
        "item_key": item_key_from(item_display),
        "note": note,
    }


def transform_ingredients(lines: list[str]) -> tuple[list[dict], list[str]]:
    chosen = prefer_english(lines)
    ingredients: list[dict] = []
    stray_instructions: list[str] = []
    group_note: str | None = None

    for line in chosen:
        stripped = line.strip()
        if not stripped or SKIP_INGREDIENT_RE.match(stripped):
            continue
        if LANG_HEADER_RE.match(stripped):
            continue

        header = SECTION_HEADER_RE.match(stripped)
        if header and not looks_like_quantity_segment(header.group("label")):
            label = header.group("label").strip()
            rest = header.group("rest").strip()
            if DIRECTION_START_RE.match(label):
                if rest:
                    stray_instructions.append(rest)
                continue
            if not rest:
                group_note = label.lower()
                continue
            if looks_like_quantity_segment(rest) or "," in rest or "+" in rest:
                group_note = label.lower()
                stripped = rest

        if DIRECTION_START_RE.match(stripped) or (
            INSTRUCTION_LINE_RE.match(stripped) and not looks_like_quantity_segment(stripped)
        ):
            stray = re.sub(r"^(?:directions?|instructions?)\s*:?\s*", "", stripped, flags=re.I).strip()
            if stray:
                stray_instructions.append(stray)
            continue

        for piece in split_ingredient_line(stripped):
            parsed = parse_one_ingredient(piece, group_note)
            if parsed and parsed["item_key"]:
                ingredients.append(parsed)

    return ingredients, stray_instructions


def transform_instructions(lines: list[str], extras: list[str] | None = None) -> str | None:
    steps = prefer_english(lines)
    cleaned: list[str] = []
    for step in steps:
        text = re.sub(r"\s+", " ", step).strip()
        if not text or LANG_HEADER_RE.match(text) or text.lower() in {"none", "none listed in source."}:
            continue
        cleaned.append(text)
    if extras:
        cleaned.extend(extras)
    if not cleaned:
        return None
    return "\n".join(cleaned)


def clean_notes(notes: str | None) -> str | None:
    if not notes:
        return None
    text = NOTES_META_RE.sub("", notes)
    text = re.sub(r"\s*\|\s*", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" |.;")
    if not text or text.lower() in {"none", "none listed in source"}:
        return None
    return text


def transform_recipe(recipe: dict) -> dict:
    title, title_servings = clean_title(str(recipe.get("title") or ""))
    notes_raw = recipe.get("notes")
    servings = title_servings or extract_servings(str(notes_raw) if notes_raw else None) or DEFAULT_SERVINGS

    ingredient_lines = recipe.get("ingredients") or []
    instruction_lines = recipe.get("instructions") or []
    if isinstance(ingredient_lines, str):
        ingredient_lines = [ingredient_lines]
    if isinstance(instruction_lines, str):
        instruction_lines = [instruction_lines]

    ingredients, stray_instructions = transform_ingredients(list(ingredient_lines))
    instructions = transform_instructions(list(instruction_lines), stray_instructions)

    return {
        "title": title,
        "cuisine": normalize_cuisine(recipe.get("cuisine")),
        "dish_type": normalize_dish_type(recipe.get("dish_type")),
        "complexity": normalize_complexity(recipe.get("complexity")),
        "prep_time_min": recipe.get("prep_time_min"),
        "cook_time_min": recipe.get("cook_time_min"),
        "total_time_min": recipe.get("total_time_min"),
        "base_servings": servings,
        "ingredients": ingredients,
        "instructions": instructions,
        "notes": clean_notes(notes_raw if isinstance(notes_raw, str) else None),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Normalize recipes.json for PostgreSQL")
    parser.add_argument("input", nargs="?", default="recipes.json", help="Source JSON (default: recipes.json)")
    parser.add_argument("-o", "--output", default="recipes_v4.json", help="Output path (default: recipes_v4.json)")
    parser.add_argument("--in-place", action="store_true", help="Overwrite the input file")
    args = parser.parse_args(argv)

    input_path = Path(args.input)
    output_path = input_path if args.in_place else Path(args.output)
    recipes = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(recipes, list):
        raise ValueError("Expected recipes.json to contain a JSON array")

    transformed = [transform_recipe(recipe) for recipe in recipes]
    output_path.write_text(
        json.dumps(transformed, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    parsed = sum(1 for recipe in transformed for item in recipe["ingredients"] if item["quantity"] is not None)
    total_ings = sum(len(recipe["ingredients"]) for recipe in transformed)
    print(f"Read {input_path}")
    print(f"Wrote {len(transformed)} recipes to {output_path}")
    print(f"Parsed quantity on {parsed}/{total_ings} ingredients")
    return 0


if __name__ == "__main__":
    sys.exit(main())
