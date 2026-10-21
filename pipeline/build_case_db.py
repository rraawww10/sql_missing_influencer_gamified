"""Build the case database for "SQL: The Missing Influencer".

Usage: python3 pipeline/build_case_db.py

Outputs
  content/case_db/seed/<table>.sql      reviewable INSERTs for every table (except the 1-lakh archive)
  content/case_db/snapshots/sNN.sqlite  one snapshot per session with only the tables unlocked by then

Story rows (the clue graph in docs/SESSION_PLAN.md §0.4) are written explicitly below.
Background "noise" rows come from a fixed-seed generator, so every build is identical.
Rule for noise: it must never create a second answer to a clue query (see the guards in each section).
"""

import json
import random
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CASE = ROOT / "content" / "case_db"
SCHEMA = CASE / "schema.sql"
SEED_DIR = CASE / "seed"
SNAP_DIR = CASE / "snapshots"

# Every character, place and plate comes from content/story/cast.json (rename there, rebuild)
CAST = json.loads((ROOT / "content" / "story" / "cast.json").read_text())
P = {k: v["name"] for k, v in CAST["people"].items()}
PL = {**CAST["places"], **CAST["plates"]}
FIRST_OF = {k: v["first"] for k, v in CAST["people"].items()}
# login of the manager in the label system (first initial + surname), e.g. "darora"
MANAGER_LOGIN = (FIRST_OF["manager"][0] + P["manager"].split()[-1]).lower()

rng = random.Random(20261212)


def ts(h, m, s=0, day=12, month=12):
    return f"2026-{month:02d}-{day:02d} {h:02d}:{m:02d}:{s:02d}"


def minutes(start_h, start_m, end_h, end_m, step):
    """Yield (h, m) from start to end inclusive, every `step` minutes."""
    t, end = start_h * 60 + start_m, end_h * 60 + end_m
    while t <= end:
        yield divmod(t, 60)
        t += step


# ---------------------------------------------------------------------------
# Shared reference data
# ---------------------------------------------------------------------------

FIRST = ["Aarav", "Divya", "Faisal", "Geeta", "Harish", "Ishaan", "Jagan", "Kiran", "Lavanya", "Manoj",
         "Nandini", "Omkar", "Padma", "Rahul", "Sneha", "Tarun", "Uma", "Varun", "Yamini", "Zoya",
         "Bhavana", "Chaitanya", "Deepak", "Esha", "Gopal", "Hema", "Irfan", "Jyothi", "Karthik", "Lalitha"]
LAST = ["Reddy", "Sharma", "Naidu", "Khan", "Bhatt", "Patel", "Kumar", "Kulkarni", "Pillai", "Gupta",
        "Rao", "Saxena", "Joshi", "Thakur", "Bose", "Chowdary", "Varma", "Shetty", "Mishra", "Prasad"]
# Surnames / first names of story characters must never appear in noise (checked below)
RESERVED_LAST = {v["name"].split()[-1] for v in CAST["people"].values()}
RESERVED_FIRST = set(FIRST_OF.values())
assert not RESERVED_LAST & set(LAST) and not RESERVED_FIRST & set(FIRST), "noise names collide with the cast"

PUBLIC_NAMES = []
for i in range(80):
    n = f"{FIRST[i % len(FIRST)]} {LAST[(i * 7) % len(LAST)]}"
    if n not in PUBLIC_NAMES:
        PUBLIC_NAMES.append(n)

PHONES = {
    P["star"]: "9876500001", P["manager"]: "9876500002", P["rival"]: "9876500003",
    P["fan"]: "9876500004", P["driver"]: "9876500005", P["organiser"]: "9876500006",
    P["sister"]: "9876500007",
}

HOTEL = PL["hotel"]
STADIUM = PL["stadium"]
GREEN_ACRES = PL["farm"]
SUV = PL["suv"]
HOMETOWN = PL["hometown"]

# Area names found in most Indian cities (pan-Indian on purpose)
TOWERS = {
    "MGR-04": f"{PL['hotel_area']} ({HOTEL})", "STN-09": "Station Road", "RRN-12": "Ring Road North",
    "RRJ-15": "Ring Road Junction", "RRO-17": PL["outskirts"], "CTS-02": STADIUM,
    "LKR-03": "Lake Road", "CHP-01": f"{HOMETOWN} town", "CHP-03": f"{HOMETOWN} market", "RLY-05": "Railway Colony",
    "TPK-07": "Tech Park", "CVL-08": "Civil Lines", "GDN-10": "Gandhi Nagar", "NHR-11": "Nehru Nagar",
    "SHV-13": "Shivaji Nagar", "MKT-14": "Market Yard", "OLD-16": "Old Town", "APR-18": "Airport Road",
    "CLG-19": "College Road", "HSP-20": "Hospital Road", "IND-21": "Industrial Area", "SCT-22": "Sector 12",
    "MDL-23": "Model Town", "PTL-24": "Patel Nagar", "INR-25": "Indira Nagar", "TLK-26": "Tilak Road",
    "NTJ-27": "Netaji Road", "BUS-28": "Bus Stand Road", "MND-29": "Sabzi Mandi", "AMB-30": "Ambedkar Nagar",
}
CITY_TOWERS = [t for t in TOWERS if t not in {"RRO-17", "CHP-01", "CHP-03"}]

