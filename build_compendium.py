import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests

# ====== CONFIG ======
DATA_DIR = Path("data")
FACILITIES_PATH = DATA_DIR / "facilities.json"
TOOLS_PATH = DATA_DIR / "tools_tables.json"
OUT_PATH = DATA_DIR / "compendium_items.json"

DND5EAPI_BASE = "https://www.dnd5eapi.co/api/2014"  # SRD API :contentReference[oaicite:2]{index=2}
OPEN5E_BASE = "https://api.open5e.com"              # Open5e API :contentReference[oaicite:3]{index=3}

REQUEST_DELAY = 0.08  # gentle pacing

# ====== HELPERS ======
def load_json(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"Missing required file: {path.as_posix()}")
    return json.loads(path.read_text(encoding="utf-8"))

def save_json(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def norm_name(s: str) -> str:
    s = (s or "").strip()
    s = s.replace("’", "'").replace("“", '"').replace("”", '"')
    s = re.sub(r"\s+", " ", s)
    return s

def key_name(s: str) -> str:
    # normalised key used for matching (not what we store)
    s = norm_name(s).lower()
    s = re.sub(r"[^\w\s\-\+\(\),']", "", s)
    s = s.replace(" +", "+").strip()
    return s

def roll20_url(item_name: str) -> str:
    # Your in-app link already works, but we store it too
    return f"https://roll20.net/compendium/dnd5e/{quote(item_name)}"

def short_desc(desc):
    if not desc:
        return ""
    if isinstance(desc, list):
        text = " ".join([str(x) for x in desc if x])
    else:
        text = str(desc)
    text = re.sub(r"\s+", " ", text).strip()
    # keep it readable in your modal
    if len(text) > 420:
        text = text[:417].rstrip() + "…"
    return text

def http_get(url, params=None):
    time.sleep(REQUEST_DELAY)
    r = requests.get(url, params=params, timeout=20)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()

# ====== EXTRACT CRAFTABLE NAMES ======
def extract_craftables(facilities, tools):
    items = set()

    # facilities options
    for fac in facilities:
        for fn in fac.get("functions", []) or []:
            for opt in fn.get("options", []) or []:
                if isinstance(opt, dict) and "label" in opt:
                    items.add(norm_name(opt["label"]))
                elif isinstance(opt, str):
                    items.add(norm_name(opt))

    # tool tables
    if isinstance(tools, dict):
        for table_name, arr in tools.items():
            if isinstance(arr, list):
                for it in arr:
                    items.add(norm_name(str(it)))

    # Remove empties
    items = {x for x in items if x}

    return sorted(items, key=lambda x: x.lower())

# ====== LOOKUPS ======
def dnd5e_find_by_name(endpoint: str, name: str):
    """
    Tries: /{endpoint}?name=... (works reliably for spells; for other endpoints
    we fall back to list + match)
    """
    # 1) list all resources
    listing = http_get(f"{DND5EAPI_BASE}/{endpoint}")
    if not listing or "results" not in listing:
        return None

    target = key_name(name)
    # Exact-ish match by normalized name
    for r in listing["results"]:
        if key_name(r.get("name", "")) == target:
            return http_get(f"{DND5EAPI_BASE}{r.get('url')}")
    return None

def open5e_search(category: str, name: str):
    """
    Open5e has search endpoints like /magicitems/?search=
    We'll try the most likely categories.
    """
    # open5e category names:
    # magicitems, weapons, armor, adventuring-gear is "equipment" on some APIs; open5e uses "weapons"/"armor"/"magicitems"
    url = f"{OPEN5E_BASE}/{category}/"
    data = http_get(url, params={"search": name})
    if not data or "results" not in data:
        return None

    target = key_name(name)
    # pick best normalized match
    best = None
    for r in data["results"]:
        if key_name(r.get("name", "")) == target:
            best = r
            break
    if not best and data["results"]:
        # fallback: first result
        best = data["results"][0]
    return best

def build_entry_from_dnd5e(item_name: str):
    # Try as magic item
    mi = dnd5e_find_by_name("magic-items", item_name)
    if mi:
        return {
            "type": norm_name(mi.get("equipment_category", {}).get("name", "Magic Item")),
            "attunement": "Yes" if mi.get("requires_attunement") else "No",
            "summary": short_desc(mi.get("desc")),
            "source": f"{DND5EAPI_BASE}{mi.get('url','')}",
            "roll20": roll20_url(item_name)
        }

    # Try as equipment (weapons/armor/adventuring gear)
    eq = dnd5e_find_by_name("equipment", item_name)
    if eq:
        # Build a compact summary from the structured fields if no desc
        summary = short_desc(eq.get("desc"))
        if not summary:
            bits = []
            cat = eq.get("equipment_category", {}).get("name")
            if cat: bits.append(cat)
            if eq.get("weapon_category"): bits.append(eq["weapon_category"])
            if eq.get("weapon_range"): bits.append(eq["weapon_range"])
            dmg = eq.get("damage", {})
            if dmg and dmg.get("damage_dice"):
                bits.append(f"Damage: {dmg['damage_dice']} {dmg.get('damage_type',{}).get('name','')}".strip())
            ac = eq.get("armor_class", {})
            if ac and "base" in ac:
                bits.append(f"AC: {ac['base']}")
            if eq.get("stealth_disadvantage") is True:
                bits.append("Stealth: Disadvantage")
            if eq.get("str_minimum"):
                bits.append(f"STR min: {eq['str_minimum']}")
            if eq.get("weight") is not None:
                bits.append(f"Weight: {eq['weight']} lb")
            if eq.get("cost"):
                c = eq["cost"]
                bits.append(f"Cost: {c.get('quantity','')} {c.get('unit','')}".strip())
            summary = " • ".join([b for b in bits if b])

        return {
            "type": norm_name(eq.get("equipment_category", {}).get("name", "Equipment")),
            "attunement": "No",
            "summary": summary,
            "source": f"{DND5EAPI_BASE}{eq.get('url','')}",
            "roll20": roll20_url(item_name)
        }

    return None

def build_entry_from_open5e(item_name: str):
    # Try magic items first
    mi = open5e_search("magicitems", item_name)
    if mi:
        return {
            "type": norm_name(mi.get("type", "Magic Item")),
            "attunement": "Unknown",
            "summary": short_desc(mi.get("desc") or mi.get("description")),
            "source": mi.get("document__url") or mi.get("url") or OPEN5E_BASE,
            "roll20": roll20_url(item_name)
        }

    # Weapons / Armor
    w = open5e_search("weapons", item_name)
    if w:
        return {
            "type": "Weapon",
            "attunement": "No",
            "summary": short_desc(w.get("desc") or w.get("description")),
            "source": w.get("document__url") or w.get("url") or OPEN5E_BASE,
            "roll20": roll20_url(item_name)
        }

    a = open5e_search("armor", item_name)
    if a:
        return {
            "type": "Armor",
            "attunement": "No",
            "summary": short_desc(a.get("desc") or a.get("description")),
            "source": a.get("document__url") or a.get("url") or OPEN5E_BASE,
            "roll20": roll20_url(item_name)
        }

    return None

# ====== MAIN ======
def main():
    facilities = load_json(FACILITIES_PATH)
    tools = load_json(TOOLS_PATH)

    # existing compendium (preserve)
    existing = {"version": 1, "items": {}}
    if OUT_PATH.exists():
        try:
            existing = load_json(OUT_PATH)
            if "items" not in existing:
                existing = {"version": 1, "items": {}}
        except Exception:
            existing = {"version": 1, "items": {}}

    craftables = extract_craftables(facilities, tools)

    out_items = dict(existing.get("items", {}))
    added = 0
    skipped_existing = 0
    not_found = 0

    for name in craftables:
        name_norm = norm_name(name)

        # Preserve existing entries exactly (homebrew or already curated)
        if name_norm in out_items:
            skipped_existing += 1
            # ensure roll20 key exists
            if "roll20" not in out_items[name_norm]:
                out_items[name_norm]["roll20"] = roll20_url(name_norm)
            continue

        # SRD lookup attempts
        entry = build_entry_from_dnd5e(name_norm)
        if not entry:
            entry = build_entry_from_open5e(name_norm)

        if entry:
            out_items[name_norm] = entry
            added += 1
        else:
            # still include a minimal stub so your compendium UI can show "No entry yet" but with roll20
            out_items[name_norm] = {
                "type": "",
                "attunement": "",
                "summary": "",
                "source": "",
                "roll20": roll20_url(name_norm)
            }
            not_found += 1

    out = {
        "version": 1,
        "items": dict(sorted(out_items.items(), key=lambda kv: kv[0].lower()))
    }

    save_json(OUT_PATH, out)

    print("✅ Compendium built!")
    print(f"- Craftables scanned: {len(craftables)}")
    print(f"- Preserved existing entries: {skipped_existing}")
    print(f"- Added SRD/Open5e entries: {added}")
    print(f"- Not found (stubs created): {not_found}")
    print(f"➡ Wrote: {OUT_PATH.as_posix()}")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
