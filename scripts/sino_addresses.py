"""Read installation registers and match public building addresses, never nearest houses.

Run with the bundled Python (openpyxl):
  python scripts/sino_addresses.py --prepare
  python scripts/sino_addresses.py --fetch --extra
  python scripts/sino_addresses.py --build
Only addresses and module IDs are extracted; subscriber details are never exported.
"""
import argparse
import collections
import concurrent.futures
import datetime
import hashlib
import json
import pathlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORK = ROOT / ".address-work"
CACHE = WORK / "catalog"
DISTRICT = "70030077013570949"


def norm(value):
    value = str(value).lower().translate(str.maketrans("ёӣӯқҳҷ", "еиукхч"))
    return re.sub(r"\s+", " ", value).strip()


STREETS = [
    (r"мухаммадиев", "Мухаммадиева"),
    (r"махсум", "Нусратулло Махсума"),
    (r"испечак", "Испечак"),
    (r"зараф[шщ]он?|зарафшан", "Зарафшон"),
    (r"сино", "Абуали ибн Сино"),
    (r"хува[ий]дулло", "Нурулло Хувайдуллоева"),
    (r"маяко[вс]", "Маяковского"),
    (r"яккачинор", "Яккачинор"),
    (r"шерализода", "Шерализода"),
    (r"шерози", "Саади Шерози"),
    (r"навои", "Алишера Навои"),
    (r"озодии.?занон", "Озодии Занон"),
    (r"чортути.?поен", "Чортути Поён"),
    (r"чортути.?боло", "Чортути Боло"),
    (r"махмадшохи.?боло", "Махмадшохи Боло"),
    (r"лаби.?тол", "Лаби Тол"),
    (r"буни.?хисорак|бини.?хисорак", "Буни Хисорак"),
    (r"хисорак", "Хисорак"),
    (r"\bхисор\b", "Гиссар"),
    (r"шафак", "Шафак"),
    (r"шараф", "Шараф"),
    (r"ха[еи]т[ои].?нав", "Хаёти Нав"),
    (r"[кқ][оа]боди[еея]н", "Кубодиён"),
    (r"ином|вахоб", "Вахобова"),
    (r"ашур.?сафар", "Ашура Сафара"),
    (r"сафарзода.?зафар", "Зафара Сафарзода"),
    (r"хусн[оа]бод", "Хуснобод"),
    (r"нодира", "Нодира"),
    (r"навбахор", "Навбахор"),
    (r"ар[гмв][уи][вг]он|армугон", "Аргувон"),
    (r"х[оу](?:ч|дж)[ао][мн]?би[еи][еи].*боло", "Худжамбиёи Боло"),
    (r"х[оу](?:ч|дж)[ао][мн]?би[еи][еи]", "Худжамбиёи Поён"),
    (r"чагатай|шодоб", "Чагатай Шодоб"),
    (r"семенова", "Семёнова"),
    (r"навобод", "Навобод"),
    (r"самарканд", "Самарканд"),
]


