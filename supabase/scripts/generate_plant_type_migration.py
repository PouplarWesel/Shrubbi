#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import re
import ssl
import subprocess
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Set, Tuple

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

# Keep user-requested set as canonical defaults.
BASE_TYPE_DISPLAY = {
    "tree": "Tree",
    "shrub": "Shrub",
    "herb": "Herb",
    "vegetable": "Vegetable",
    "succulent": "Succulent",
    "house_plant": "House Plant",
    "vine": "Vine",
    "flower": "Flower",
}

EXTRA_TYPE_DISPLAY = {
    "grass": "Grass",
    "lichen": "Lichen",
    "nonvascular": "Nonvascular",
    "fern": "Fern",
    "other": "Other",
}

HABIT_PRIORITY = [
    "Tree",
    "Shrub",
    "Subshrub",
    "Vine",
    "Forb/herb",
    "Graminoid",
    "Lichenous",
    "Nonvascular",
]

HABIT_TO_TYPE = {
    "Tree": "tree",
    "Shrub": "shrub",
    "Subshrub": "shrub",
    "Vine": "vine",
    "Forb/herb": "herb",
    "Graminoid": "grass",
    "Lichenous": "lichen",
    "Nonvascular": "nonvascular",
}

SUCCULENT_KEYWORDS = {
    "succulent",
    "cactus",
    "aloe",
    "agave",
    "echeveria",
    "sedum",
    "haworthia",
    "crassula",
    "sempervivum",
    "aeonium",
    "kalanchoe",
    "sansevieria",
    "snake plant",
    "jade plant",
}

HOUSEPLANT_KEYWORDS = {
    "house plant",
    "houseplant",
    "indoor plant",
    "pothos",
    "monstera",
    "philodendron",
    "spider plant",
    "peace lily",
    "zz plant",
    "dracaena",
    "ficus elastica",
    "rubber plant",
    "dieffenbachia",
    "calathea",
}

VEGETABLE_KEYWORDS = {
    "tomato",
    "pepper",
    "lettuce",
    "cabbage",
    "kale",
    "spinach",
    "carrot",
    "onion",
    "garlic",
    "broccoli",
    "cauliflower",
    "bean",
    "pea",
    "squash",
    "pumpkin",
    "cucumber",
    "zucchini",
    "radish",
    "beet",
    "potato",
    "corn",
    "eggplant",
    "okra",
    "celery",
    "chard",
    "turnip",
    "asparagus",
    "artichoke",
    "leek",
}

FLOWER_KEYWORDS = {
    "flower",
    "lily",
    "rose",
    "daisy",
    "orchid",
    "tulip",
    "poppy",
    "sunflower",
    "aster",
    "marigold",
    "violet",
    "iris",
    "blossom",
    "camellia",
    "begonia",
    "petunia",
    "hibiscus",
}

TREE_KEYWORDS = {"tree", "fir", "pine", "spruce", "oak", "cedar", "redwood", "cypress"}
SHRUB_KEYWORDS = {"shrub", "bush"}
VINE_KEYWORDS = {"vine", "ivy", "creeper"}
FERN_KEYWORDS = {"fern"}
GRASS_KEYWORDS = {"grass", "sedge", "rush", "bamboo"}
NONVASCULAR_KEYWORDS = {"moss", "liverwort", "hornwort"}
LICHEN_KEYWORDS = {"lichen"}

PAGE_SIZE = 1000
MIN_EXPECTED_PLANTS = 10000


def ascii_clean(text: str) -> str:
    if not text:
        return ""
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("×", "x")
    text = text.replace("–", "-").replace("—", "-")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", text).strip()


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