PLACES = [HOTEL, STADIUM, "Tech Park", "Central Railway Station", "MG Road", "Civil Lines", "Lake Road",
          "Gandhi Nagar", "Nehru Nagar", "Old Town", "Market Yard", "Airport Road", "College Road", "Model Town",
          "Patel Nagar", "Indira Nagar", "Bus Stand", "Shivaji Nagar", "Sector 12", "Tilak Road"]


def vehicle_no(years, taken):
    """National BH-series plate: 'YY BH NNNN XX'. Noise never ends in 'EX' (a clue pattern)."""
    letters = "ABCDEFGHJKLMNPRSTUVWXYZ"
    while True:
        no = f"{rng.choice(years)} BH {rng.randint(1000, 9999)} {rng.choice(letters)}{rng.choice(letters)}"
        if not no.endswith(" EX") and no not in taken:
            taken.add(no)
            return no


def phone(taken):
    while True:
        p = f"9{rng.randint(100000000, 999999999)}"
        if not p.startswith("98765000") and p not in taken:
            taken.add(p)
            return p


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------

T = {}  # table -> list of row tuples (column order = schema order)


def build_hotel_guests():
    rows = [
        (17, P["star"], 704, ts(14, 0, day=11), "KEY_NOT_RETURNED", ts(18, 9, 40), "Service Lift"),
        (18, P["manager"], 705, ts(14, 5, day=11), "IN_ROOM", ts(19, 58, 15), "Lobby Lift"),
        (31, P["guest"], 512, ts(11, 30), "OUT", ts(18, 17, 2), "Lobby"),
    ]
    used_rooms, gid = {704, 705, 512}, 1
    for name in PUBLIC_NAMES[:40]:
        while gid in (17, 18, 31):
            gid += 1
        room = rng.choice([r for r in range(101, 911) if r % 100 <= 20 and r not in used_rooms])
        used_rooms.add(room)
        status = rng.choice(["IN_ROOM", "IN_ROOM", "OUT", "CHECKED_OUT"])
        last = ts(rng.randint(8, 22), rng.randint(0, 59), rng.randint(0, 59))
        loc = rng.choice(["Lobby Lift", "Lobby", "Room Door", "Pool Gate"])
        rows.append((gid, name, room, ts(rng.randint(10, 20), rng.choice([0, 15, 30, 45]), day=rng.choice([10, 11, 12])),
                     status, last, loc))
        gid += 1
    T["hotel_guests"] = sorted(rows)


def build_rumours():
    T["rumours"] = [
        (1, "She ran away for publicity before the show", "unverified_page", ts(18, 40)),
        (2, "A fan took her away", "unverified_page", ts(18, 52)),
        (3, "She is secretly flying to Mumbai", "unverified_page", ts(19, 5)),
        (4, "The cab driver did it", "unverified_page", ts(19, 20)),
        (5, "Police are checking hotel records", "news_channel", ts(18, 45)),
        (6, "Concert organisers have not cancelled the show", "news_channel", ts(19, 0)),
    ]


def build_suspects():
    # Canonical shape after Session 2 (role -> relation_to_case, age dropped, alibi added)
    T["suspects"] = [
        (P["manager"], "manager", PHONES[P["manager"]], "In hotel lobby all evening"),
        (P["rival"], "rival singer", PHONES[P["rival"]], "At stadium rehearsal"),
        (P["fan"], "fan page admin", PHONES[P["fan"]], "At a cafe in " + HOMETOWN),
        (P["driver"], "cab driver", PHONES[P["driver"]], "Driving another passenger"),
        (P["organiser"], "event organiser", PHONES[P["organiser"]], "At stadium production office"),
    ]


GATE_VEHICLES = {}  # vehicle_no -> (colour, owner_name, model, company_id)