def parse_address(address, context=""):
    s = norm(address)
    street = next((label for pattern, label in STREETS if re.search(pattern, s)), "")
    # Apartment numbers must never become house numbers (including 6х-98).
    building = re.split(r"\s*(?:кв\.?\s*[-–]?|(?<=\d)х\s*-|\bх\s*[-–]|\bх\s+|\bк\s*(?=\d))", s)[0]
    # A block number is not a house number. Keep it separately for review.
    block_match = re.search(r"\bбл(?:ок)?\s*-?\s*([абв]?\s*-?\s*\d+\s*(?:[/\-]?\s*[абв])?)", building)
    if block_match:
        building = building[:block_match.start()] + building[block_match.end():]
    passage = re.search(r"(?:дом\s*-?\s*)?(\d+)\s*пр(?:оезд)?\s*-?\s*(?:дом\s*)?(\d+[а-я]?(?:/\d+)*)", building)
    if not passage:
        passage = re.search(r"\bпр(?:оезд)?\s*(\d+)\s*(?:дом\s*)?(\d+[а-я]?(?:/\d+)*)", building)
    building = re.sub(r"\bдом\s*$", "", building).strip()
    house_match = re.search(r"(?:дом|хонаи|\bд\s*-)\s*[-–]?\s*(\d+[а-яa-z]?(?:\s*/\s*[\dа-яa-z]+)*)", building)
    if house_match:
        house = house_match[1]
    else:
        # Without an explicit house label, only the final numeric token is eligible.
        m = re.search(r"(\d+[а-яa-z]?(?:\s*/\s*[\dа-яa-z]+)*)\s*$", building)
        house = m[1] if m else ""
    house = re.sub(r"\s+", "", house).replace("//", "/")
    if passage:
        house = passage[2]
    quarter_match = re.search(r"\bм\s*(\d+(?:/\d+)?)", building)
    quarter = quarter_match[1] if quarter_match else ""
    if street == "Испечак" and quarter and house:
        house = f"{house}-М{quarter}"
    # Zarafshon's quarter/house convention is not inferred from a slash address.
    # The original quarter is retained for explicit review against the catalog.
    if street == "Зарафшон" and quarter and house:
        house = f"{house}/{quarter}"
    if re.search(r"б\s*/\s*р|б\s*/\s*н", building):
        house = ""
    if street == "Испечак" and not house_match and not quarter:
        house = ""  # Испечак-1/2 denotes an area, not a house.
    key = f"{street}|{house}" if street else f"unknown|{building}"
    if passage:
        key += f"|проезд {passage[1]}"
    # Keep ambiguous block designations separate until explicitly reviewed.
    block = block_match or (re.search(r"б\s*-?\s*1(?:\s*-?\s*а)?", building) if street == "Абуали ибн Сино" else None)
    if block:
        key += "|блок " + re.sub(r"\s+", "", block[0])
    return {"key": key, "street": street, "house": house, "quarter": quarter,
            "block": bool(block), "passage": passage[1] if passage else "", "query": (f"{passage[1]}-й проезд {street} {house}" if passage else f"{street} {house}").strip(),
            "sourceSino": bool(re.search(r"но[хҳ]ияи\s+сино", norm(context)))}


def parse_ids(raw):
    cleaned = re.sub(r"(?<!\d)2026(?:[-\s]+|(?=03\d{6}(?!\d)))", "", raw.strip())
    cleaned = re.sub(r"[ОоOo]", "", cleaned)
    # Separators within a single zero-padded ID, as written in the May register.
    if re.fullmatch(r"\d{2}-\d{2}-\d{2}-\d{2}", cleaned):
        cleaned = cleaned.replace("-", "")
    if re.fullmatch(r"(?:0?3\d{6}){2,}", cleaned):
        parts = re.findall(r"0?3\d{6}", cleaned)
        return list(dict.fromkeys(str(int(p)) for p in parts)), ""
    ids = list(dict.fromkeys(str(int(x)) for x in re.findall(r"(?<!\d)0?3\d{6}(?!\d)", cleaned)))
    remainder = re.sub(r"(?<!\d)0?3\d{6}(?!\d)", "", cleaned)
    remainder = re.sub(r"[\s/;,\-_.]", "", remainder)
    return ids, remainder


