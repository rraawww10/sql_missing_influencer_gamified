-- S12 index demo: fills tower_pings_archive with 1 lakh deterministic rows inside the learner's
-- browser sandbox (run by the engine, never shown to the learner). Keeps the s12 download small.
CREATE TABLE tower_pings_archive (
  ping_id INTEGER NOT NULL PRIMARY KEY,
  device_owner VARCHAR(200),
  device_type VARCHAR(10),
  tower_id VARCHAR(10),
  tower_area VARCHAR(100),
  ts DATETIME
);
CREATE TEMP TABLE demo_towers AS
  SELECT ROW_NUMBER() OVER (ORDER BY tower_id) - 1 AS k, tower_id, tower_area
  FROM (SELECT DISTINCT tower_id, tower_area FROM tower_pings);
CREATE TEMP TABLE demo_owners AS
  SELECT ROW_NUMBER() OVER (ORDER BY person_id) - 1 AS k, name FROM people WHERE role = 'public';
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 100000)
INSERT INTO tower_pings_archive
SELECT
  n.x,
  o.name,
  CASE n.x % 3 WHEN 0 THEN 'WATCH' ELSE 'PHONE' END,
  t.tower_id,
  t.tower_area,
  printf('2026-11-%02d %02d:%02d:%02d', 1 + (n.x * 7) % 30, (n.x * 13) % 24, (n.x * 17) % 60, (n.x * 31) % 60)
FROM n
JOIN demo_towers AS t ON t.k = (n.x * 11) % (SELECT COUNT(*) FROM demo_towers)
JOIN demo_owners AS o ON o.k = (n.x * 7) % (SELECT COUNT(*) FROM demo_owners);
DROP TABLE demo_towers;
DROP TABLE demo_owners;
