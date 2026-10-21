-- Case DB schema for "SQL: The Missing Influencer".
-- All people, places, companies, phone numbers, UPI handles and vehicle numbers are fictional.
-- Datetimes use the course format 'YYYY-MM-DD HH:MM:SS' (RM #3).
-- Tables are unlocked per session by pipeline/build_case_db.py (see UNLOCKS there).

-- S1/S2 · hotel register
CREATE TABLE hotel_guests (
  guest_id INTEGER NOT NULL PRIMARY KEY,
  name VARCHAR(200),
  room_no INTEGER,
  check_in DATETIME,
  status VARCHAR(50),
  key_card_last_used DATETIME,
  key_card_last_location VARCHAR(100)
);

-- S2 · Lakshmi's rumour board (learner deletes / drops it)
CREATE TABLE rumours (
  rumour_id INTEGER NOT NULL PRIMARY KEY,
  rumour TEXT,
  source VARCHAR(100),
  posted_at DATETIME
);

-- S2 · created by the learner; canonical copy re-seeded from S3 onward
-- (final shape after S2: role renamed, age dropped, alibi added)
CREATE TABLE suspects (
  name VARCHAR(200),
  relation_to_case VARCHAR(100),
  phone VARCHAR(15),
  alibi VARCHAR(250)
);

-- S3 · hotel gates
CREATE TABLE gate_log (
  entry_id INTEGER NOT NULL PRIMARY KEY,
  gate VARCHAR(20),            -- MAIN / SERVICE / STAFF
  direction VARCHAR(5),        -- IN / OUT
  ts DATETIME,
  vehicle_no VARCHAR(20),      -- NULL for people on foot
  vehicle_colour VARCHAR(20),
  person_name VARCHAR(200)     -- noted by the guard, often NULL
);

CREATE TABLE vehicles (
  vehicle_no VARCHAR(20) NOT NULL PRIMARY KEY,
  owner_name VARCHAR(200),
  model VARCHAR(100),
  colour VARCHAR(20),
  company_id INTEGER           -- used from S10 (company table)
);

-- S4 · cab app
CREATE TABLE cab_rides (
  ride_id VARCHAR(10) NOT NULL PRIMARY KEY,
  rider_name VARCHAR(200),
  rider_phone VARCHAR(15),
  driver_name VARCHAR(200),
  pickup VARCHAR(200),
  drop_point VARCHAR(200),
  booked_at DATETIME,
  status VARCHAR(30),
  status_updated_at DATETIME,
  fare INTEGER
);

-- S5 · UPI (readable names; normalised upi_accounts arrives in S10)
CREATE TABLE upi_payments (
  txn_id VARCHAR(12) NOT NULL PRIMARY KEY,
  from_name VARCHAR(200),
  to_name VARCHAR(200),
  amount INTEGER,
  note VARCHAR(250),
  ts DATETIME
);

-- S6 · telecom
CREATE TABLE tower_pings (
  ping_id INTEGER NOT NULL PRIMARY KEY,
  device_owner VARCHAR(200),
  device_type VARCHAR(10),     -- PHONE / WATCH
  tower_id VARCHAR(10),
  tower_area VARCHAR(100),
  ts DATETIME
);

-- S7 · Meghna's smartwatch (one row per 5 minutes)
CREATE TABLE watch_log (
  log_id INTEGER NOT NULL PRIMARY KEY,
  ts DATETIME,
  steps INTEGER,
  distance_m INTEGER,          -- S7 snapshot: evening rows exported in cm (bug fixed by learner UPDATE)
  heart_rate INTEGER,
  resting_hr INTEGER
);

-- S8 · alibis and fan messages
CREATE TABLE alibis (
  person_name VARCHAR(200),
  claim VARCHAR(250),
  verified_by VARCHAR(200),
  verified BOOLEAN
);

CREATE TABLE fan_dms (
  dm_id INTEGER NOT NULL PRIMARY KEY,
  sender_handle VARCHAR(100),
  sender_name VARCHAR(200),
  tower_area VARCHAR(100),
  ts DATETIME,
  body TEXT
);

-- S9 · pre-seeded 1:1 table (no FK: `person` is created by the learner in S9)
CREATE TABLE smartwatch (
  id INTEGER NOT NULL PRIMARY KEY,
  person_id INTEGER UNIQUE,
  model VARCHAR(100),
  esim_number VARCHAR(20)
);

-- S9 · created by the learner (TASK 9.1–9.4); canonical copies from S10 onward
CREATE TABLE person (
  id INTEGER NOT NULL PRIMARY KEY,
  name VARCHAR(250),
  role VARCHAR(100)
);

CREATE TABLE property (
  id INTEGER NOT NULL PRIMARY KEY,
  name VARCHAR(250),
  area VARCHAR(250),
  district VARCHAR(100)
);

CREATE TABLE booking (
  id INTEGER NOT NULL PRIMARY KEY,
  property_id INTEGER,
  booked_by INTEGER,
  check_in DATETIME,
  FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE,
  FOREIGN KEY (booked_by) REFERENCES person(id) ON DELETE CASCADE
);

CREATE TABLE booking_guest (
  id INTEGER NOT NULL PRIMARY KEY,
  booking_id INTEGER,
  person_id INTEGER,           -- NULL = guest without a registered name
  FOREIGN KEY (booking_id) REFERENCES booking(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE CASCADE
);

-- S10 · normalised city data
CREATE TABLE people (
  person_id INTEGER NOT NULL PRIMARY KEY,
  name VARCHAR(200),
  occupation VARCHAR(100),
  role VARCHAR(20),            -- suspect / missing / family / witness / crew / public
  venue VARCHAR(200)           -- usual work venue (same column name as rehearsal_attendance: NATURAL JOIN trap)
);

CREATE TABLE upi_accounts (
  upi_id VARCHAR(50) NOT NULL PRIMARY KEY,
  person_id INTEGER,
  bank VARCHAR(100),
  FOREIGN KEY (person_id) REFERENCES people(person_id)
);

CREATE TABLE company (
  company_id INTEGER NOT NULL PRIMARY KEY,
  name VARCHAR(200),
  owner_person_id INTEGER,
  FOREIGN KEY (owner_person_id) REFERENCES people(person_id)
);

CREATE TABLE rehearsal_attendance (
  person_id INTEGER,
  venue VARCHAR(200),
  check_in DATETIME,
  check_out DATETIME,
  FOREIGN KEY (person_id) REFERENCES people(person_id)
);

CREATE TABLE event_schedule (
  event_id VARCHAR(10) NOT NULL PRIMARY KEY,
  artist_name VARCHAR(200),
  artist_checkin_deadline DATETIME,
  show_time DATETIME
);

CREATE TABLE insurance_claims (
  claim_id VARCHAR(10) NOT NULL PRIMARY KEY,
  event_id VARCHAR(10),
  filed_by_person_id INTEGER,
  filed_at DATETIME,
  reason VARCHAR(250),
  auto_generated BOOLEAN,
  FOREIGN KEY (event_id) REFERENCES event_schedule(event_id),
  FOREIGN KEY (filed_by_person_id) REFERENCES people(person_id)
);

-- S11 · roads
CREATE TABLE toll_crossings (
  crossing_id INTEGER NOT NULL PRIMARY KEY,
  vehicle_no VARCHAR(20),
  plaza VARCHAR(100),
  direction VARCHAR(10),       -- OUTBOUND (away from city) / INBOUND
  ts DATETIME
);

CREATE TABLE police_units (
  unit_id VARCHAR(10) NOT NULL PRIMARY KEY,
  name VARCHAR(200),
  base_area VARCHAR(100)
);

CREATE TABLE routes (
  route_id VARCHAR(10) NOT NULL PRIMARY KEY,
  name VARCHAR(200),
  destination VARCHAR(200),
  km FLOAT
);

-- S12 · label system
CREATE TABLE contracts (
  contract_id VARCHAR(10) NOT NULL PRIMARY KEY,
  artist_name VARCHAR(200),
  manager_name VARCHAR(200),
  label_name VARCHAR(200),
  missed_show_clause VARCHAR(50),
  manager_bonus INTEGER
);

CREATE TABLE label_payments (
  payment_id VARCHAR(10) NOT NULL PRIMARY KEY,
  payer VARCHAR(200),
  payee VARCHAR(200),
  amount INTEGER,
  ts DATETIME
);

CREATE TABLE txn_log (
  lsn INTEGER NOT NULL PRIMARY KEY,
  txn_id VARCHAR(10),          -- NULL for the CRASH record
  entry_type VARCHAR(12),      -- START / WRITE / COMMIT / CRASH
  data_item VARCHAR(100),
  old_value VARCHAR(100),
  new_value VARCHAR(100),
  user_name VARCHAR(50),
  ts DATETIME
);

-- S12 · index demo only (1 lakh rows)
CREATE TABLE tower_pings_archive (
  ping_id INTEGER NOT NULL PRIMARY KEY,
  device_owner VARCHAR(200),
  device_type VARCHAR(10),
  tower_id VARCHAR(10),
  tower_area VARCHAR(100),
  ts DATETIME
);
