# content/units — generated

One pack per course reading material (`u01` … `u37`, numbered by `global_sequence` in `../reading_materials.json`) plus the
finale (`u38`). Built by `node pipeline/build_sessions.mjs` from the `units:` block of each `../sessions/src/sNN.yaml` — **never edit**.

A unit pack is its session's pack with: `unit { n, unit_id, learning_resource_id, title, part, parts, finale?, same_as? }`,
`beats` = optional opener + the slice + optional closer, `exit` limited to the slice, `previously` extended with the clues of earlier
parts of the same session, and `minutes_estimate` of the slice. Solutions and the snapshot are the parent session's.

`index.json` lists every unit (same fields as `deploy/units.json` minus sizes). Duplicate reading materials (same text) are aliases:
same beats, their own `unit_id`, `same_as` pointing at the twin.
