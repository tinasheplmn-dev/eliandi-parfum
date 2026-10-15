#!/usr/bin/env python3
"""Eliandi catalogus: Excel -> js/catalog.js met quiz-attributen per parfum."""
import openpyxl, re, json, unicodedata

SRC = "/Users/onlinerijkdom/Downloads/Webshop producten .xlsx"
OUT = "/Users/onlinerijkdom/Downloads/files1/websites/eliandi-website/js/catalog.js"

wb = openpyxl.load_workbook(SRC, data_only=True)
ws = wb["Blad1"]

def norm(s):
    return unicodedata.normalize("NFKC", str(s)).replace("\r", "\n")

# ── notenparser ──
SECTION = re.compile(r"(topnoten|hartnoten|basisnoten)\s*:?\s*", re.I)
STOP = re.compile(r"^(geurfamilie|geurprofiel|voor\b|voor:)", re.I)

def parse_notes(desc):
    """Vind top/hart/basisnoten-blokken; noten per regel of kommagescheiden."""
    out = {"top": [], "heart": [], "base": []}
    keymap = {"topnoten": "top", "hartnoten": "heart", "basisnoten": "base"}
    lines = [l.strip() for l in desc.split("\n")]
    cur = None
    for l in lines:
        if not l:
            continue
        l = re.sub(r"^[>\*\-–•\s]+", "", l)
        m = SECTION.match(l)
        if m:
            cur = keymap[m.group(1).lower()]
            rest = l[m.end():].strip()
            if rest:
                out[cur] += split_notes(rest)
            continue
        if STOP.match(l):
            cur = None
            continue
        if cur:
            # regel met alleen noten (bullets of komma's)
            clean = re.sub(r"^[\*\-–•>\s]+", "", l)
            if clean and len(clean) < 80 and not clean.endswith("."):
                out[cur] += split_notes(clean)
            else:
                cur = None
    return out

def split_notes(s):
    parts = re.split(r"[,•/]| en ", s)
    return [p.strip(" .>*-–").strip() for p in parts if p.strip(" .>*-–").strip()]

def parse_family(desc):
    m = re.search(r"geurfamilie\s*:?\s*\n*(.{0,120})", desc, re.I)
    if not m:
        return []
    seg = m.group(1).split("\n")[0]
    if not seg.strip():
        for l in desc[m.end():].split("\n"):
            if l.strip():
                seg = l
                break
    parts = re.split(r"[•\-–,·]", seg)
    fams = [p.strip(" .").strip() for p in parts if p.strip(" .").strip()]
    return [f for f in fams if len(f) < 30 and not STOP.match(f)][:6]

def parse_gender(desc):
    d = desc.lower()
    if "dames & heren" in d or "dames en heren" in d or "unisex" in d:
        return "unisex"
    if re.search(r"voor\s*:?\s*\n*\s*dames", d):
        return "dames"
    if re.search(r"voor\s*:?\s*\n*\s*heren", d):
        return "heren"
    return "unisex"

def parse_intro(name, desc):
    """Eerste echte lopende zin(nen), zonder titelherhaling, max ~190 tekens."""
    for l in desc.split("\n"):
        l = l.strip()
        if not l or len(l) < 25:
            continue
        if l.lower().startswith(name.lower()[:12]):
            # zin die met de naam begint mag, mits het een echte zin is
            if not re.search(r"[a-z]{3}.*[a-z]{3}", l.lower()) or len(l) < 40:
                continue
        if SECTION.match(l) or STOP.match(l):
            continue
        intro = l
        if len(intro) > 190:
            cut = intro[:190]
            if "." in cut[60:]:
                intro = cut[: cut.rindex(".") + 1]
            else:
                intro = cut.rsplit(" ", 1)[0] + "…"
        return intro
    return ""

# ── afgeleide quiz-dimensies via trefwoorden ──
DIMS = {
    "oud":      [r"\boud\b", r"oudhout", r"agarwood", r"akigalawood"],
    "hout":     [r"hout", r"ceder", r"sandelhout", r"vetiver", r"patchouli", r"guaiac"],
    "vanille":  [r"vanille", r"tonkaboon", r"benzo[eë]"],
    "gourmand": [r"gourmand", r"karamel", r"honing", r"praline", r"chocolade", r"koffie", r"amandel", r"pistache", r"kokos", r"suiker", r"marshmallow", r"r[iu]m\b"],
    "bloemig":  [r"bloemig", r"floral", r"roos", r"rozen", r"jasmijn", r"tuberoos", r"iris", r"viooltje", r"oranjebloesem", r"pioen", r"lelie", r"lavendel", r"neroli", r"ylang", r"magnolia", r"freesia", r"gardenia"],
    "fris":     [r"\bfris", r"citrus", r"bergamot", r"citroen", r"limoen", r"grapefruit", r"mandarijn", r"aquatisch", r"marine", r"zee", r"ozon", r"munt", r"groene?\b", r"appel\b", r"komkommer"],
    "kruidig":  [r"kruidig", r"kaneel", r"kardemom", r"peper", r"saffraan", r"gember", r"nootmuskaat", r"kruidnagel", r"wierook", r"olibanum"],
    "musk":     [r"musk", r"muskus"],
    "fruitig":  [r"fruitig", r"framboos", r"aardbei", r"kers", r"perzik", r"ananas", r"bes\b", r"bessen", r"pruim", r"peer\b", r"lychee", r"abrikoos", r"granaatappel", r"passievrucht"],
    "amber":    [r"amber", r"ori[eë]ntaals", r"labdanum", r"balsem", r"hars"],
    "poederig": [r"poeder", r"talk\b", r"pudder"],
    "leer":     [r"leer\b", r"leder", r"rokerig", r"rook\b", r"teer\b", r"berkenteer", r"tabak"],
}

