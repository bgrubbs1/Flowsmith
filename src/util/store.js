// Progress, daily streak and settings, kept on the device (wrapped: storage can be unavailable).
const KEY = 'flowsmith.v1';
let ephemeral = false;
export function setEphemeral(value) { ephemeral = value; }
const blank = () => ({ stars: {}, records: {}, daily: { last: 0, streak: 0, best: 0, solvedSeeds: [] }, settings: { assist: false, sound: true } });

export function load() {
  if (ephemeral) return blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const s = JSON.parse(raw);
    return { ...blank(), ...s, records: { ...s.records }, daily: { ...blank().daily, ...s.daily }, settings: { ...blank().settings, ...s.settings } };
  } catch { return blank(); }
}
export function save(s) {
  if (ephemeral) return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

// Update the streak when the daily puzzle with `seed` (YYYYMMDD) is solved.
export function recordDaily(s, seed) {
  const d = s.daily;
  if (d.solvedSeeds.includes(seed)) return s;
  const prev = d.last;
  const prevDate = prev ? new Date(Math.floor(prev / 10000), Math.floor((prev % 10000) / 100) - 1, prev % 100) : null;
  const cur = new Date(Math.floor(seed / 10000), Math.floor((seed % 10000) / 100) - 1, seed % 100);
  const diff = prevDate ? Math.round((cur - prevDate) / 86400000) : null;
  d.streak = diff === 1 ? d.streak + 1 : 1;
  d.best = Math.max(d.best, d.streak);
  d.last = seed;
  d.solvedSeeds = [...d.solvedSeeds.slice(-60), seed];
  return s;
}

// Personal records only: no network, accounts, seeded scores or global ranking.
export function recordRun(s, id, run) {
  s.records ||= {};
  const score = run.stars * 1000 + Math.round(run.accuracy) * 10;
  const entry = { clock: 'wall', score, stars: run.stars, accuracy: Math.round(run.accuracy), seconds: Math.round(run.seconds), hints: run.hints };
  const old = s.records[id];
  if (!old || score > old.score || (score === old.score && (old.clock !== 'wall' || entry.seconds < old.seconds))) s.records[id] = entry;
  return s.records[id];
}
