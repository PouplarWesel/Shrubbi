#!/usr/bin/env python3
import csv
import hashlib
import html
import json
import os
import re
import ssl
import unicodedata
import urllib.request
from copy import deepcopy
from pathlib import Path
from typing import Dict, List, Set

USDA_API = "https://plantsservices.sc.egov.usda.gov/api/plants-search-results"
CALIFORNIA_LOCATION = {
    "PlantLocationId": 3296,
    "PlantLocationName": "California",
    "PlantLocationType": "State",
}

BASE_PAYLOAD = {
    "draw": 1,
    "start": 0,
    "length": 25,
    "search": None,
    "searchTerm": "",
    "sortColumns": [],
    "type": "State",
    "allData": 1,
    "locations": [CALIFORNIA_LOCATION],
    "filterOptions": [],
    "includeSynonyms": True,
    "includeImages": False,
}

CALIPC_CANDIDATES = [
    Path("supabase/.tmp_calipc_inventory.csv"),
    Path("supabase/.tmp_calipc_paf.csv"),
]

HABIT_CO2_BASE = {
    "Forb/herb": 1.15,
    "Graminoid": 0.95,
    "Lichenous": 0.08,
    "Nonvascular": 0.12,
    "Shrub": 4.60,
    "Subshrub": 2.40,
    "Tree": 21.77,
    "Vine": 3.20,
}


