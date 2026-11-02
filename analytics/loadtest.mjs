// Ingest load test: N students post event batches at the same moment, for R rounds (a live class of 500 hitting "Run" together).
//   ADMIN_PASSWORD=x PORT=8798 DB_PATH=data/load.sqlite node server.mjs &   then   node loadtest.mjs http://localhost:8798 500 6
const [url = 'http://localhost:8798', N = 500, R = 6] = process.argv.slice(2);
let n = 0;
const batch = (s) => Array.from({ length: 8 }, (_, i) => ({ event_id: `lt-${s}-${++n}`, user_id: `lms:LT${s}`, sitting_id: 'x',
  verb: i % 4 === 0 ? 'heartbeat' : 'beat_viewed', object: { type: 'beat', id: `S3B${i}`, session: 3, beat: `S3B${i}` },
  course_ref: { topic_id: 't' }, result: { seconds: 30 }, client_ts: new Date().toISOString() }));
const lat = [];
let fails = 0;
const t0 = performance.now();
for (let r = 0; r < Number(R); r++) {
  await Promise.all(Array.from({ length: Number(N) }, async (_, s) => {
    const t = performance.now();
    try {
      const res = await fetch(`${url}/api/events`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ events: batch(s) }) });
      if (!res.ok) fails++; await res.text();
    } catch { fails++; }
    lat.push(performance.now() - t);
  }));
  // one feedback per student in the last round
  if (r === Number(R) - 1) await Promise.all(Array.from({ length: Number(N) }, (_, s) => fetch(`${url}/api/feedback`, { method: 'POST', body: JSON.stringify({ user_id: `lms:LT${s}`, session: 3, rating: 1 + (s % 5) }) }).then((x) => { if (!x.ok) fails++; })));
}
lat.sort((a, b) => a - b);
const q = (p) => lat[Math.floor(lat.length * p)].toFixed(0);
console.log(`${N} students × ${R} rounds = ${lat.length} requests (${n} events) in ${((performance.now() - t0) / 1000).toFixed(1)} s · failures ${fails}`);
console.log(`latency p50 ${q(0.5)} ms · p95 ${q(0.95)} ms · max ${lat.at(-1).toFixed(0)} ms`);