def post_json(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    ctx = ssl._create_unverified_context()
    with urllib.request.urlopen(req, context=ctx, timeout=240) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_filter_option(filter_options: Sequence[dict], name: str) -> dict:
    for option in filter_options:
        if option.get("Name") == name:
            return option
    raise RuntimeError(f"Filter option not found: {name}")


def run_filtered_query(base_response: dict, filter_name: str, selected_displays: Set[str]) -> dict:
    filter_options = json.loads(json.dumps(base_response["FilterOptions"]))

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

    payload = json.loads(json.dumps(BASE_PAYLOAD))
    payload["filterOptions"] = filter_options
    if base_response.get("UnfilteredPlantIds") is not None:
        payload["unfilteredPlantIds"] = base_response["UnfilteredPlantIds"]
    return post_json(USDA_API, payload)


def project_ref_from_temp() -> str:
    ref_path = Path("supabase/.temp/project-ref")
    if not ref_path.exists():
        raise RuntimeError("Missing supabase/.temp/project-ref. Run `supabase link` first.")
    return ref_path.read_text(encoding="utf-8").strip()


def service_role_key(project_ref: str) -> str:
    raw = subprocess.check_output(
        ["supabase", "projects", "api-keys", "--project-ref", project_ref, "-o", "json"],
        text=True,
    )
    keys = json.loads(raw)
    for k in keys:
        if k.get("name") == "service_role" and "api_key" in k:
            return k["api_key"]
    raise RuntimeError("Unable to resolve service_role API key via Supabase CLI.")


def fetch_remote_plants(project_ref: str, service_key: str) -> Tuple[List[dict], int]:
    rows: List[dict] = []
    total: int | None = None
    offset = 0

    while True:
        url = (
            f"https://{project_ref}.supabase.co/rest/v1/plants"
            f"?select=id,common_name,scientific_name,is_tree"
            f"&order=id.asc&limit={PAGE_SIZE}&offset={offset}"
        )
        req = urllib.request.Request(
            url,
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Prefer": "count=exact",
            },
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode("utf-8")
            batch = json.loads(body)
            if total is None:
                content_range = resp.headers.get("Content-Range", "")
                if "/" in content_range:
                    total = int(content_range.split("/")[-1])

        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    if total is None:
        total = len(rows)
    return rows, total


def canonical_type_from_habits(habits: Iterable[str]) -> str | None:
    hs = set(habits)
    for habit in HABIT_PRIORITY:
        if habit in hs:
            return HABIT_TO_TYPE[habit]
    return None


def contains_any(text: str, needles: Set[str]) -> bool:
    return any(n in text for n in needles)


def build_usda_type_lookup() -> Tuple[Dict[str, str], Dict[str, str]]:
    base_response = post_json(USDA_API, BASE_PAYLOAD)
    base_plants = base_response.get("PlantResults", [])
    if len(base_plants) < MIN_EXPECTED_PLANTS:
        raise RuntimeError(f"Expected >= {MIN_EXPECTED_PLANTS} USDA rows, got {len(base_plants)}")

    filter_options = base_response.get("FilterOptions", [])
    growth_habit_option = get_filter_option(filter_options, "Growth Habit")

    habit_ids: Dict[str, Set[int]] = {}
    for flt in growth_habit_option.get("Filters", []):
        display = flt.get("Display")
        if display not in HABIT_TO_TYPE:
            continue
        resp = run_filtered_query(base_response, "Growth Habit", {display})
        habit_ids[display] = {int(p["Id"]) for p in resp.get("PlantResults", [])}

    by_pid: Dict[int, Set[str]] = defaultdict(set)
    for habit, ids in habit_ids.items():
        for pid in ids:
            by_pid[pid].add(habit)

    taxon_to_type: Dict[str, str] = {}
    genus_counter: Dict[str, Counter] = defaultdict(Counter)

    for plant in base_plants:
        pid = int(plant.get("Id"))
        scientific = ascii_clean(plant.get("ScientificName") or "")
        if not scientific:
            scientific = ascii_clean(plant.get("Symbol") or "")
        taxon = normalize_taxon(scientific)
        if not taxon:
            continue
        t = canonical_type_from_habits(by_pid.get(pid, set()))
        if t is None:
            continue
        taxon_to_type[taxon] = t
        genus = taxon.split()[0]
        genus_counter[genus][t] += 1

    genus_to_type: Dict[str, str] = {}
    for genus, counter in genus_counter.items():
        genus_to_type[genus] = counter.most_common(1)[0][0]

    return taxon_to_type, genus_to_type


def classify_type(
    common_name: str,
    scientific_name: str,
    is_tree: bool,
    taxon_to_type: Dict[str, str],
    genus_to_type: Dict[str, str],
) -> str:
    common_clean = ascii_clean(common_name).lower()
    sci_clean = ascii_clean(scientific_name).lower()
    text = f"{common_clean} {sci_clean}"

    # Requested migration of the old field.
    if is_tree:
        return "tree"

    if contains_any(text, SUCCULENT_KEYWORDS):
        return "succulent"
    if contains_any(text, HOUSEPLANT_KEYWORDS):
        return "house_plant"
    if contains_any(text, VEGETABLE_KEYWORDS):
        return "vegetable"
    if contains_any(text, FERN_KEYWORDS):
        return "fern"

    taxon = normalize_taxon(scientific_name)
    if taxon and taxon in taxon_to_type:
        return taxon_to_type[taxon]

    if taxon:
        genus = taxon.split()[0]
        if genus in genus_to_type:
            return genus_to_type[genus]

    # Name-based fallback.
    if contains_any(text, TREE_KEYWORDS):
        return "tree"
    if contains_any(text, SHRUB_KEYWORDS):
        return "shrub"
    if contains_any(text, VINE_KEYWORDS):
        return "vine"
    if contains_any(text, GRASS_KEYWORDS):
        return "grass"
    if contains_any(text, LICHEN_KEYWORDS):
        return "lichen"
    if contains_any(text, NONVASCULAR_KEYWORDS):
        return "nonvascular"
    if contains_any(text, FLOWER_KEYWORDS):
        return "flower"

    return "other"


def migration_filename() -> Path:
    migrations_dir = Path("supabase/migrations")
    existing: List[str] = []
    for path in migrations_dir.glob("*.sql"):
        m = re.match(r"^(\d{14})_", path.name)
        if m:
            existing.append(m.group(1))

    now = datetime.now(timezone.utc)
    now_s = now.strftime("%Y%m%d%H%M%S")

    if existing:
        latest = max(existing)
        if now_s <= latest:
            latest_dt = datetime.strptime(latest, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
            now_s = (latest_dt + timedelta(seconds=1)).strftime("%Y%m%d%H%M%S")

    return Path(f"supabase/migrations/{now_s}_add_plants_type_drop_is_tree.sql")


def type_display_map(used_types: Set[str]) -> Dict[str, str]:
    display = dict(BASE_TYPE_DISPLAY)
    display.update(EXTRA_TYPE_DISPLAY)
    for t in used_types:
        if t not in display:
            display[t] = t.replace("_", " ").title()
    return display


def generate_sql(rows: List[dict], assigned: Dict[str, str], out_path: Path, project_ref: str) -> None:
    used_types = set(assigned.values()) | set(BASE_TYPE_DISPLAY.keys())
    display = type_display_map(used_types)

    lines: List[str] = []
    lines.append("begin;")
    lines.append("")
    lines.append("-- Add normalized plant type support and retire legacy is_tree flag.")
    lines.append(f"-- Generated by supabase/scripts/generate_plant_type_migration.py for project {project_ref}.")
    lines.append(f"-- Rows typed: {len(rows)}")
    lines.append("")
    lines.append("create table if not exists public.plant_types (")
    lines.append("  code text primary key,")
    lines.append("  display_name text not null")
    lines.append(");")
    lines.append("")
    lines.append("insert into public.plant_types (code, display_name)")
    lines.append("values")
    sorted_types = sorted(used_types)
    for i, t in enumerate(sorted_types):
        suffix = "," if i < len(sorted_types) - 1 else ""
        lines.append(f"  ({sql_string(t)}, {sql_string(display[t])}){suffix}")
    lines.append("on conflict (code) do update")
    lines.append("set display_name = excluded.display_name;")
    lines.append("")
    lines.append('alter table public.plants add column if not exists "type" text;')
    lines.append("")
    lines.append("with typed_plants(id, type) as (")
    lines.append("  values")
    for i, row in enumerate(rows):
        pid = row["id"]
        ptype = assigned[pid]
        suffix = "," if i < len(rows) - 1 else ""
        lines.append(f"    ({sql_string(pid)}::uuid, {sql_string(ptype)}){suffix}")
    lines.append(")")
    lines.append('update public.plants p set "type" = tp.type from typed_plants tp where p.id = tp.id;')
    lines.append("")
    lines.append('update public.plants set "type" = \'tree\' where is_tree and ("type" is null or "type" = \'other\');')
    lines.append('update public.plants set "type" = \'other\' where "type" is null;')
    lines.append("")
    lines.append("do $$")
    lines.append("begin")
    lines.append("  if not exists (")
    lines.append("    select 1 from pg_constraint")
    lines.append("    where conname = 'plants_type_fkey'")
    lines.append("  ) then")
    lines.append('    alter table public.plants add constraint plants_type_fkey foreign key ("type") references public.plant_types(code);')
    lines.append("  end if;")
    lines.append("end$$;")
    lines.append("")
    lines.append('alter table public.plants alter column "type" set not null;')
    lines.append('create index if not exists plants_type_idx on public.plants ("type");')
    lines.append("")
    lines.append("do $$")
    lines.append("declare")
    lines.append("  v_untyped bigint;")
    lines.append("  v_missing_type bigint;")
    lines.append("begin")
    lines.append('  select count(*) into v_untyped from public.plants where "type" is null;')
    lines.append("  if v_untyped > 0 then")
    lines.append("    raise exception 'type backfill failed: % rows untyped', v_untyped;")
    lines.append("  end if;")
    lines.append("  select count(*) into v_missing_type")
    lines.append('  from public.plants p left join public.plant_types pt on pt.code = p."type"')
    lines.append("  where pt.code is null;")
    lines.append("  if v_missing_type > 0 then")
    lines.append("    raise exception 'type FK check failed: % rows point to missing plant_types', v_missing_type;")
    lines.append("  end if;")
    lines.append("end$$;")
    lines.append("")
    lines.append("alter table public.plants drop column if exists is_tree;")
    lines.append("")
    lines.append("commit;")
    lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    project_ref = project_ref_from_temp()
    key = service_role_key(project_ref)

    rows, total = fetch_remote_plants(project_ref, key)
    if total < MIN_EXPECTED_PLANTS or len(rows) < MIN_EXPECTED_PLANTS:
        raise RuntimeError(
            f"Expected >= {MIN_EXPECTED_PLANTS} plants. API total={total}, fetched={len(rows)}."
        )

    taxon_to_type, genus_to_type = build_usda_type_lookup()

    assigned: Dict[str, str] = {}
    counts = Counter()
    for row in rows:
        ptype = classify_type(
            common_name=row.get("common_name") or "",
            scientific_name=row.get("scientific_name") or "",
            is_tree=bool(row.get("is_tree")),
            taxon_to_type=taxon_to_type,
            genus_to_type=genus_to_type,
        )
        assigned[row["id"]] = ptype
        counts[ptype] += 1

    if len(assigned) != len(rows):
        raise RuntimeError("Not all rows were assigned a type.")

    out_path = migration_filename()
    generate_sql(rows=rows, assigned=assigned, out_path=out_path, project_ref=project_ref)

    print(f"Project: {project_ref}")
    print(f"Fetched plants: {len(rows)} (API reported total: {total})")
    print(f"Wrote migration: {out_path}")
    print("Type counts:")
    for t, c in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {t}: {c}")


if __name__ == "__main__":
    main()