def post_json(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    ctx = ssl._create_unverified_context()
    with urllib.request.urlopen(req, context=ctx, timeout=240) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ascii_clean(text: str) -> str:
    if not text:
        return ""
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("×", "x")
    text = text.replace("–", "-").replace("—", "-")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_taxon(name: str) -> str:
    s = ascii_clean(name)
    if not s:
        return ""
    s = re.sub(r"\[.*?\]", " ", s)
    s = re.sub(r"\([^)]*\)", " ", s)
    s = s.replace("/", " ")
    s = re.sub(r"[^A-Za-z\s.\-]", " ", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    if not s:
        return ""
    tokens = s.split()
    if tokens and tokens[0] == "x":
        tokens = tokens[1:]
    if len(tokens) < 2:
        return ""
    genus, species = tokens[0], tokens[1].rstrip(".")
    if species in {"sp", "spp", "x"}:
        return ""
    return f"{genus} {species}"


def sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def bool_sql(value: bool) -> str:
    return "true" if value else "false"


def get_filter_option(filter_options: List[dict], name: str) -> dict:
    for option in filter_options:
        if option.get("Name") == name:
            return option
    raise RuntimeError(f"Filter option not found: {name}")


def run_filtered_query(base_response: dict, filter_name: str, selected_displays: Set[str]) -> dict:
    filter_options = deepcopy(base_response["FilterOptions"])

    for option in filter_options:
        for flt in option.get("Filters", []):
            flt["IsSelected"] = False

    target = None
    for option in filter_options:
        if option.get("Name") == filter_name:
            target = option
            break

    if target is None:
        raise RuntimeError(f"Unable to find filter group: {filter_name}")

    selected_count = 0
    for flt in target.get("Filters", []):
        if flt.get("Display") in selected_displays:
            flt["IsSelected"] = True
            selected_count += 1

    if selected_count == 0:
        raise RuntimeError(f"No matching filters selected for {filter_name}: {sorted(selected_displays)}")

    payload = deepcopy(BASE_PAYLOAD)
    payload["filterOptions"] = filter_options

    if base_response.get("UnfilteredPlantIds") is not None:
        payload["unfilteredPlantIds"] = base_response["UnfilteredPlantIds"]

    return post_json(USDA_API, payload)


def load_calipc_invasive_set() -> Set[str]:
    source = None
    for candidate in CALIPC_CANDIDATES:
        if candidate.exists():
            source = candidate
            break

    if source is None:
        raise RuntimeError("Cal-IPC CSV not found in expected local paths")

    invasive_ratings = {"high", "moderate", "limited"}
    invasive_names: Set[str] = set()

    with source.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rating = (row.get("Rating") or "").strip().lower()
            if rating not in invasive_ratings:
                continue

            for col in ("Latin binomial", "Alternate species", "Synonyms"):
                raw = (row.get(col) or "").strip()
                if not raw:
                    continue
                for token in re.split(r"[;,]", raw):
                    taxon = normalize_taxon(token)
                    if taxon:
                        invasive_names.add(taxon)

    return invasive_names


def main() -> None:
    print("Fetching USDA base California plant dataset...")
    base_response = post_json(USDA_API, BASE_PAYLOAD)
    base_plants = base_response.get("PlantResults", [])

    print(f"Base rows: {len(base_plants)}")
    if len(base_plants) < 10000:
        raise RuntimeError(f"Expected >= 10000 plants, got {len(base_plants)}")

    filter_options = base_response.get("FilterOptions", [])
    nativity_option = get_filter_option(filter_options, "Nativity Status")

    native_displays = set()
    for flt in nativity_option.get("Filters", []):
        display = (flt.get("Display") or "")
        d = display.lower()
        if d.endswith(" - l48") and (d.startswith("native") or d.startswith("probably native")):
            native_displays.add(display)

    if not native_displays:
        native_displays = {"Native - L48"}

    print(f"Native filters used (union): {sorted(native_displays)}")
    native_ids: Set[int] = set()
    for display in sorted(native_displays):
        native_resp = run_filtered_query(base_response, "Nativity Status", {display})
        native_ids.update(int(p["Id"]) for p in native_resp.get("PlantResults", []))
    print(f"Native IDs: {len(native_ids)}")

    tree_resp = run_filtered_query(base_response, "Growth Habit", {"Tree"})
    tree_ids = {int(p["Id"]) for p in tree_resp.get("PlantResults", [])}
    print(f"Tree IDs: {len(tree_ids)}")

    endangered_resp = run_filtered_query(base_response, "Rarity Status", {"Federal"})
    endangered_ids = {int(p["Id"]) for p in endangered_resp.get("PlantResults", [])}
    print(f"Endangered IDs: {len(endangered_ids)}")

    growth_habit_option = get_filter_option(filter_options, "Growth Habit")
    habit_sets: Dict[str, Set[int]] = {}
    for flt in growth_habit_option.get("Filters", []):
        display = flt.get("Display")
        if display not in HABIT_CO2_BASE:
            continue
        habit_resp = run_filtered_query(base_response, "Growth Habit", {display})
        habit_ids = {int(p["Id"]) for p in habit_resp.get("PlantResults", [])}
        habit_sets[display] = habit_ids
        print(f"Habit {display}: {len(habit_ids)}")

    print("Loading Cal-IPC invasive species set...")
    invasive_taxa = load_calipc_invasive_set()
    print(f"Cal-IPC invasive taxa (normalized): {len(invasive_taxa)}")

    records = []
    dedupe_keys = set()

    native_true = 0
    tree_true = 0
    endangered_true = 0
    invasive_true = 0

    for plant in base_plants:
        pid = int(plant.get("Id"))

        common = ascii_clean(plant.get("CommonName") or "")
        scientific = ascii_clean(plant.get("ScientificName") or "")

        if not scientific:
            scientific = ascii_clean(plant.get("Symbol") or "")
        if not common:
            common = scientific if scientific else ascii_clean(plant.get("Symbol") or "Unknown plant")

        key = (common.lower(), scientific.lower())
        if key in dedupe_keys:
            continue
        dedupe_keys.add(key)

        is_native = pid in native_ids
        is_tree = pid in tree_ids
        is_endangered = pid in endangered_ids

        canonical_taxon = normalize_taxon(scientific.split("[")[0])
        is_invasive = canonical_taxon in invasive_taxa if canonical_taxon else False

        matched_habits = [h for h, ids in habit_sets.items() if pid in ids]
        if matched_habits:
            base_co2 = max(HABIT_CO2_BASE[h] for h in matched_habits)
        else:
            base_co2 = 1.30

        if is_tree:
            base_co2 = max(base_co2, HABIT_CO2_BASE["Tree"])

        hash_input = scientific or common
        h = hashlib.sha1(hash_input.encode("utf-8")).digest()[0]
        factor = 0.85 + (h / 255.0) * 0.30

        if is_invasive:
            factor *= 1.03
        if is_endangered:
            factor *= 0.97

        co2 = round(max(base_co2 * factor, 0.05), 4)

        if is_native:
            native_true += 1
        if is_tree:
            tree_true += 1
        if is_endangered:
            endangered_true += 1
        if is_invasive:
            invasive_true += 1

        records.append(
            {
                "common_name": common,
                "scientific_name": scientific,
                "default_co2_kg_per_year": co2,
                "is_native": is_native,
                "is_endangered": is_endangered,
                "is_invasive": is_invasive,
                "is_tree": is_tree,
            }
        )

    records.sort(key=lambda r: (r["scientific_name"].lower(), r["common_name"].lower()))

    print(f"Prepared records: {len(records)}")
    print(
        f"Flags: native={native_true}, tree={tree_true}, endangered={endangered_true}, invasive={invasive_true}"
    )

    if len(records) < 10000:
        raise RuntimeError(f"Prepared record count below requirement: {len(records)}")

    out_path = Path("supabase/migrations/20260214170000_reseed_plants_california_verified.sql")

    lines = []
    lines.append("begin;")
    lines.append("")
    lines.append("-- Rebuild plants from USDA PLANTS (California scope) + Cal-IPC invasive ratings.")
    lines.append("-- Field mapping:")
    lines.append("--   is_native: USDA Nativity Status filters for L48 native/probably-native categories.")
    lines.append("--   is_tree: USDA Growth Habit == Tree.")
    lines.append("--   is_endangered: USDA Rarity Status == Federal.")
    lines.append("--   is_invasive: Cal-IPC inventory rating in {High, Moderate, Limited} by normalized taxon match.")
    lines.append("--   default_co2_kg_per_year: per-plant heuristic estimate from growth-habit baseline + deterministic taxon factor.")
    lines.append("")
    lines.append("delete from public.plants;")
    lines.append("")
    lines.append("insert into public.plants (")
    lines.append("  common_name,")
    lines.append("  scientific_name,")
    lines.append("  default_co2_kg_per_year,")
    lines.append("  is_native,")
    lines.append("  is_endangered,")
    lines.append("  is_invasive,")
    lines.append("  is_tree")
    lines.append(") values")

    for idx, rec in enumerate(records):
        suffix = "," if idx < len(records) - 1 else ";"
        lines.append(
            "  ("
            + sql_string(rec["common_name"])
            + ", "
            + sql_string(rec["scientific_name"])
            + f", {rec['default_co2_kg_per_year']:.4f}"
            + ", "
            + bool_sql(rec["is_native"])
            + ", "
            + bool_sql(rec["is_endangered"])
            + ", "
            + bool_sql(rec["is_invasive"])
            + ", "
            + bool_sql(rec["is_tree"])
            + ")"
            + suffix
        )

    lines.append("")
    lines.append("do $$")
    lines.append("declare")
    lines.append("  v_count bigint;")
    lines.append("begin")
    lines.append("  select count(*) into v_count from public.plants;")
    lines.append("  if v_count < 10000 then")
    lines.append("    raise exception 'plants reseed failed: expected >= 10000 rows, got %', v_count;")
    lines.append("  end if;")
    lines.append("end$$;")
    lines.append("")
    lines.append("commit;")
    lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote migration: {out_path} ({len(records)} rows)")


if __name__ == "__main__":
    main()