def prepare():
    import openpyxl
    WORK.mkdir(exist_ok=True)
    rows, issues = [], []
    for path in sorted((ROOT / "new-files").glob("*.xlsx")):
        book = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for sheet in book:
            context, address_column, module_column = "", None, None
            for number, row in enumerate(sheet.values, 1):
                values = [str(v if v is not None else "").strip() for v in row]
                for v in values:
                    if re.search(r"суро[гғ]а:", v, re.I):
                        context = v
                header = next((i for i, v in enumerate(values) if re.search("модул", v, re.I) and len(v) < 25), None)
                if header is not None:
                    module_column = header
                    address_column = next((i for i, v in enumerate(values) if re.fullmatch(r"Суро[гғ]а", v, re.I)), None)
                    continue
                if module_column is None or address_column is None or len(values) <= module_column:
                    continue
                raw, address = values[module_column], values[address_column]
                if not address or re.search(r"итого|чамъ|ҷамъ", address, re.I):
                    continue
                ids, remainder = parse_ids(raw)
                if ids:
                    rows.append({"file": path.name, "sheet": sheet.title, "row": number,
                                 "context": context, "address": address, "rawModule": raw,
                                 "ids": ids, **parse_address(address, context)})
                if remainder and address and raw and len(raw) > 5:
                    issues.append({"file": path.name, "sheet": sheet.title, "row": number,
                                   "address": address, "rawModule": raw, "context": context})
        book.close()
    (WORK / "records.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    (WORK / "parse-issues.json").write_text(json.dumps(issues, ensure_ascii=False, indent=2))
    groups = {}
    for r in rows:
        g = groups.setdefault(r["key"], {k: r[k] for k in ("key", "street", "house", "quarter", "block", "passage", "query")})
        g["count"] = g.get("count", 0) + len(r["ids"])
        g["sourceSino"] = g.get("sourceSino", False) or r["sourceSino"]
    (WORK / "groups.json").write_text(json.dumps(groups, ensure_ascii=False, indent=2))
    print(json.dumps({"records": len(rows), "ids": sum(len(r["ids"]) for r in rows),
                      "groups": len(groups), "sinoGroups": sum(g["sourceSino"] for g in groups.values()),
                      "parseIssues": len(issues)}))


def cache_path(query):
    return CACHE / (hashlib.sha256(query.encode()).hexdigest()[:24] + ".json")


def fetch_query(query):
    path = cache_path(query)
    if path.exists():
        return json.loads(path.read_text())
    url = "https://2gis.tj/ru/dushanbe/search/" + urllib.parse.quote(query, safe="")
    result = {"query": query, "url": url, "checked": datetime.date.today().isoformat(), "entities": []}
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        html = urllib.request.urlopen(request, timeout=25).read().decode()
        match = re.search(r"var initialState = JSON.parse\('(.*?)'\);", html)
        if not match:
            raise ValueError("No public search data")
        state = json.loads(match[1].replace("\\'", "'").replace("\\\\", "\\"))
        for v in state["data"]["entity"]["profile"].values():
            e = v.get("data", {})
            if e.get("type") not in ("building", "street", "adm_div"):
                continue
            result["entities"].append({k: e[k] for k in ("id", "type", "name", "address", "point", "adm_div", "geometry") if k in e})
    except urllib.error.HTTPError as e:
        if e.code != 404:
            return {**result, "error": str(e)}  # Transient failures are not cached.
    except Exception as e:
        return {**result, "error": str(e)}
    path.write_text(json.dumps(result, ensure_ascii=False))
    time.sleep(0.15)
    return result


def fetch(extra=False):
    CACHE.mkdir(parents=True, exist_ok=True)
    groups = json.loads((WORK / "groups.json").read_text())
    # Explicit Sino sheets and Sino streets in March; unrelated districts remain in the legacy view.
    target_streets = {g["street"] for g in groups.values() if g["sourceSino"]}
    wanted = [g for g in groups.values() if g["sourceSino"] or g["street"] in target_streets]
    if extra:
        extra_streets = json.loads((ROOT / "data" / "sino-extra-streets.json").read_text())
        wanted += [g for g in groups.values() if g["street"] in extra_streets]
    queries = list(dict.fromkeys(["Сино район"] + [g["query"] for g in sorted(wanted, key=lambda g: -g["count"]) if g["house"] and g["street"]]))
    errors = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for i, result in enumerate(pool.map(fetch_query, queries), 1):
            if "error" in result:
                errors.append(result)
            if i % 50 == 0 or i == len(queries):
                print(json.dumps({"done": i, "total": len(queries), "errors": len(errors)}), flush=True)
    (WORK / "fetch-errors.json").write_text(json.dumps(errors, ensure_ascii=False, indent=2))


def number_key(value):
    return re.sub(r"[\s\-]", "", norm(value)).replace("//", "/")


def inside_polygon(point, ring):
    x, y = point["lon"], point["lat"]
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def match_building(group, entities, ring, citywide=False):
    if not group["house"]:
        return "missing_house", None
    if group["block"]:
        return "block_unverified", None
    matches = {}
    outside = False
    for e in entities:
        if e.get("type") != "building" or not e.get("point"):
            continue
        for component in e.get("address", {}).get("components", []):
            street = next((label for pattern, label in STREETS if re.search(pattern, norm(component.get("street", "")))), "")
            if street != group["street"] or number_key(component.get("number", "")) != number_key(group["house"]):
                continue
            # Similar names such as Зарафшон-2 and a different numbered проезд are not interchangeable.
            catalog_street = norm(component.get("street", ""))
            if group.get("passage"):
                if not re.search(rf"{re.escape(group['passage'])}-й проезд", catalog_street):
                    continue
            elif re.search(r"проезд|переулок", catalog_street) and group["street"] != "Испечак":
                continue
            if group["street"] == "Зарафшон" and re.search(r"зарафшон\s*-\s*2", catalog_street):
                continue
            district_ok = any(d.get("name") == "Душанбе" if citywide else d.get("id") == DISTRICT for d in e.get("adm_div", []))
            if not district_ok or (not citywide and not inside_polygon(e["point"], ring)):
                outside = True
                continue
            matches[e["id"]] = e
    if len(matches) == 1:
        return "matched", next(iter(matches.values()))
    return ("ambiguous" if matches else "outside_sino" if outside else "not_found"), None


def build():
    groups = json.loads((WORK / "groups.json").read_text())
    rows = json.loads((WORK / "records.json").read_text())
    explicit_streets = {r["street"] for r in rows if r["sourceSino"]}
    target_keys = {g["key"] for g in groups.values() if g["sourceSino"] or g["street"] in explicit_streets}
    district_result = json.loads(cache_path("Сино район").read_text())
    district = next(e for e in district_result["entities"] if e["id"] == DISTRICT)
    wkt = district["geometry"]["selection"]
    assert wkt.startswith("POLYGON((") and wkt.endswith("))") and "),(" not in wkt
    ring = [[float(n) for n in pair.split()] for pair in wkt[9:-2].split(",")]
    # Other March streets enter the Sino view only when an exact building match
    # independently confirms the district; uncertain non-Sino records are not imported.
    for key, g in groups.items():
        path = cache_path(g["query"])
        if key not in target_keys and path.exists():
            status, _ = match_building(g, json.loads(path.read_text())["entities"], ring)
            if status == "matched":
                target_keys.add(key)
    matches, catalog = {}, {}
    for key in sorted(target_keys):
        g = groups[key]
        path = cache_path(g["query"])
        result = json.loads(path.read_text()) if path.exists() else {"entities": []}
        status, e = match_building(g, result["entities"], ring)
        matches[key] = {"key": key, "street": g["street"], "house": g["house"], "status": status}
        if e:
            matches[key].update({"lat": e["point"]["lat"], "lng": e["point"]["lon"],
                                 "mapAddress": e["name"], "buildingId": e["id"],
                                 "url": "https://2gis.tj/ru/dushanbe/geo/" + e["id"]})
        catalog[key] = {"query": g["query"], "checked": result.get("checked"),
                        "status": status, "candidates": [{k: v for k, v in e.items() if k != "geometry"} for e in result["entities"] if e["type"] == "building"]}
    assignment = json.loads((ROOT / "data/gateway-modules.json").read_text())
    gateway = {mid: i for i, ids in enumerate(assignment) for mid in ids}
    source_files = sorted({r["file"] for r in rows})
    by_id = collections.defaultdict(list)
    for r in rows:
        for mid in r["ids"]:
            by_id[mid].append(r)
    modules = []
    for mid, occurrences in sorted(by_id.items()):
        if not any(r["key"] in target_keys for r in occurrences):
            continue
        keys = {r["key"] for r in occurrences}
        conflict = len(keys) != 1
        key = next(iter(keys)) if not conflict else ""
        status = "id_conflict" if conflict else matches[key]["status"]
        modules.append({"id": mid, "key": key, "status": status, "gateway": gateway.get(mid, -1),
                        "sources": [{"file": source_files.index(r["file"]), "sheet": r["sheet"], "row": r["row"], "address": r["address"]} for r in occurrences]})
    issues = []
    for issue in json.loads((WORK / "parse-issues.json").read_text()):
        parsed = parse_address(issue["address"], issue["context"])
        if parsed["key"] not in target_keys and not parsed["sourceSino"]:
            continue
        issues.append({"file": source_files.index(issue["file"]), "sheet": issue["sheet"], "row": issue["row"],
                       "address": issue["address"], "rawModule": issue["rawModule"]})
    data = {"version": 1, "checkedDate": "2026-09-23", "files": source_files,
            "sourceHashes": {name: hashlib.sha256((ROOT / "new-files" / name).read_bytes()).hexdigest() for name in source_files},
            "district": {"name": "Ноҳияи Сино", "id": DISTRICT, "ring": ring,
                         "url": "https://2gis.tj/ru/dushanbe/geo/" + DISTRICT},
            "buildings": list(matches.values()), "modules": modules, "idIssues": issues,
            "summary": {"modules": len(modules), "mapped": sum(m["status"] == "matched" for m in modules),
                        "pending": sum(m["status"] != "matched" for m in modules), "idIssues": len(issues),
                        "buildings": len({m["key"] for m in modules if m["status"] == "matched"})}}
    (ROOT / "data" / "sino-address-catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "sino-data.js").write_text("/* Generated by scripts/sino_addresses.py. No subscriber details. */\nconst SINO_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(json.dumps(data["summary"]))



if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--build", action="store_true")
    parser.add_argument("--extra", action="store_true")
    args = parser.parse_args()
    if args.prepare:
        prepare()
    if args.fetch:
        fetch(args.extra)
    if args.build:
        build()