def build_gate_log():
    story = [
        # gate, dir, time, vehicle, colour, person
        ("SERVICE", "IN", ts(13, 20, 11), PL["laundry_van"], "Grey", "Laundry van"),
        ("SERVICE", "OUT", ts(13, 50, 40), PL["laundry_van"], "Grey", "Laundry van"),
        ("SERVICE", "IN", ts(15, 0, 5), PL["flower_van"], "Red", "Flower delivery"),
        ("SERVICE", "OUT", ts(15, 20, 33), PL["flower_van"], "Red", "Flower delivery"),
        ("STAFF", "IN", ts(17, 40, 12), PL["fan_van"], "White", "Fan club volunteer"),
        ("STAFF", "OUT", ts(17, 58, 47), PL["fan_van"], "White", "Fan club volunteer"),
        ("SERVICE", "OUT", ts(18, 12, 5), SUV, "Grey", None),
        ("SERVICE", "IN", ts(18, 25, 18), PL["catering_van"], "White", "Catering van"),
        ("SERVICE", "OUT", ts(18, 55, 9), PL["catering_van"], "White", "Catering van"),
        ("SERVICE", "IN", ts(19, 52, 10), SUV, "Grey", P["manager"]),
        ("MAIN", "OUT", ts(18, 20, 31), None, None, P["guest"]),
        # the other '26 BH' plates ('26 BH%' = 9 rows in total)
        ("MAIN", "IN", ts(12, 40, 3), "26 BH 1290 AB", "White", None),
        ("MAIN", "OUT", ts(14, 5, 44), "26 BH 1290 AB", "White", None),
        ("MAIN", "IN", ts(16, 30, 26), "26 BH 8802 CK", "Black", None),
        ("MAIN", "IN", ts(17, 15, 50), PL["suv_near_miss"], "Grey", None),
        ("MAIN", "OUT", ts(18, 30, 14), PL["suv_near_miss"], "Grey", None),   # near-miss for '26 BH 4471 E_'
        ("MAIN", "IN", ts(20, 10, 37), "26 BH 3356 GH", "Silver", None),
        ("MAIN", "OUT", ts(21, 40, 2), "26 BH 3356 GH", "Silver", None),
        ("MAIN", "IN", ts(15, 10, 58), PL["ends_ex_other"], "Blue", None),    # third plate ending in 71
    ]
    staff = PUBLIC_NAMES[50:56]   # 60 unique public names: 0-39 residents, 40-49 crew, 50-55 hotel staff
    for i, name in enumerate(staff):
        story.append(("STAFF", "IN", ts(14, i, 10 + i), None, None, name))
        story.append(("STAFF", "OUT", ts(22, i, 20 + i), None, None, name))

    for v, colour, owner, model, company in [
        (PL["laundry_van"], "Grey", PL["hotel_company"], "Van", 4),
        (PL["flower_van"], "Red", "Petals Florist", "Van", None),
        (PL["fan_van"], "White", FIRST_OF["star"] + " Fan Club", "Van", None),
        (SUV, "Grey", PL["talent_company"], "SUV", 1),
        (PL["catering_van"], "White", "Annapurna Caterers", "Van", None),
        ("26 BH 1290 AB", "White", PUBLIC_NAMES[0], "Hatchback", None),
        ("26 BH 8802 CK", "Black", PUBLIC_NAMES[1], "Sedan", None),
        (PL["suv_near_miss"], "Grey", PUBLIC_NAMES[2], "Sedan", None),
        ("26 BH 3356 GH", "Silver", PUBLIC_NAMES[3], "SUV", None),
        (PL["ends_ex_other"], "Blue", PUBLIC_NAMES[4], "Hatchback", None),
        ("HTL 01", "White", PL["hotel_company"], "Shuttle bus", 4),
        ("HTL 02", "White", PL["hotel_company"], "Shuttle bus", 4),
    ]:
        GATE_VEHICLES[v] = (colour, owner, model, company)

    # hotel shuttles (MAIN)
    for k, (h, m) in enumerate(minutes(12, 15, 23, 15, 60)):
        bus = "HTL 01" if k % 2 == 0 else "HTL 02"
        story.append(("MAIN", "OUT", ts(h, m, 0), bus, "White", None))
        story.append(("MAIN", "IN", ts(h, m + 40, 0), bus, "White", None))

    # noise: MAIN gate only (SERVICE / STAFF are fully story-controlled)
    taken = set(GATE_VEHICLES)
    noise = []
    while len(story) + len(noise) < 300:
        h, m, s = rng.randint(12, 23), rng.randint(0, 59), rng.randint(1, 59)
        if rng.random() < 0.3:
            noise.append(("MAIN", rng.choice(["IN", "OUT"]), ts(h, m, s), None, None,
                          rng.choice(PUBLIC_NAMES[:40]) if rng.random() < 0.3 else None))
        else:
            v = vehicle_no(["21", "22", "23", "24", "25"], taken)
            colour = rng.choice(["White", "Black", "Silver", "Grey", "Red", "Blue"])
            GATE_VEHICLES[v] = (colour, rng.choice(PUBLIC_NAMES), rng.choice(["Hatchback", "Sedan", "SUV"]), None)
            noise.append(("MAIN", rng.choice(["IN", "OUT"]), ts(h, m, s), v, colour, None))

    rows = sorted(story + noise, key=lambda r: r[2])
    T["gate_log"] = [(i + 1,) + r for i, r in enumerate(rows)]


TOLL_VEHICLES = {}


def build_vehicles():
    rows = [(v, owner, model, colour, company) for v, (colour, owner, model, company) in GATE_VEHICLES.items()]
    rows.append((PL["company_sedan"], PL["talent_company"], "Sedan", "Black", 1))
    rows += [(v, owner, model, colour, None) for v, (colour, owner, model) in TOLL_VEHICLES.items()]
    T["vehicles"] = sorted(rows)