WARM_WORDS = [r"warm", r"winter", r"avond", r"sensueel", r"verslavend", r"koude lucht", r"cozy"]
FRESH_WORDS = [r"zomer", r"fris", r"licht", r"dag\b", r"lente", r"energiek", r"sprankelend"]
STRONG_WORDS = [r"intens", r"sterk", r"domineert", r"krachtig", r"extrait", r"statement", r"sillage", r"projectie"]
SOFT_WORDS = [r"subtiel", r"zacht", r"huidgeur", r"delicaat", r"fluweel"]
NIGHT_WORDS = [r"avond", r"nacht", r"gelegenhe", r"gala", r"feest"]
DAY_WORDS = [r"dagelijks", r"werk\b", r"kantoor", r"elke dag", r"allemansvriend"]

def count_hits(text, patterns):
    return sum(len(re.findall(p, text)) for p in patterns)

products = []
seen = set()
for row in ws.iter_rows(min_row=2, values_only=True):
    code, name, desc, p100, p50, p30 = row[0], row[1], row[2], row[3], row[4], row[5]
    if not name or not str(name).strip() or str(name).strip() == "-":
        continue
    name = re.sub(r"\s+", " ", str(name)).strip()
    if not desc or len(str(desc)) < 30:
        continue
    key = name.lower()
    if key in seen:
        continue
    seen.add(key)
    desc = norm(desc)
    low = desc.lower()

    notes = parse_notes(desc)
    fams = parse_family(desc)
    gender = parse_gender(desc)
    intro = parse_intro(name, desc)

    searchable = (low + " " + " ".join(fams).lower() + " " +
                  " ".join(notes["top"] + notes["heart"] + notes["base"]).lower())
    dims = {}
    for d, pats in DIMS.items():
        h = count_hits(searchable, pats)
        if h:
            dims[d] = min(3, h)

    warmth = count_hits(searchable, WARM_WORDS) - count_hits(searchable, FRESH_WORDS)
    sweet = dims.get("vanille", 0) + dims.get("gourmand", 0)
    intensity = count_hits(low, STRONG_WORDS) - count_hits(low, SOFT_WORDS) \
        + (1 if dims.get("oud") else 0) + (1 if dims.get("amber") else 0)
    night = count_hits(low, NIGHT_WORDS) - count_hits(low, DAY_WORDS)

    prices = [p for p in (p100, p50, p30) if isinstance(p, (int, float)) and p > 0]
    def money(v):
        return round(float(v), 2) if isinstance(v, (int, float)) and v > 0 else None
    products.append({
        "n": name,
        "g": gender,                       # dames | heren | unisex
        "f": fams,                          # geurfamilies
        "t": notes["top"][:6],
        "h": notes["heart"][:6],
        "b": notes["base"][:6],
        "i": intro,
        "p": min(prices) if prices else None,  # vanaf-prijs
        "v": [money(p30), money(p50), money(p100)],  # prijs 30 / 50 / 100 ml (null = niet leverbaar)
        "d": dims,                          # dimensiescores 0-3
        "w": max(-3, min(3, warmth)),       # warm (+) vs fris (-)
        "s": min(4, sweet),                 # zoetheid
        "x": max(-2, min(4, intensity)),    # intensiteit
        "o": max(-2, min(3, night)),        # avond (+) vs dag (-)
    })

print("producten:", len(products))
g = {}
for p in products:
    g[p["g"]] = g.get(p["g"], 0) + 1
print("gender:", g)
print("met dims:", sum(1 for p in products if p["d"]))
print("met noten:", sum(1 for p in products if p["t"] or p["h"] or p["b"]))
print("met intro:", sum(1 for p in products if p["i"]))
print("met prijs:", sum(1 for p in products if p["p"]))

js = ("/* Eliandi productcatalogus — gegenereerd uit 'Webshop producten .xlsx'.\n"
      "   Velden: n naam, g doelgroep, f geurfamilies, t/h/b top/hart/basisnoten,\n"
      "   i intro, p vanaf-prijs, d geurdimensies, w warmte, s zoetheid,\n"
      "   x intensiteit, o avond/dag, v prijzen 30/50/100 ml. */\n"
      "const ELIANDI_CATALOG = ")
js += json.dumps(products, ensure_ascii=False, separators=(",", ":"))
js += ";\n"
with open(OUT, "w") as f:
    f.write(js)
print("bytes:", len(js))

# Server-side prijslijst: de checkout rekent altijd met deze bedragen,
# nooit met prijzen die de browser meestuurt.
PRICES_OUT = OUT.replace("js/catalog.js", "api/_prices.json")
with open(PRICES_OUT, "w") as f:
    json.dump({p["n"]: p["v"] for p in products if any(p["v"])}, f,
              ensure_ascii=False, separators=(",", ":"))
print("prijslijst:", PRICES_OUT)

# steekproef
for p in products[:3] + products[200:202]:
    print("\n---", p["n"], "|", p["g"], "| €", p["p"])
    print("fam:", p["f"], "| dims:", p["d"], "| w", p["w"], "s", p["s"], "x", p["x"], "o", p["o"])
    print("top:", p["t"], "hart:", p["h"], "basis:", p["b"])
    print("intro:", p["i"][:100])
