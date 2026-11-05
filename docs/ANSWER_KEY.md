Answer key: all 13 episodes


**Episode 1: She's Gone**

Step 1 (Activity): Ira drops five things on your desk. Which of them are data (stored information)?
- The hotel register entry for Room 704 → Data
- Tara's last reel on her profile → Data
- A UPI payment receipt → Data
- Something a man on the street said and nobody wrote down → Not data
- The cab app's booking history → Data

Step 2 (Activity): A DBMS has four advantages. Match each problem Ira has tonight to the advantage that solves it.
- Only police can see the guest list, not the public → Security
- The receptionist adds new guests quickly, without any coding → Ease of Use
- Last night's entries must still be there after a power cut → Durability and Availability
- We need the answer in seconds, not hours → Performance

Step 3 (Activity): Sort the evidence: is it organised as a table, or not?
- Hotel register: guest, room, check-in time → Relational (tables)
- Cab bookings: ride id, rider, driver, time → Relational (tables)
- Tara's reel video with its comments → Non-relational (non-tabular)
- UPI payments: from, to, amount, time → Relational (tables)

Step 4 (Quick check): Which of these is a Relational DBMS?
- Answer: SQLite

Step 5 (Activity): Two printouts of the same table — one from 5 PM, one from 6 PM. Find Tara's row and tap the cell that changed.
- Answer: In the table hotel_guests at 6:00 PM, click row 1, column status (value KEY_NOT_RETURNED)

Step 7 (Quick check): The hotel staff add and find guests without opening any database files. What do they use?
- Answer: A Database Management System (DBMS)

**Episode 2: Build the Case File**

Step 1 (Activity): Pick the best data type for each piece of case information.
- Phone number, like 9876500002 → VARCHAR
- Age, like 38 → INTEGER
- Is the alibi verified? (yes/no) → BOOLEAN
- Last seen at 2026-12-12 18:09:40 → DATETIME

Step 2 (SQL task T2.1): Create a table suspects with these columns:
- Query: CREATE TABLE suspects (name VARCHAR(200), role VARCHAR(100), phone VARCHAR(15), age INT);
- Result: Table ready. Empty, but ready.

Step 3 (SQL task T2.2): Check the structure of your suspects table.
- Query: PRAGMA TABLE_INFO(suspects);

Step 4 (SQL task T2.3): Ira's notebook has the five suspects. Insert all five rows into suspects — copy them exactly, even if something looks wrong.
- Query: INSERT INTO suspects (name, role, phone, age) VALUES ('Dev Arora', 'manager', '9876500002', 38), ('Nysa Kapoor', 'rival singer', '9876500003', 24), ('Ishita Das', 'fan page admin', '9876500004', 19), ('Sunny Gill', 'cab driver', '9876500050', 45), ('Kunal Bajaj', 'event organiser', '9876500006', 41);

Step 5 (SQL task T2.4): Let's view the added data! Show all columns of suspects.
- Query: SELECT * FROM suspects;

Step 6 (SQL task T2.5): Ira only wants name and role. Show just those two columns.
- Query: SELECT name, role FROM suspects;

Step 7 (SQL task T2.6): Find Tara's row: from hotel_guests, get all the columns of the guest whose name is "Tara Sen". Then read the last two columns — where and when was her key card used last?
- Query: SELECT * FROM hotel_guests WHERE name = "Tara Sen";
- Result: One row. Look at the last two columns before you continue.

Step 8 (Activity): This is the row your query returned. Tap the cell that says where her key card was tapped last.
- Answer: In the table Your result, click row 1, column key_card_last_location (value Service Lift)

Step 10 (SQL task T2.7): The notebook had a typo: Sunny Gill's phone is really 9876500005. Fix only his row.
- Query: UPDATE suspects SET phone = '9876500005' WHERE name = 'Sunny Gill';

Step 11 (Quick check): SELECT FROM suspects; and select from suspects; — what happens?
- Answer: Both give the same output; writing keywords in UPPER CASE is the best practice

Step 12 (SQL task T2.8a): Delete every rumour whose source is 'unverified_page'.
- Query: DELETE FROM rumours WHERE source = 'unverified_page';
- Result: 4 rumours gone. Only the two news-channel facts are left.

Step 13 (SQL task T2.8b): The news facts are already in our case notes. Delete all rows from rumours, but keep the table.
- Query: DELETE FROM rumours;

Step 14 (SQL task T2.8c): We don't need the rumour board at all. Remove the rumours table from the database.
- Query: DROP TABLE rumours;

Step 15 (Activity): DELETE vs DROP — match each command to what it does.
- DELETE FROM rumours WHERE … → Removes specific rows; the table stays
- DROP TABLE rumours → Removes the entire table from the database

Step 16 (SQL task T2.9): Add a column alibi of type VARCHAR(250) to suspects.
- Query: ALTER TABLE suspects ADD alibi VARCHAR(250);

Step 17 (SQL task T2.10): role is unclear. Rename it to relation_to_case.
- Query: ALTER TABLE suspects RENAME COLUMN role TO relation_to_case;

Step 18 (SQL task T2.11): Age doesn't matter for alibis. Remove the age column.
- Query: ALTER TABLE suspects DROP COLUMN age;

Step 19 (SQL task T2.12): Kabir has filled in what four suspects claim. Dev's is still empty.
- Query: UPDATE suspects SET alibi = 'In hotel lobby all evening' WHERE name = 'Dev Arora';
- Result: Noted. We'll check every claim later. Claims are not proof.