def build_cab_rides():
    raju = [  # the cab driver's whole day, 12 rides -> page 2 (rows 6-10) holds 17:55 and 18:10
        ("R-2104", PUBLIC_NAMES[10], "Central Railway Station", "Civil Lines", ts(8, 10), "COMPLETED", ts(8, 45), 210),
        ("R-2131", PUBLIC_NAMES[11], "Civil Lines", "Tech Park", ts(9, 0), "COMPLETED", ts(9, 50), 340),
        ("R-2160", PUBLIC_NAMES[12], "Tech Park", "Lake Road", ts(10, 30), "COMPLETED", ts(11, 5), 290),
        ("R-2185", PUBLIC_NAMES[13], "Lake Road", "Old Town", ts(11, 45), "COMPLETED", ts(12, 30), 260),
        ("R-2207", PUBLIC_NAMES[14], "Old Town", "Market Yard", ts(13, 0), "COMPLETED", ts(13, 25), 120),
        ("R-2230", PUBLIC_NAMES[15], "Market Yard", "Airport Road", ts(14, 20), "COMPLETED", ts(14, 55), 180),
        ("R-2252", PUBLIC_NAMES[16], "Airport Road", "Gandhi Nagar", ts(15, 40), "COMPLETED", ts(16, 10), 200),
        ("R-2270", PUBLIC_NAMES[17], "Gandhi Nagar", HOTEL, ts(16, 55), "COMPLETED", ts(17, 30), 150),
        ("R-2291", P["star"], HOTEL, STADIUM, ts(17, 55), "CANCELLED_BY_RIDER", ts(18, 8, 12), 420),
        ("R-2297", P["passenger"], HOTEL, "Central Railway Station", ts(18, 10), "COMPLETED", ts(18, 58), 380),
        ("R-2330", PUBLIC_NAMES[18], "Central Railway Station", "Nehru Nagar", ts(19, 30), "COMPLETED", ts(20, 5), 230),
        ("R-2362", PUBLIC_NAMES[19], "Nehru Nagar", "Model Town", ts(20, 45), "COMPLETED", ts(21, 10), 170),
    ]
    rows = []
    phones = set(PHONES.values())
    for rid, rider, pick, drop, booked, status, upd, fare in raju:
        rows.append((rid, rider, PHONES.get(rider) or phone(phones), P["driver"], pick, drop, booked, status, upd, fare))
    drivers = [f"{f} {l}" for f, l in zip(FIRST[5:25], LAST[3:23])]
    rows += [
        ("R-2045", P["organiser"], PHONES[P["organiser"]], drivers[0], "Gandhi Nagar", STADIUM, ts(9, 15), "COMPLETED", ts(9, 55), 310),
        ("R-2248", P["rival"], PHONES[P["rival"]], drivers[1], "Lake Road", STADIUM, ts(15, 30), "COMPLETED", ts(15, 58), 330),
        ("R-2282", P["fan"], PHONES[P["fan"]], drivers[2], HOMETOWN + " Bus Stand", PL["fan_cafe"], ts(17, 20), "COMPLETED", ts(17, 35), 90),
        ("R-2302", P["guest"], phone(phones), drivers[3], HOTEL, "Tech Park", ts(18, 18), "COMPLETED", ts(19, 2), 360),
    ]
    used_ids = {r[0] for r in rows}
    statuses = ["COMPLETED"] * 17 + ["CANCELLED_BY_RIDER", "CANCELLED_BY_DRIVER", "CANCELLED_BY_RIDER"]
    n = 1000
    while len(rows) < 400:
        n += rng.randint(1, 3)
        rid = f"R-{n}"
        if rid in used_ids:
            continue
        pick, drop = rng.sample(PLACES, 2)
        h, m = rng.randint(6, 23), rng.randint(0, 59)
        if pick == HOTEL and 17 <= h <= 18:
            pick = "Civil Lines"   # keep the hotel's 17:30-18:30 window story-controlled
        status = rng.choice(statuses)
        upd_min = h * 60 + m + rng.randint(5, 50)
        upd = ts(min(upd_min // 60, 23), upd_min % 60 if upd_min // 60 <= 23 else 59)
        rows.append((rid, rng.choice(PUBLIC_NAMES), phone(phones), rng.choice(drivers), pick, drop,
                     ts(h, m), status, upd, rng.randint(8, 90) * 10))
        used_ids.add(rid)
    T["cab_rides"] = sorted(rows)


def build_upi_payments():
    story = [
        (P["manager"], "Cab Ride", 300, None, ts(10, 15, day=10)),
        (P["manager"], "Office Supplies", 800, None, ts(16, 40, day=11)),
        (PL["label"], P["manager"], 200000, "advance", ts(21, 30, day=11)),
        (P["manager"], HOTEL, 1200, None, ts(9, 30, 12)),
        (P["manager"], "Biryani Junction", 2400, "team lunch", ts(13, 5, 40)),
        (P["manager"], "Ring Road Fuel Station", 3000, None, ts(14, 0, 22)),
        (P["manager"], GREEN_ACRES, 45000, "Green Acres - 2 guests", ts(16, 10, 5)),
        (P["manager"], "Ring Road Fuel Station", 2500, None, ts(17, 45, 51)),
        (P["manager"], "Highway Dhaba", 350, None, ts(19, 40, 18)),
        (P["star"], "Folk Studio Rentals", 5000, "studio", ts(11, 0, day=10)),
        (P["star"], P["sister"], 2000, "books", ts(19, 10, day=11)),
        (P["star"], "Hotel Spa", 1500, None, ts(15, 20, 9)),
        (P["star"] + " (Watch)", P["sister"], 1, "gReEn aCrEs", ts(19, 2, 30)),
        (P["fan"], PL["fan_cafe"], 180, "chai and samosa", ts(18, 30, 4)),
        (P["rival"], "Stadium Canteen", 240, None, ts(19, 15, 44)),
        (P["organiser"], "Sound Rentals Co", 30000, "speakers", ts(12, 0, 0)),
    ]
    merchants = ["Big Bazaar Stores", "Metro Rail", "Mobile Recharge", "Chai Point", "Medplus Pharmacy",
                 "City Bus Pass", "Book Corner", "Fresh Fruits Stall", "Movie Tickets", "Electricity Bill",
                 "Ration Shop", "Bakery Delight", "Petrol Pump", "Tiffin Centre", "Gym Fees"]
    notes = ["chai", "groceries", "rent share", "movie", "recharge", "bus ticket", "books", "medicine",
             "fees", "lunch", "snacks", "gift"]
    rows = list(story)
    while len(rows) < 600:
        frm = rng.choice(PUBLIC_NAMES)
        to = rng.choice(merchants + PUBLIC_NAMES + [P["sister"]])
        if to == frm:
            continue
        amount = rng.choice([rng.randint(10, 500), rng.randint(500, 5000)])
        if to == P["sister"] and amount == 1:
            continue
        day = rng.choice([10, 11, 12])
        rows.append((frm, to, amount, rng.choice(notes) if rng.random() < 0.4 else None,
                     ts(rng.randint(7, 23), rng.randint(0, 59), rng.randint(0, 59), day=day)))
    rows.sort(key=lambda r: r[4])
    T["upi_payments"] = [(f"U-{i + 1:05d}",) + r for i, r in enumerate(rows)]


def build_tower_pings():
    p = []

    def add(owner, dev, tower, t):
        p.append((owner, dev, tower, TOWERS[tower], t))

    # the singer: phone switched off after 18:00; watch keeps pinging
    for h, m in minutes(12, 0, 18, 0, 15):
        add(P["star"], "PHONE", "MGR-04", ts(h, m))
    for h, m in minutes(12, 0, 18, 0, 10):
        add(P["star"], "WATCH", "MGR-04", ts(h, m))
    for tower, (h, m) in [("STN-09", (18, 14)), ("RRN-12", (18, 24)), ("RRN-12", (18, 34)),
                          ("RRJ-15", (18, 42)), ("RRJ-15", (18, 47))]:
        add(P["star"], "WATCH", tower, ts(h, m))
    for h, m in minutes(18, 52, 23, 30, 6):
        add(P["star"], "WATCH", "RRO-17", ts(h, m))

    # the manager: same route, same RRO-17 minutes (18:52-19:22), back to the hotel by 19:55
    for h, m in minutes(12, 0, 18, 10, 10):
        add(P["manager"], "PHONE", "MGR-04", ts(h, m))
    for tower, (h, m) in [("STN-09", (18, 16)), ("RRN-12", (18, 26)), ("RRJ-15", (18, 38)), ("RRJ-15", (18, 46))]:
        add(P["manager"], "PHONE", tower, ts(h, m))
    for h, m in minutes(18, 52, 19, 22, 6):
        add(P["manager"], "PHONE", "RRO-17", ts(h, m))
    for tower, (h, m) in [("RRJ-15", (19, 28)), ("RRN-12", (19, 36)), ("STN-09", (19, 44))]:
        add(P["manager"], "PHONE", tower, ts(h, m))
    for h, m in minutes(19, 55, 23, 25, 10):
        add(P["manager"], "PHONE", "MGR-04", ts(h, m))

    # the others
    for h, m in minutes(12, 0, 23, 30, 20):
        add(P["fan"], "PHONE", "CHP-01", ts(h, m, 5))
    for h, m in minutes(12, 0, 23, 30, 30):
        add(P["sister"], "PHONE", "CHP-03", ts(h, m, 8))
    for h, m in minutes(12, 0, 15, 20, 20):
        add(P["rival"], "PHONE", "LKR-03", ts(h, m, 12))
    for h, m in minutes(15, 40, 21, 40, 20):
        add(P["rival"], "PHONE", "CTS-02", ts(h, m, 12))
    for h, m in minutes(12, 0, 23, 30, 30):
        add(P["organiser"], "PHONE", "CTS-02", ts(h, m, 18))
    raju_path = ["RLY-05", "CVL-08", "TPK-07", "LKR-03", "OLD-16", "MKT-14", "APR-18", "MGR-04", "MGR-04",
                 "RLY-05", "RLY-05", "NHR-11", "MDL-23"]
    for k, (h, m) in enumerate(minutes(12, 0, 23, 30, 30)):
        add(P["driver"], "PHONE", raju_path[min(k * len(raju_path) // 24, len(raju_path) - 1)], ts(h, m, 25))
    for h, m in minutes(12, 0, 23, 45, 15):
        add(P["caretaker"], "PHONE", "RRO-17", ts(h, m, 30))   # Green Acres caretaker

    # noise: public phones/watches across the city, never at RRO-17, never on a :00 second
    owners = PUBLIC_NAMES[:40]
    while len(p) < 5000:
        add(rng.choice(owners), rng.choice(["PHONE", "PHONE", "WATCH"]), rng.choice(CITY_TOWERS),
            ts(rng.randint(12, 23), rng.randint(0, 59), rng.randint(1, 59)))
    p.sort(key=lambda r: (r[4], r[0]))
    T["tower_pings"] = [(i + 1,) + r for i, r in enumerate(p)]


def build_watch_log():
    evening_hr = {(18, 0): 85, (18, 5): 92, (18, 10): 112, (18, 15): 104, (18, 20): 98, (18, 25): 96,
                  (18, 30): 95, (18, 35): 94, (18, 40): 96, (18, 45): 99, (18, 50): 101, (18, 55): 97,
                  (19, 0): 109}
    evening_steps = {(18, 0): 40, (18, 5): 60, (18, 10): 4, (18, 15): 0, (18, 20): 2, (18, 25): 0,
                     (18, 30): 0, (18, 35): 3, (18, 40): 0, (18, 45): 160, (18, 50): 120, (18, 55): 10}
    rows = []
    for i, (h, m) in enumerate(minutes(6, 0, 23, 55, 5)):
        if (h, m) in evening_hr:
            hr = evening_hr[(h, m)]
        elif h >= 19:
            hr = rng.randint(84, 90)
        else:
            hr = rng.randint(72, 82)
        if (h, m) in evening_steps:
            steps = evening_steps[(h, m)]
        elif h >= 19:
            steps = 0
        else:
            steps = rng.randint(0, 250)
        dist = round(steps * 0.7)
        if h >= 18:
            dist *= 100   # export bug: evening distance stored in cm (fixed by the learner in S7)
        rows.append((i + 1, ts(h, m), steps, dist, hr, 68))
    T["watch_log"] = rows


def build_alibis():
    T["alibis"] = [
        (P["manager"], "In hotel lobby all evening", None, 0),
        (P["rival"], "At stadium rehearsal", None, 0),
        (P["fan"], "At " + PL["fan_cafe"], "cafe UPI bill + tower pings", 1),
        (P["driver"], "Driving another passenger to the railway station", "cab app GPS", 1),
        (P["organiser"], "At stadium production office", None, 0),
    ]


def build_fan_dms():
    rows = [
        (CAST["handles"]["fan_handle"], P["fan"], TOWERS["CHP-01"], ts(17, 2, 10), FIRST_OF["star"] + ", all the best for tonight!"),
        (CAST["handles"]["fan_handle"], P["fan"], TOWERS["CHP-01"], ts(18, 40, 33), "Why is your phone switched off? Fans are worried"),
        (CAST["handles"]["fan_handle"], P["fan"], TOWERS["CHP-01"], ts(19, 30, 12), "Please reply once, " + FIRST_OF["star"]),
        (CAST["handles"]["fan_handle"], P["fan"], TOWERS["CHP-01"], ts(20, 55, 40), "Praying you are safe. Trust me, you will be"),
        (CAST["handles"]["fan_handle"], P["fan"], TOWERS["CHP-01"], ts(21, 20, 5), "Whole fan page is praying for you"),
        ("@folkbeats_daily", PUBLIC_NAMES[20], "Civil Lines", ts(18, 50, 1), "Is the show still on?"),
        ("@hyd_music_lover", PUBLIC_NAMES[21], "Indira Nagar", ts(19, 12, 44), "Waiting outside the stadium!"),
        ("@telangana_tunes", PUBLIC_NAMES[22], "Nehru Nagar", ts(19, 48, 9), "Hope you are okay"),
        ("@reel_queen_fans", PUBLIC_NAMES[23], "Central Railway Station", ts(20, 30, 27), "Love your songs"),
        ("@warangal_vibes", PUBLIC_NAMES[24], TOWERS["CHP-03"], ts(21, 5, 55), "Our " + HOMETOWN + " girl, come back soon"),
    ]
    T["fan_dms"] = [(i + 1,) + r for i, r in enumerate(rows)]


def build_smartwatch():
    T["smartwatch"] = [
        (1, 1, "Pulse Band 3", "ESIM-77810"),
        (2, 7, "Pulse Band 2", "ESIM-55213"),
        (3, 6, "FitTrack X", "ESIM-30044"),
    ]


PEOPLE = []


def build_people():
    core = [
        (1, P["star"], "Singer", "missing", STADIUM),
        (2, P["manager"], "Artist manager", "suspect", PL["talent_company"].replace(" Pvt Ltd", "") + " office"),
        (3, P["rival"], "Singer", "suspect", PL["studio"]),
        (4, P["fan"], "Fan page admin", "suspect", HOMETOWN),
        (5, P["driver"], "Cab driver", "suspect", "City roads"),
        (6, P["organiser"], "Event organiser", "suspect", STADIUM),
        (7, P["sister"], "Student", "family", HOMETOWN),
        (8, P["caretaker"], "Farm stay caretaker", "witness", GREEN_ACRES),
        (9, P["guest"], "Hotel guest", "public", "Tech Park"),
        (10, P["label_head"], "Label head, " + PL["label"], "public", PL["label"] + " office"),
        (11, P["passenger"], "Cab passenger", "witness", "Central Railway Station"),
        (12, P["rival_manager"], "Artist manager", "public", PL["rival_label"] + " office"),
    ]
    crew = [(13 + i, PUBLIC_NAMES[40 + i], "Stage crew", "crew", STADIUM) for i in range(10)]
    public = [(23 + i, n, "Resident", "public", rng.choice(PLACES[2:])) for i, n in enumerate(PUBLIC_NAMES[:30])]
    PEOPLE.extend(core + crew + public)
    T["people"] = PEOPLE


def build_upi_accounts():
    banks = ["Navyug Bank", "Sahyog Bank", "Udaan Co-op Bank", "Pragati Bank"]
    rows = []
    for pid, name, *_ in PEOPLE:
        handle = name.lower().replace(" ", ".") + "@" + rng.choice(["oknavyug", "oksahyog", "okudaan"])
        rows.append((handle, pid, rng.choice(banks)))
    rows.append((FIRST_OF["star"].lower() + ".watch@oknavyug", 1, "Navyug Bank"))
    T["upi_accounts"] = sorted(rows)


def build_company():
    T["company"] = [
        (1, PL["talent_company"], 2),
        (2, PL["label"], 10),
        (3, GREEN_ACRES, 8),
        (4, PL["hotel_company"], 23),
    ]


def build_person_tables():
    # Canonical versions of the learner-built Session 9 tables (ids match `people`)
    T["person"] = [(pid, name, occ) for pid, name, occ, *_ in PEOPLE[:12]]
    T["property"] = [
        (1, GREEN_ACRES, PL["outskirts"], "Rural District"),
        (2, "Lakeview Resort", "Lake Road", "Rural District"),
        (3, "Mango Grove Farms", "Highway belt", "Rural District"),
    ]
    T["booking"] = [
        (71, 1, 9, ts(12, 0, day=20, month=11)),
        (88, 1, 2, ts(18, 45)),
        (90, 2, 3, ts(11, 0, day=20)),
    ]
    T["booking_guest"] = [
        (1, 88, 2),
        (2, 88, None),   # "Sir + 1 lady" - the lady's name was never registered
        (3, 71, 9),
        (4, 90, 3),
    ]


def build_rehearsal():
    rows = [(3, STADIUM, ts(16, 0), ts(21, 30))]
    rows += [(13 + i, STADIUM, ts(14, 0), ts(23, 0)) for i in range(10)]
    T["rehearsal_attendance"] = rows


def build_events():
    T["event_schedule"] = [
        ("E0", P["rival"], ts(18, 0, day=28, month=11), ts(21, 0, day=28, month=11)),
        ("E1", P["star"], ts(19, 0), ts(0, 0, day=13)),
    ]
    T["insurance_claims"] = [
        ("C-480", "E0", 6, ts(12, 0, day=28, month=11), "Rain forecast", 0),
        ("C-501", "E1", 6, ts(19, 0, 1), "Artist not checked in by deadline", 1),
    ]


def build_tolls():
    taken = set(GATE_VEHICLES) | {PL["company_sedan"]}
    rows = [(SUV, PL["toll"], "OUTBOUND", ts(18, 41, 20)),
            (SUV, PL["toll"], "INBOUND", ts(19, 30, 45))]
    plazas = [PL["toll"], "Ring Road West Plaza", "Ring Road North Plaza", "National Highway Plaza"]
    while len(rows) < 200:
        v = vehicle_no(["21", "22", "23", "24", "25"], taken)
        TOLL_VEHICLES[v] = (rng.choice(["White", "Black", "Silver", "Red", "Blue"]), rng.choice(PUBLIC_NAMES),
                            rng.choice(["Truck", "Sedan", "SUV", "Hatchback", "Bus"]))
        rows.append((v, rng.choice(plazas), rng.choice(["OUTBOUND", "INBOUND"]),
                     ts(rng.randint(12, 23), rng.randint(0, 59), rng.randint(0, 59))))
    rows.sort(key=lambda r: r[3])
    T["toll_crossings"] = [(i + 1,) + r for i, r in enumerate(rows)]
    T["police_units"] = [
        ("PU-1", "Ring Road Rural Police Station", "Ring Road"),
        ("PU-2", "City North Patrol", "City North"),
        ("PU-3", "Highway Patrol", "Highway"),
    ]
    T["routes"] = [
        ("RT-1", "Via Ring Road Exit 15", GREEN_ACRES, 12.4),
        ("RT-2", "Via Old Highway", GREEN_ACRES, 15.8),
        ("RT-3", "Via the village road", GREEN_ACRES, 9.6),
    ]


def build_label():
    T["contracts"] = [
        ("C10", P["rival"], P["rival_manager"], PL["rival_label"], "Not Applicable", 0),
        ("C12", P["star"], P["manager"], PL["own_label"], "Applicable", 2500000),
    ]
    rows = []
    for month in (9, 10, 11, 12):
        rows += [
            (PL["own_label"], P["star"], 40000, ts(10, 0, day=1, month=month)),
            (PL["own_label"], P["manager"], 8000, ts(10, 5, day=1, month=month)),
            (PL["rival_label"], P["rival"], 35000, ts(11, 0, day=1, month=month)),
            (PL["rival_label"], P["rival_manager"], 7000, ts(11, 5, day=1, month=month)),
        ]
    rows.append((PL["label"], P["manager"], 200000, ts(21, 30, day=11)))
    rows.sort(key=lambda r: r[3])
    T["label_payments"] = [(f"P-{i + 1:03d}",) + r for i, r in enumerate(rows)]
    # Read with the course's ACID ideas only (RM #37): T7 never committed before the crash, so by
    # atomicity none of it applied; T9 committed, so by durability it survived the crash.
    T["txn_log"] = [
        (1, "T6", "START", None, None, None, "legal_team", ts(17, 50, 0)),
        (2, "T6", "WRITE", "contract_C10.payment_terms", "Net 30", "Net 15", "legal_team", ts(17, 50, 20)),
        (3, "T6", "COMMIT", None, None, None, "legal_team", ts(17, 51, 0)),
        (4, "T7", "START", None, None, None, MANAGER_LOGIN, ts(18, 5, 10)),
        (5, "T7", "WRITE", "contract_C12.missed_show_clause", "Not Applicable", "Applicable", MANAGER_LOGIN, ts(18, 5, 40)),
        (6, None, "CRASH", None, None, None, "system", ts(18, 7, 0)),
        (7, "T8", "START", None, None, None, "legal_team", ts(18, 15, 0)),
        (8, "T8", "WRITE", "contract_C10.renewal", "No", "Yes", "legal_team", ts(18, 15, 30)),
        (9, "T8", "COMMIT", None, None, None, "legal_team", ts(18, 16, 0)),
        (10, "T9", "START", None, None, None, MANAGER_LOGIN, ts(18, 20, 5)),
        (11, "T9", "WRITE", "contract_C12.missed_show_clause", "Not Applicable", "Applicable", MANAGER_LOGIN, ts(18, 20, 30)),
        (12, "T9", "WRITE", "contract_C12.manager_bonus", "0", "2500000", MANAGER_LOGIN, ts(18, 20, 40)),
        (13, "T9", "COMMIT", None, None, None, MANAGER_LOGIN, ts(18, 21, 0)),
    ]


# ---------------------------------------------------------------------------
# Snapshots
# ---------------------------------------------------------------------------

# Tables that appear in each session's snapshot (cumulative), plus removals
UNLOCKS = {
    1: ["hotel_guests"],
    2: ["rumours"],
    3: ["gate_log", "vehicles", "suspects"],
    4: ["cab_rides"],
    5: ["upi_payments"],
    6: ["tower_pings"],
    7: ["watch_log"],
    8: ["alibis", "fan_dms"],
    9: ["smartwatch"],     # person/property/booking/booking_guest are built by the learner in S9
    10: ["person", "property", "booking", "booking_guest", "people", "upi_accounts", "company",
         "rehearsal_attendance", "event_schedule", "insurance_claims"],
    11: ["toll_crossings", "police_units", "routes"],
    12: ["contracts", "label_payments", "txn_log"],   # tower_pings_archive: runtime/index_demo.sql
    13: [],
}
REMOVALS = {3: ["rumours"]}

# State the learner has already produced by the start of a session
PATCHES = {
    8: ["UPDATE watch_log SET distance_m = distance_m / 100 WHERE ts >= '2026-12-12 18:00:00';"],   # S7 TASK 7.6
    11: [f"UPDATE alibis SET verified = 1, verified_by = 'rehearsal attendance log' WHERE person_name = '{P['rival']}';",
         f"UPDATE alibis SET verified = 1, verified_by = 'insurance system: auto-generated claim' WHERE person_name = '{P['organiser']}';"],
}
VIEWS = {12: ["CREATE VIEW draft_suspects AS SELECT name FROM people WHERE role = 'suspect';"]}


def table_ddl():
    ddl = {}
    no_comments = re.sub(r"--[^\n]*", "", SCHEMA.read_text())   # comments may contain ';'
    for stmt in no_comments.split(";"):
        m = re.search(r"CREATE TABLE (\w+)", stmt)
        if m:
            ddl[m.group(1)] = stmt.strip() + ";"
    return ddl


def sql_literal(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def write_seeds(ddl):
    SEED_DIR.mkdir(parents=True, exist_ok=True)
    for old in SEED_DIR.glob("*.sql"):
        old.unlink()
    order = [t for s in sorted(UNLOCKS) for t in UNLOCKS[s] if t in T]
    for i, table in enumerate(order, 1):
        lines = [f"-- generated by pipeline/build_case_db.py — do not edit by hand\n"]
        lines += [f"INSERT INTO {table} VALUES ({', '.join(sql_literal(v) for v in row)});\n" for row in T[table]]
        (SEED_DIR / f"{i:02d}_{table}.sql").write_text("".join(lines))


def build_snapshots(ddl):
    SNAP_DIR.mkdir(parents=True, exist_ok=True)
    present, patches, views = [], [], []
    for s in sorted(UNLOCKS):
        present = [t for t in present if t not in REMOVALS.get(s, [])] + UNLOCKS[s]
        patches += PATCHES.get(s, [])
        views = VIEWS.get(s, [])
        path = SNAP_DIR / f"s{s:02d}.sqlite"
        path.unlink(missing_ok=True)
        db = sqlite3.connect(path)
        for table in present:
            db.execute(ddl[table])
            rows = T[table]
            cols = db.execute(f"SELECT COUNT(*) FROM pragma_table_info('{table}')").fetchone()[0]
            db.executemany(f"INSERT INTO {table} VALUES ({', '.join('?' * cols)})", rows)
        for stmt in patches:
            table = re.search(r"UPDATE (\w+)", stmt).group(1)
            if table in present:
                db.execute(stmt)
        for stmt in views:
            db.execute(stmt)
        db.commit()
        db.execute("VACUUM")
        db.close()
        print(f"  s{s:02d}.sqlite  {path.stat().st_size / 1024:8.0f} KB  tables: {', '.join(present)}")


def main():
    for fn in [build_hotel_guests, build_rumours, build_suspects, build_gate_log, build_cab_rides,
               build_upi_payments, build_tower_pings, build_watch_log, build_alibis, build_fan_dms,
               build_smartwatch, build_people, build_upi_accounts, build_company, build_person_tables,
               build_rehearsal, build_events, build_tolls, build_label]:
        fn()
    build_vehicles()   # needs gate + toll vehicles
    ddl = table_ddl()
    missing = set(ddl) - set(T) - {"tower_pings_archive"}   # built in the browser (runtime/index_demo.sql)
    assert not missing, f"no rows built for {missing}"
    write_seeds(ddl)
    print(f"seeds: {len(list(SEED_DIR.glob('*.sql')))} files")
    build_snapshots(ddl)


if __name__ == "__main__":
    main()