Step 20 (Activity): ALTER or UPDATE? Sort each change.
- Add an alibi column → ALTER (changes the table's layout)
- Fix Sunny's phone number → UPDATE (changes the data)
- Rename role to relation_to_case → ALTER (changes the table's layout)
- Write Dev's alibi → UPDATE (changes the data)

Step 21 (Quick check): Which command changes the layout of a table?
- Answer: ALTER

**Episode 3: Hotel Gate Log**

Step 1 (SQL task T3.1): Tara's key card was used at 18:09. Get all the details of every gate entry from 6 PM onwards (ts greater than or equal to '2026-12-12 18:00:00').
- Query: SELECT * FROM gate_log WHERE ts >= '2026-12-12 18:00:00';
- Result: 144 rows; 144 rows. Too many to read one by one. Let's narrow it down.

Step 2 (SQL task T3.2): The service lift opens near the service gate. Show all the details of every entry that was not at the 'MAIN' gate.
- Query: SELECT * FROM gate_log WHERE gate <> 'MAIN';
- Result: 22 rows

Step 3 (SQL task T3.3a): Show all the details of entries where the vehicle number starts with 26 BH.
- Query: SELECT * FROM gate_log WHERE vehicle_no LIKE '26 BH%';
- Result: 9 rows

Step 4 (SQL task T3.3b): Now the other end: entries where the vehicle number ends with EX.
- Query: SELECT * FROM gate_log WHERE vehicle_no LIKE '%EX';
- Result: 3 rows

Step 5 (SQL task T3.3c): The plate is 26 BH 4471 E?, where ? is one unknown letter. Find those entries.
- Query: SELECT * FROM gate_log WHERE vehicle_no LIKE '26 BH 4471 E_';
- Result: 2 rows; Two rows, same grey SUV: it left by the service gate at 18:12:05… and came back at 19:52.

Step 6 (SQL task T3.4): Guards sometimes write a name. Find entries where person_name contains Arora.
- Query: SELECT * FROM gate_log WHERE person_name LIKE '%Arora%';
- Result: 1 row; Dev Arora — Tara's manager — was driving that SUV when it came back at 19:52. Ira: "He told us he never left the lobby."

Step 7 (SQL task T3.5): Show entries at the 'SERVICE' gate and with direction 'OUT' and from 6 PM onwards.
- Query: SELECT * FROM gate_log WHERE gate = 'SERVICE' AND direction = 'OUT' AND ts >= '2026-12-12 18:00:00';
- Result: 2 rows; Only two vehicles left by the service gate after 6: the grey SUV at 18:12 and a catering van at 18:55.

Step 8 (SQL task T3.6): Show entries at the 'SERVICE' gate or the 'STAFF' gate.
- Query: SELECT * FROM gate_log WHERE gate = 'SERVICE' OR gate = 'STAFF';
- Result: 22 rows; 22 rows — the same as gate <> 'MAIN'. Two different queries, one answer.

Step 9 (SQL task T3.7): Hotel shuttle buses have numbers starting with HTL. Show entries whose vehicle number does not start with HTL.
- Query: SELECT * FROM gate_log WHERE NOT vehicle_no LIKE 'HTL%';
- Result: 180 rows; 180 rows. Notice: people on foot (no vehicle number) are not in this list either — an empty value is neither 'HTL…' nor 'not HTL…'.

Step 10 (SQL task T3.8): Ira: "Show me grey vehicles that used the service gate or the staff gate." Get all the details.
- Query: SELECT * FROM gate_log WHERE vehicle_colour = 'Grey' AND (gate = 'SERVICE' OR gate = 'STAFF');
- Result: 4 rows; 4 rows. Read the ts, direction and person_name columns of the two SUV rows before you continue.

Step 11 (Quick check): Your 4 rows: two are a laundry van in the afternoon. What do the other two rows say?
- Answer: Grey SUV 26 BH 4471 EX went OUT by the service gate at 18:12 and came back IN at 19:52 — with Dev Arora noted at the wheel

Step 13 (SQL task T3.9): Look up the SUV in the vehicles table: all details of vehicle '26 BH 4471 EX'.
- Query: SELECT * FROM vehicles WHERE vehicle_no = '26 BH 4471 EX';
- Result: 1 row; Owner: DA Talent Management Pvt Ltd. Ira: "Never heard of it. Note it down — we'll find out who owns that company."

Step 14 (Quick check): Which pattern finds names that start with 'a' and have at least 2 characters?
- Answer: LIKE "a_%"

**Episode 4: The Last Cab**

Step 1 (SQL task T4.1): Show the rider_name of every ride booked from any of these phone numbers:
- Query: SELECT rider_name FROM cab_rides WHERE rider_phone IN ('9876500001', '9876500002', '9876500003', '9876500004', '9876500005', '9876500006');
- Result: 4 rows; Four rides. Dev never booked a cab today — interesting.

Step 2 (SQL task T4.2): Show the ride_id of rides picked up at 'The Grand Residency' and booked between 17:30 and 18:30.
- Query: SELECT ride_id FROM cab_rides WHERE pickup = 'The Grand Residency' AND booked_at BETWEEN '2026-12-12 17:30:00' AND '2026-12-12 18:30:00';
- Result: 3 rows

Step 3 (SQL task T4.3): Same hotel rides between 17:30 and 18:30 — show ride_id, status and booked_at, newest first.
- Query: SELECT ride_id, status, booked_at FROM cab_rides WHERE pickup = 'The Grand Residency' AND booked_at BETWEEN '2026-12-12 17:30:00' AND '2026-12-12 18:30:00' ORDER BY booked_at DESC;
- Result: 3 rows

Step 4 (SQL task T4.4): Show the same three columns sorted by status (A → Z), and for the same status, newest first.
- Query: SELECT ride_id, status, booked_at FROM cab_rides WHERE pickup = 'The Grand Residency' AND booked_at BETWEEN '2026-12-12 17:30:00' AND '2026-12-12 18:30:00' ORDER BY status ASC, booked_at DESC;
- Result: 3 rows; The cancelled ride comes first: R-2291.

Step 5 (SQL task T4.5): Which drivers picked anyone up from 'The Grand Residency' today? Show each driver_name once.
- Query: SELECT DISTINCT driver_name FROM cab_rides WHERE pickup = 'The Grand Residency';

Step 6 (SQL task T4.6): Get Tara's latest booking: ride_id, driver_name, booked_at, status, status_updated_at for rider 'Tara Sen'.
- Query: SELECT ride_id, driver_name, booked_at, status, status_updated_at FROM cab_rides WHERE rider_name = 'Tara Sen' ORDER BY booked_at DESC LIMIT 1;
- Result: 1 row; One row. Read status and status_updated_at before you continue.

Step 7 (Quick check): Your row for ride R-2291: what happened to Tara's booking, and when?
- Answer: CANCELLED_BY_RIDER — she cancelled it herself at 18:08:12, 13 minutes after booking

Step 9 (SQL task T4.7): Sunny's rides, 5 per page, oldest first. Show page 2: ride_id, rider_name, pickup, drop_point, booked_at for driver 'Sunny Gill'.
- Query: SELECT ride_id, rider_name, pickup, drop_point, booked_at FROM cab_rides WHERE driver_name = 'Sunny Gill' ORDER BY booked_at LIMIT 5 OFFSET 5;
- Result: 5 rows; Page 2. Find R-2291 — then read the row right after it.

Step 10 (Quick check): On page 2, what did Sunny do right after Tara's ride was cancelled?
- Answer: Ride R-2297 at 18:10 — he took Farhan Ali from the hotel to the railway station

Step 12 (Quick check): Skip the first 10 rides, then show the next 5. Which is right?
- Answer: LIMIT 5 OFFSET 10

**Episode 5: Follow the Money**

Step 1 (SQL task T5.1): Dev Arora's payments today (from '2026-12-12 00:00:00'): show SUM, COUNT, MAX, MIN and AVG of amount — in that order.
- Query: SELECT SUM(amount), COUNT(amount), MAX(amount), MIN(amount), AVG(amount) FROM upi_payments WHERE from_name = 'Dev Arora' AND ts >= '2026-12-12 00:00:00';
- Result: 1 row; ₹54,450 in six payments — and one of them is ₹45,000.

Step 2 (SQL task T5.2n): How many of Dev's payments today have a note?
- Query: SELECT COUNT(note) FROM upi_payments WHERE from_name = 'Dev Arora' AND ts >= '2026-12-12 00:00:00';
- Result: Only 2 have notes: team lunch and Green Acres - 2 guests.

Step 3 (SQL task T5.sum_text): Try it: what is SUM(note) over all of upi_payments?
- Query: SELECT SUM(note) FROM upi_payments;
- Result: 0.0 — not zero money. You added up words, and SQLite treats text as 0.

Step 4 (SQL task T5.2): Show Dev's biggest payment ever, with the column named biggest_payment.
- Query: SELECT MAX(amount) AS biggest_payment FROM upi_payments WHERE from_name = 'Dev Arora';

Step 5 (SQL task T5.3): Find the ₹1 payment: show from_name, amount, note, ts of payments to 'Mahi Sen' with amount = 1.
- Query: SELECT from_name, amount, note, ts FROM upi_payments WHERE to_name = 'Mahi Sen' AND amount = 1;
- Result: 1 row; One payment. Read the note column carefully.

Step 6 (Activity): This is the row your query returned. Tap the note — the only thing Tara could type.
- Answer: In the table Your result, click row 1, column note (value gReEn aCrEs)

Step 8 (SQL task T5.4): Total money received per person today: to_name and SUM(amount) as total, for payments from '2026-12-12 00:00:00'.
- Query: SELECT to_name, SUM(amount) AS total FROM upi_payments WHERE ts >= '2026-12-12 00:00:00' GROUP BY to_name;

Step 9 (SQL task T5.5): Who paid whom the most over the three days? For each pair from_name, to_name, show the SUM(amount) as total — biggest total first, top 5 only.
- Query: SELECT from_name, to_name, SUM(amount) AS total FROM upi_payments GROUP BY from_name, to_name ORDER BY total DESC LIMIT 5;
- Result: 5 rows; Top of the list: Skyline Records → Dev Arora, ₹2,00,000. Second: Dev → Green Acres Farm Stays, ₹45,000. Who is Skyline Records, and why do they pay Tara's manager?

Step 10 (SQL task T5.5b): Open that payment: all columns of payments from 'Skyline Records' to 'Dev Arora'.
- Query: SELECT * FROM upi_payments WHERE from_name = 'Skyline Records' AND to_name = 'Dev Arora';
- Result: 1 row; Read the note and the ts: advance, paid yesterday evening.

Step 12 (SQL task T5.6): Only Dev's payments: to_name and SUM(amount) per receiver.
- Query: SELECT to_name, SUM(amount) FROM upi_payments WHERE from_name = 'Dev Arora' GROUP BY to_name;
- Result: 7 rows; Seven receivers. Fuel, biryani, a dhaba, the hotel… and Green Acres Farm Stays: ₹45,000. A farm stay, on the day of her show?

Step 13 (SQL task T5.6b): Open that payment: all columns of payments from 'Dev Arora' to 'Green Acres Farm Stays'.
- Query: SELECT * FROM upi_payments WHERE from_name = 'Dev Arora' AND to_name = 'Green Acres Farm Stays';
- Result: 1 row; Read the ts and the note.

Step 15 (Quick check): What does COUNT(note) skip?
- Answer: Rows where note is NULL

**Episode 6: Phone Towers**

Step 1 (SQL task T6.1): Warm-up: for Tara's watch (device_owner 'Tara Sen', device_type 'WATCH'), show tower_id, tower_area and the number of pings as pings, per tower.
- Query: SELECT tower_id, tower_area, COUNT(*) AS pings FROM tower_pings WHERE device_owner = 'Tara Sen' AND device_type = 'WATCH' GROUP BY tower_id, tower_area;
- Result: 5 rows

Step 2 (SQL task T6.2): Where has she been since she left? Towers with more than 5 pings from 'Tara Sen' from 6 PM onwards: show tower_id, tower_area, pings, and the first and last ping as MIN(ts) and MAX(ts).
- Query: SELECT tower_id, tower_area, COUNT(*) AS pings, MIN(ts), MAX(ts) FROM tower_pings WHERE device_owner = 'Tara Sen' AND ts >= '2026-12-12 18:00:00' GROUP BY tower_id, tower_area HAVING pings > 5;
- Result: 1 row; One tower. Read all five columns.

Step 3 (Quick check): Your result has one row. What does it tell us?
- Answer: Since 18:52 her watch has hit only tower RRO-17 (Ring Road outskirts) — 47 pings, the last one at 23:28, which is right now

Step 5 (SQL task T6.3): Dev's phone ('Dev Arora'), from 6 PM: tower_id, COUNT(*), MIN(ts), MAX(ts) for towers with more than 3 pings.
- Query: SELECT tower_id, COUNT(*), MIN(ts), MAX(ts) FROM tower_pings WHERE device_owner = 'Dev Arora' AND ts >= '2026-12-12 18:00:00' GROUP BY tower_id, tower_area HAVING COUNT(*) > 3;
- Result: 2 rows; Two towers, not one. Compare the second row with Tara's.

Step 6 (Quick check): Dev said he was in the hotel lobby all evening. What do his two rows say?
- Answer: Besides the hotel tower MGR-04, his phone hit RRO-17 six times between 18:52 and 19:22 — the same tower as Tara's watch

Step 8 (Quick check): Which clause filters groups?
- Answer: HAVING

**Episode 7: Smartwatch Secrets**

Step 1 (SQL task T7.1): For every log, show ts and how much her heart rate was above resting (heart_rate - resting_hr) as hr_rise.
- Query: SELECT ts, heart_rate - resting_hr AS hr_rise FROM watch_log;
- Result: 216 rows

Step 2 (SQL task T7.2): Show ts and the distance in kilometres (distance_m / 1000.0) as distance_km.
- Query: SELECT ts, distance_m / 1000.0 AS distance_km FROM watch_log;
- Result: 216 rows; Look at the evening rows — 11 km in 5 minutes while sitting still? Something's wrong with the evening export. Keep reading.

Step 3 (SQL task T7.3): The watch syncs fully every 15 minutes, i.e. every 3rd log. Show all the details of logs whose log_id divides evenly by 3.
- Query: SELECT * FROM watch_log WHERE log_id % 3 = 0;
- Result: 72 rows

Step 4 (SQL task T7.4): For log 147 only, show one column like 2026-12-12 18:10:00 - 112 bpm (time, - , heart rate, bpm).
- Query: SELECT ts || ' - ' || heart_rate || ' bpm' AS reading FROM watch_log WHERE log_id = 147;
- Result: 1 row

Step 5 (SQL task T7.5): Find her heart-rate spikes: all the details of logs where heart_rate - resting_hr is 40 or more.
- Query: SELECT * FROM watch_log WHERE (heart_rate - resting_hr) >= 40;
- Result: 2 rows; Two spikes: 18:10 (112 bpm — when she realised the car wasn't going to the stadium) and 19:00 (109 bpm — just before her ₹1 message).

Step 6 (SQL task T7.6): Kabir: "The evening export saved distance in centimetres." Fix it: from 6 PM onwards, divide distance_m by 100.
- Query: UPDATE watch_log SET distance_m = distance_m / 100 WHERE ts >= '2026-12-12 18:00:00';

Step 7 (SQL task T7.8): Steps per hour: show the hour (strftime('%H', ts)) as hour and SUM(steps) as steps, one row per hour.
- Query: SELECT strftime('%H', ts) AS hour, SUM(steps) AS steps FROM watch_log GROUP BY hour;
- Result: 18 rows; After 19:00 — zero steps. She's sitting in one place.

Step 8 (SQL task T7.7): Which hours had an average heart-rate rise above 25? Show just the hour.
- Query: SELECT strftime('%H', ts) AS hour FROM watch_log GROUP BY hour HAVING AVG(heart_rate - resting_hr) > 25;
- Result: 1 row

Step 9 (SQL task T7.9): All the details of logs from hour 18 onwards, comparing the hour as a number.
- Query: SELECT * FROM watch_log WHERE CAST(strftime('%H', ts) AS INTEGER) >= 18;
- Result: 72 rows

Step 10 (SQL task T7.10): How far did she walk after 18:45? Show the total distance in km as ROUND(…, 1), CEIL(…) and FLOOR(…) — in that order. (The cm fix is already applied.)
- Query: SELECT ROUND(SUM(distance_m) / 1000.0, 1) AS km, CEIL(SUM(distance_m) / 1000.0) AS km_ceil, FLOOR(SUM(distance_m) / 1000.0) AS km_floor FROM watch_log WHERE ts >= '2026-12-12 18:45:00';
- Result: 1 row; About 0.2 km — she walked only 200 metres from where the car stopped.

Step 11 (SQL task T7.11): Decode the ₹1 note (S5-C1: gReEn aCrEs). The capitals hide a name — so ignore letter case. From upi_payments, show from_name, to_name, amount, note, ts where the note contains green acres in any letter case.
- Query: SELECT from_name, to_name, amount, note, ts FROM upi_payments WHERE UPPER(note) LIKE UPPER('%green acres%');
- Result: 2 rows; Two rows — two different people wrote the same place.

Step 12 (Quick check): Your two rows: who wrote green acres, and when?
- Answer: Dev at 16:10 (₹45,000 to Green Acres Farm Stays, '2 guests') — and Tara's watch at 19:02 (₹1 to Mahi, 'gReEn aCrEs')

Step 14 (Quick check): What is ROUND(16.25, 1)?
- Answer: 16.3

**Episode 8: Clear the Innocent**

Step 1 (SQL task T8.1): Who pinged tower RRO-17 from 6 PM, and how suspicious is that? Show device_owner, the ping count as pings,
- Query: SELECT device_owner, COUNT(*) AS pings, CASE WHEN COUNT(*) >= 10 THEN 'High' WHEN COUNT(*) >= 1 THEN 'Medium' ELSE 'Low' END AS suspicion FROM tower_pings WHERE tower_id = 'RRO-17' AND ts >= '2026-12-12 18:00:00' GROUP BY device_owner;
- Result: 3 rows; Ramesh Pawar is 'High' too — but he lives at the farm. High pings alone don't make anyone guilty.

Step 2 (SQL task T8.2): From 6 PM, for every device_owner: pings at RRO-17 as at_farm_area and pings elsewhere as elsewhere.
- Query: SELECT device_owner, COUNT(CASE WHEN tower_id = 'RRO-17' THEN 1 END) AS at_farm_area, COUNT(CASE WHEN tower_id <> 'RRO-17' THEN 1 END) AS elsewhere FROM tower_pings WHERE ts >= '2026-12-12 18:00:00' GROUP BY device_owner;

Step 3 (SQL task T8.3): Who was near RRO-17 from 6 PM (device_owner in tower_pings) and paid 'Green Acres Farm Stays' (from_name in upi_payments)? One list, only the names on both.
- Query: SELECT device_owner FROM tower_pings WHERE tower_id = 'RRO-17' AND ts >= '2026-12-12 18:00:00' INTERSECT SELECT from_name FROM upi_payments WHERE to_name = 'Green Acres Farm Stays';
- Result: 1 row; One name. Not Ramesh Pawar (he lives there, never paid), not Tara (she paid nobody).

Step 5 (SQL task T8.4): Everyone seen around the hotel between 17:30 and 18:30: person_name from gate_log or rider_name from hotel pickups in cab_rides — no duplicates.
- Query: SELECT person_name FROM gate_log WHERE ts BETWEEN '2026-12-12 17:30:00' AND '2026-12-12 18:30:00' UNION SELECT rider_name FROM cab_rides WHERE pickup = 'The Grand Residency' AND booked_at BETWEEN '2026-12-12 17:30:00' AND '2026-12-12 18:30:00';

Step 6 (SQL task T8.5): Same two lists, but keep duplicates this time.
- Query: SELECT person_name FROM gate_log WHERE ts BETWEEN '2026-12-12 17:30:00' AND '2026-12-12 18:30:00' UNION ALL SELECT rider_name FROM cab_rides WHERE pickup = 'The Grand Residency' AND booked_at BETWEEN '2026-12-12 17:30:00' AND '2026-12-12 18:30:00';
- Result: Anita Fernandes now appears twice — she walked out of the main gate and booked a cab. UNION ALL keeps both.

Step 7 (SQL task T8.6): Suspects minus people with a verified alibi: name from suspects except person_name from alibis where verified = 1.
- Query: SELECT name FROM suspects EXCEPT SELECT person_name FROM alibis WHERE verified = 1;
- Result: 3 rows; Ishita Das and Sunny Gill drop out — their alibis are verified. Left: Dev, Nysa, Kunal.

Step 8 (SQL task T8.fan): Check the fan page: show each tower_area (once) of messages in fan_dms from '@tara_squad'.
- Query: SELECT DISTINCT tower_area FROM fan_dms WHERE sender_handle = '@tara_squad';
- Result: 1 row

Step 9 (SQL task T8.7): Repeat the 'suspects minus verified alibis' query, sorted A → Z by the first column.
- Query: SELECT name FROM suspects EXCEPT SELECT person_name FROM alibis WHERE verified = 1 ORDER BY 1;
- Result: 3 rows

Step 10 (SQL task T8.8): The no-duplicates hotel list (UNION) again, sorted Z → A by the first column, first 5 only.
- Query: SELECT person_name FROM gate_log WHERE ts BETWEEN '2026-12-12 17:30:00' AND '2026-12-12 18:30:00' UNION SELECT rider_name FROM cab_rides WHERE pickup = 'The Grand Residency' AND booked_at BETWEEN '2026-12-12 17:30:00' AND '2026-12-12 18:30:00' ORDER BY 1 DESC LIMIT 5;
- Result: 5 rows

Step 11 (Quick check): Which set operator keeps duplicates?
- Answer: UNION ALL

**Episode 9: The Case Board**

Step 1 (Activity): Sort the sticky notes: is each one an entity type or an attribute?
- Person → Entity type
- Property (farm stay) → Entity type
- Booking → Entity type
- check-in time → Attribute
- area → Attribute
- name → Attribute

Step 2 (Activity): Draw the red strings: pick the cardinality of each relationship.
- A person and their smartwatch (each wears one, each watch belongs to one) → One-to-One (1:1)
- A farm stay and its bookings (one farm, many bookings) → One-to-Many (1:N)
- Bookings and their guests (a booking has many guests; a person can join many bookings) → Many-to-Many (M:N)

Step 3 (Activity): Same pattern, different story — match each case relationship to its e-commerce twin.
- Person – smartwatch → Customer – cart (1:1)
- Farm stay – bookings → Customer – addresses (1:N)
- Bookings – guests → Cart – products (M:N)

Step 4 (Activity): Map the case board to tables.
- Person (entity type) → Table person
- Farm stay – bookings (1:N) → Column property_id in booking (foreign key)
- Bookings – guests (M:N) → Junction table booking_guest

Step 5 (SQL task T9.1): Create person with id (INTEGER, NOT NULL, PRIMARY KEY), name (VARCHAR(250)), role (VARCHAR(100)).
- Query: CREATE TABLE person (id INTEGER NOT NULL PRIMARY KEY, name VARCHAR(250), role VARCHAR(100));

Step 6 (SQL task T9.2): Create property with id (INTEGER, NOT NULL, PRIMARY KEY), name (VARCHAR(250)), area (VARCHAR(250)), district (VARCHAR(100)).
- Query: CREATE TABLE property (id INTEGER NOT NULL PRIMARY KEY, name VARCHAR(250), area VARCHAR(250), district VARCHAR(100));

Step 7 (SQL task T9.3): Create booking: id (INTEGER, NOT NULL, PRIMARY KEY), property_id (INTEGER), booked_by (INTEGER), check_in (DATETIME),
- Query: CREATE TABLE booking (id INTEGER NOT NULL PRIMARY KEY, property_id INTEGER, booked_by INTEGER, check_in DATETIME, FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE, FOREIGN KEY (booked_by) REFERENCES person(id) ON DELETE CASCADE);

Step 8 (SQL task T9.4): Create the junction table booking_guest: id (INTEGER, NOT NULL, PRIMARY KEY), booking_id (INTEGER), person_id (INTEGER), with foreign keys to booking(id) and person(id), both ON DELETE CASCADE.
- Query: CREATE TABLE booking_guest (id INTEGER NOT NULL PRIMARY KEY, booking_id INTEGER, person_id INTEGER, FOREIGN KEY (booking_id) REFERENCES booking(id) ON DELETE CASCADE, FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE CASCADE);

Step 9 (SQL task T9.5): Put the caretaker's message into the tables — parents first:
- Query: INSERT INTO person (id, name, role) VALUES (2, 'Dev Arora', 'Artist manager'); INSERT INTO property (id, name, area, district) VALUES (1, 'Green Acres Farm Stays', 'Ring Road outskirts', 'Rural District'); INSERT INTO booking (id, property_id, booked_by, check_in) VALUES (88, 1, 2, '2026-12-12 18:45:00'); INSERT INTO booking_guest (id, booking_id, person_id) VALUES (1, 88, 2), (2, 88, NULL);

Step 10 (SQL task T9.6): 1:N — all bookings of 'Green Acres Farm Stays': everything from property joined with booking on property.id = booking.property_id.
- Query: SELECT * FROM property JOIN booking ON property.id = booking.property_id WHERE property.name = 'Green Acres Farm Stays';
- Result: 2 rows; Two bookings at the farm. One is old (November). The other is 88: booked_by 2, check_in 2026-12-12 18:45:00 — tonight.

Step 11 (SQL task T9.7): 1:1 — each person with their smartwatch: person.name, smartwatch.model, smartwatch.esim_number (join on person.id = smartwatch.person_id).
- Query: SELECT person.name, smartwatch.model, smartwatch.esim_number FROM person JOIN smartwatch ON person.id = smartwatch.person_id;
- Result: 3 rows

Step 12 (SQL task T9.8): M:N — the registered guests of booking 88: person.name from booking_guest joined with person on booking_guest.person_id = person.id.
- Query: SELECT person.name FROM booking_guest JOIN person ON booking_guest.person_id = person.id WHERE booking_guest.booking_id = 88;
- Result: 1 row; Two guests booked — one name came back. Ira: "Remember this."

Step 13 (Quick check): You inserted two booking_guest rows for booking 88, but the join returned one name. Why?
- Answer: The second guest's person_id is NULL — no name was registered, so there is no person row to match

Step 15 (SQL task T9.9): See ON DELETE CASCADE work: delete the property with id = 2 (Lakeview Resort). Its booking should disappear too.
- Query: DELETE FROM property WHERE id = 2;
- Result: Booking 90 vanished with it. That's cascade — powerful, so never test it on real evidence!

Step 16 (Quick check): A many-to-many relationship becomes…
- Answer: a junction table

**Episode 10: Connect the Dots**

Step 1 (SQL task T10.1): Every UPI handle with its owner: people.name and upi_accounts.upi_id, using NATURAL JOIN (both tables have person_id).
- Query: SELECT people.name, upi_accounts.upi_id FROM people NATURAL JOIN upi_accounts;
- Result: 53 rows; Note tara.watch@oknavyug — the handle her watch paid from.

Step 2 (SQL task T10.2): Nysa says she was rehearsing. Show people.name, rehearsal_attendance.check_in, rehearsal_attendance.check_out for everyone who checked in at 'City Stadium' (join on person_id).
- Query: SELECT people.name, rehearsal_attendance.check_in, rehearsal_attendance.check_out FROM people INNER JOIN rehearsal_attendance ON people.person_id = rehearsal_attendance.person_id WHERE rehearsal_attendance.venue = 'City Stadium';
- Result: 11 rows; Nysa Kapoor was on stage 16:00–21:30, with 3,000 crew around. Cleared.

Step 3 (SQL task T10.3): Kunal filed an insurance claim early. Join insurance_claims with event_schedule on filed_at >= artist_checkin_deadline,
- Query: SELECT insurance_claims.claim_id, insurance_claims.filed_at, insurance_claims.auto_generated FROM insurance_claims INNER JOIN event_schedule ON insurance_claims.filed_at >= event_schedule.artist_checkin_deadline WHERE insurance_claims.event_id = event_schedule.event_id;
- Result: 1 row; Claim C-501 at 19:00:01 — auto_generated = 1. The insurance system files automatically when the artist misses check-in. Kunal didn't even know. Cleared.

Step 4 (SQL task T10.4): Ira has marked Nysa's and Kunal's alibis verified. Which suspect (people.role = 'suspect') has no verified alibi?
- Query: SELECT people.name FROM people LEFT JOIN alibis ON people.name = alibis.person_name AND alibis.verified = 1 WHERE alibis.person_name IS NULL AND people.role = 'suspect';
- Result: 1 row; One name left: Dev Arora.

Step 5 (SQL task T10.5a): Who owns the grey SUV? Join vehicles with company on company_id; show vehicle_no, company.name, company.owner_person_id for '26 BH 4471 EX'.
- Query: SELECT vehicles.vehicle_no, company.name, company.owner_person_id FROM vehicles INNER JOIN company ON vehicles.company_id = company.company_id WHERE vehicles.vehicle_no = '26 BH 4471 EX';
- Result: 1 row; DA Talent Management Pvt Ltd, owner_person_id = 2. Now: who is person 2?

Step 6 (SQL task T10.5b): And who is that owner? Join company with people on owner_person_id = person_id; show company.name, people.name for 'DA Talent Management Pvt Ltd'.
- Query: SELECT company.name, people.name FROM company INNER JOIN people ON company.owner_person_id = people.person_id WHERE company.name = 'DA Talent Management Pvt Ltd';
- Result: 1 row; Person 2 is Dev Arora. The chain is complete.

Step 8 (Quick check): In a LEFT JOIN, a left row with no match gets ___ on the right side.
- Answer: NULL

**Episode 11: The Toll Plaza**

Step 1 (SQL task T11.1): Toll crossings of vehicles owned by Dev Arora's company: join vehicles+company (as T), then people (on T.owner_person_id = people.person_id),
- Query: SELECT T.vehicle_no, people.name, toll_crossings.plaza, toll_crossings.direction, toll_crossings.ts FROM (vehicles INNER JOIN company ON vehicles.company_id = company.company_id) AS T INNER JOIN people ON T.owner_person_id = people.person_id INNER JOIN toll_crossings ON T.vehicle_no = toll_crossings.vehicle_no WHERE people.name = 'Dev Arora';
- Result: 2 rows

Step 2 (SQL task T11.2): Same query, in time order (ORDER BY toll_crossings.ts).
- Query: SELECT T.vehicle_no, people.name, toll_crossings.plaza, toll_crossings.direction, toll_crossings.ts FROM (vehicles INNER JOIN company ON vehicles.company_id = company.company_id) AS T INNER JOIN people ON T.owner_person_id = people.person_id INNER JOIN toll_crossings ON T.vehicle_no = toll_crossings.vehicle_no WHERE people.name = 'Dev Arora' ORDER BY toll_crossings.ts;
- Result: 2 rows; Two crossings. Read direction and ts in order.

Step 3 (Quick check): Your two rows, in time order: what did Dev's SUV do?
- Answer: OUTBOUND through Ring Road Toll Plaza at 18:41, INBOUND at 19:30 — out of the city and back in 49 minutes

Step 5 (SQL task T11.3): Crossings per vehicle per direction: join toll_crossings with vehicles on vehicle_no; show vehicle_no, direction, COUNT(*).
- Query: SELECT toll_crossings.vehicle_no, toll_crossings.direction, COUNT(*) FROM toll_crossings INNER JOIN vehicles ON toll_crossings.vehicle_no = vehicles.vehicle_no GROUP BY toll_crossings.vehicle_no, toll_crossings.direction;

Step 6 (SQL task T11.4): Every guest row of booking 88, even guests with no matching person: booking_guest.booking_id, person.name from person RIGHT JOIN booking_guest on person.id = booking_guest.person_id.
- Query: SELECT booking_guest.booking_id, person.name FROM person RIGHT JOIN booking_guest ON person.id = booking_guest.person_id WHERE booking_guest.booking_id = 88;
- Result: 2 rows; Two rows: Dev — and NULL. The INNER JOIN in the case board hid her. The unregistered "+1 lady" is Tara.

Step 7 (SQL task T11.5): Match hotel-gate vehicles with toll crossings: DISTINCT gate_log.vehicle_no as at_hotel_gate and toll_crossings.vehicle_no as at_toll, using FULL JOIN on vehicle_no.
- Query: SELECT DISTINCT gate_log.vehicle_no AS at_hotel_gate, toll_crossings.vehicle_no AS at_toll FROM gate_log FULL JOIN toll_crossings ON gate_log.vehicle_no = toll_crossings.vehicle_no;
- Result: NULL on one side = seen in only one place. Only 26 BH 4471 EX has a value on both sides.

Step 8 (SQL task T11.6): Plan the rescue: every police_units × routes pair for the unit based at 'Ring Road'; show unit name, route name, km, shortest route first, only 1.
- Query: SELECT police_units.name, routes.name, routes.km FROM police_units CROSS JOIN routes WHERE police_units.base_area = 'Ring Road' ORDER BY routes.km LIMIT 1;
- Result: 1 row

Step 9 (SQL task T11.7): Were they together? Join tower_pings AS p1 with tower_pings AS p2 on the same tower_id and the same ts, where p1.device_owner < p2.device_owner and the tower is 'RRO-17'. Show p1.device_owner, p2.device_owner, p1.tower_id, p1.ts.
- Query: SELECT p1.device_owner, p2.device_owner, p1.tower_id, p1.ts FROM tower_pings AS p1 INNER JOIN tower_pings AS p2 ON p1.tower_id = p2.tower_id AND p1.ts = p2.ts WHERE p1.device_owner < p2.device_owner AND p1.tower_id = 'RRO-17';
- Result: 6 rows; Six rows, six identical minutes. Two devices, one place, one time.

Step 11 (Activity): JOINS summary — match each join you used tonight to what it keeps.
- INNER JOIN → Only rows that match on both sides
- LEFT JOIN → Every row of the left table
- RIGHT JOIN → Every row of the right table
- FULL JOIN → Every row of both tables
- CROSS JOIN → Every combination of rows

**Episode 12: The Edited Contract**

Step 1 (SQL task T12.1): Create the view suv_timeline with columns source, ts, place, combining (with UNION ALL):
- Query: CREATE VIEW suv_timeline AS SELECT 'gate' AS source, ts, gate AS place FROM gate_log WHERE vehicle_no = '26 BH 4471 EX' UNION ALL SELECT 'toll', ts, plaza FROM toll_crossings WHERE vehicle_no = '26 BH 4471 EX' UNION ALL SELECT 'tower', ts, tower_area FROM tower_pings WHERE device_owner = 'Dev Arora';

Step 2 (SQL task T12.2): Query your view: all its columns, without the tower rows (source <> 'tower'), in time order.
- Query: SELECT * FROM suv_timeline WHERE source <> 'tower' ORDER BY ts;
- Result: 4 rows; Out by the service gate 18:12 → toll out 18:41 → toll in 19:30 → back at the hotel 19:52.

Step 3 (SQL task T12.3): List every view in the database: name from sqlite_master where type = 'view'.
- Query: SELECT name FROM sqlite_master WHERE type = 'view';
- Result: 2 rows

Step 4 (SQL task T12.4): An old draft view draft_suspects is still lying around. Delete it.
- Query: DROP VIEW draft_suspects;

Step 5 (SQL task T12.5): Which label payments are above the average payment? Show payer, payee, amount.
- Query: SELECT payer, payee, amount FROM label_payments WHERE amount > (SELECT AVG(amount) FROM label_payments);
- Result: 9 rows; Nine payments above average — and one towers over the rest: Skyline Records → Dev Arora, ₹2,00,000 (the advance from S5-C3). Every other payment here is a normal label fee.

Step 6 (SQL task T12.5b): Tara's contract: all columns of contracts where artist_name = 'Tara Sen'.
- Query: SELECT * FROM contracts WHERE artist_name = 'Tara Sen';
- Result: 1 row; missed_show_clause = Applicable, manager_bonus = 2500000. If she misses tonight's show, her manager gets ₹25 lakh. Did she really agree to that? The system log will tell us when this row was written.

Step 8 (SQL task T12.6): How far is each payment from the average? Show payment_id, payer, payee, and amount minus the average as above_avg.
- Query: SELECT payment_id, payer, payee, amount - (SELECT AVG(amount) FROM label_payments) AS above_avg FROM label_payments;
- Result: 17 rows

Step 9 (SQL task T12.7): Tag every payment: show payment_id and tag — 'Above Average' if amount is above the average, else 'Below Average'.
- Query: SELECT payment_id, CASE WHEN amount > (SELECT AVG(amount) FROM label_payments) THEN 'Above Average' ELSE 'Below Average' END AS tag FROM label_payments;
- Result: 17 rows

Step 10 (SQL task T12.8): Average monthly total per payee: first total amount per payee per month (strftime('%m', ts)) in a subquery named monthly_totals, then AVG(monthly_total) per payee.
- Query: SELECT payee, AVG(monthly_total) FROM (SELECT payee, strftime('%m', ts) AS month, SUM(amount) AS monthly_total FROM label_payments GROUP BY payee, month) AS monthly_totals GROUP BY payee;
- Result: Dev's average jumps to ₹58,000 a month — because of one ₹2 lakh payment in December.

Step 11 (Activity): Which ACID property is the label system relying on?
- The bonus and the contract change are saved together — or not at all → Atomicity
- A contract can never end up half-edited and invalid → Consistency
- The legal team and the manager edit at the same time without clashing → Isolation
- A committed change is still there after the server crashes → Durability

Step 12 (SQL task T12.9): Read the label system's log: all columns of txn_log for transactions 'T7' and 'T9', or the 'CRASH' entry, in lsn order.
- Query: SELECT lsn, txn_id, entry_type, data_item, old_value, new_value, user_name, ts FROM txn_log WHERE txn_id IN ('T7', 'T9') OR entry_type = 'CRASH' ORDER BY lsn;
- Result: 7 rows; Seven rows. Read user_name, old_value, new_value and ts of the WRITE rows — and where the CRASH sits between them.

Step 13 (Quick check): Who changed contract_C12.missed_show_clause, from what, to what — and when?
- Answer: User darora: Not Applicable → Applicable at 18:05 (T7), the server crashed at 18:07, then again at 18:20 (T9) with the bonus set to 2500000

Step 14 (SQL task T12.10): Which transactions started but never committed? txn_id of 'START' entries except those with a 'COMMIT' entry.
- Query: SELECT txn_id FROM txn_log WHERE entry_type = 'START' EXCEPT SELECT txn_id FROM txn_log WHERE entry_type = 'COMMIT';
- Result: 1 row

Step 15 (Activity): Apply ACID to the log.
- T7 never committed before the crash → Atomicity: none of T7 was applied
- T9 committed at 18:21 → Durability: T9's change survived

Step 17 (Live demo): Kabir loads last month's 1 lakh tower pings and searches for one person at one tower — first without an index, then with one. Press run and compare.
- Answer: Run the demo; it shows the query is faster with the index

Step 18 (Quick check): A transaction crashed before COMMIT. Which ACID property says none of its changes are applied?
- Answer: Atomicity

**Episode 13: Showtime**

Step 1 (SQL task T13.c1): Claim 1 — the SUV is Dev's. Join vehicles, company and people: show vehicles.vehicle_no and people.name for '26 BH 4471 EX'.
- Query: SELECT vehicles.vehicle_no, people.name FROM vehicles INNER JOIN company ON vehicles.company_id = company.company_id INNER JOIN people ON company.owner_person_id = people.person_id WHERE vehicles.vehicle_no = '26 BH 4471 EX';
- Result: 1 row

Step 2 (SQL task T13.c2): Claim 2 — the SUV went to the outskirts and came back. Show direction and ts from toll_crossings for '26 BH 4471 EX', in time order.
- Query: SELECT direction, ts FROM toll_crossings WHERE vehicle_no = '26 BH 4471 EX' ORDER BY ts;
- Result: 2 rows

Step 3 (SQL task T13.c3): Claim 3 — Tara was held near RRO-17. From 6 PM: tower_id and ping count for 'Tara Sen', only towers with more than 5 pings.
- Query: SELECT tower_id, COUNT(*) FROM tower_pings WHERE device_owner = 'Tara Sen' AND ts >= '2026-12-12 18:00:00' GROUP BY tower_id HAVING COUNT(*) > 5;
- Result: 1 row

Step 4 (SQL task T13.c4): Claim 4 — Dev booked the farm stay. Join booking, property and person: show booking.id, property.name, person.name, booking.check_in for booking 88.
- Query: SELECT booking.id, property.name, person.name, booking.check_in FROM booking INNER JOIN property ON booking.property_id = property.id INNER JOIN person ON booking.booked_by = person.id WHERE booking.id = 88;
- Result: 1 row

Step 5 (SQL task T13.c5): Claim 5 — he changed the contract after taking her. Show user_name, new_value, ts of 'WRITE' entries in txn_log on 'contract_C12.missed_show_clause' from transactions that committed (txn_id IN (SELECT txn_id FROM txn_log WHERE entry_type = 'COMMIT')).
- Query: SELECT user_name, new_value, ts FROM txn_log WHERE entry_type = 'WRITE' AND data_item = 'contract_C12.missed_show_clause' AND txn_id IN (SELECT txn_id FROM txn_log WHERE entry_type = 'COMMIT');
- Result: 1 row

Step 6 (SQL task T13.1): Close the case. For every person with role = 'suspect': name and status — 'Cleared' if their name is in the verified alibis (SELECT person_name FROM alibis WHERE verified = 1), else 'Charged'. Sort by status.
- Query: SELECT people.name, CASE WHEN people.name IN (SELECT person_name FROM alibis WHERE verified = 1) THEN 'Cleared' ELSE 'Charged' END AS status FROM people WHERE role = 'suspect' ORDER BY status;
- Result: 5 rows
