require('dotenv').config();
const express = require('express'), fs = require('fs'), path = require('path');
const C = {
  port: +process.env.PORT || 3000, key: process.env.API_KEY || 'change-me',
  volt: +process.env.NOMINAL_VOLTAGE || 230, thr: +process.env.CURRENT_THRESHOLD_A || 0.05,
  delay: +process.env.GHOST_DELAY_SEC || 30, tariff: +process.env.TARIFF_PER_KWH || 8,
  demo: process.env.DEMO_MODE === 'true', live: process.env.LIVE_ROOM_ID || 'lab101',
  tgToken: process.env.TELEGRAM_BOT_TOKEN, tgChat: process.env.TELEGRAM_CHAT_ID
};
const rooms = {}, alerts = [], clients = [];
JSON.parse(fs.readFileSync(path.join(__dirname, 'rooms.json'))).forEach(r => rooms[r.id] = {
  ...r, motion: 0, current: 0, power: 0, ghost: false, lastMotion: Date.now(), lastSeen: 0,
  lastTick: 0, totalWh: 0, ghostWh: 0, history: [] });

function notify(msg) {
  alerts.unshift({ t: Date.now(), msg }); alerts.length = Math.min(alerts.length, 30);
  if (C.tgToken && C.tgChat) fetch(`https://api.telegram.org/bot${C.tgToken}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: C.tgChat, text: 'Ghost Hunter: ' + msg }) }).catch(() => {});
}

function ingest(id, motion, current) {
  const r = rooms[id]; if (!r) return false;
  const now = Date.now(), dt = r.lastTick ? Math.min((now - r.lastTick) / 1000, 5) : 0;
  r.lastTick = r.lastSeen = now; r.motion = motion ? 1 : 0; r.current = Math.max(0, current);
  r.power = r.current * C.volt;
  if (r.motion) r.lastMotion = now;
  const wh = r.power * dt / 3600; r.totalWh += wh;
  const ghost = !r.motion && now - r.lastMotion >= C.delay * 1000 && r.current > C.thr;
  if (ghost && !r.ghost) notify(`Ghost load in ${r.name} (${r.dept}): ${r.current.toFixed(2)} A running with nobody present`);
  if (!ghost && r.ghost) notify(`${r.name} is back to normal`);
  r.ghost = ghost; if (ghost) r.ghostWh += wh;
  r.history.push({ t: now, c: +r.current.toFixed(3), m: r.motion, g: ghost ? 1 : 0 });
  if (r.history.length > 60) r.history.shift();
  return true;
}

function snapshot() {
  const now = Date.now(), depts = {};
  const list = Object.values(rooms).map(r => ({ ...r, online: now - r.lastSeen < 10000 }));
  list.forEach(r => { const d = depts[r.dept] ||= { dept: r.dept, wh: 0, ghostWh: 0 }; d.wh += r.totalWh; d.ghostWh += r.ghostWh; });
  const board = Object.values(depts).map(d => ({ dept: d.dept, kwh: d.wh / 1000, wastedKwh: d.ghostWh / 1000,
    wastedCost: d.ghostWh / 1000 * C.tariff, efficiency: d.wh > 0 ? 100 * (1 - d.ghostWh / d.wh) : 100 }))
    .sort((a, b) => b.efficiency - a.efficiency || a.wastedKwh - b.wastedKwh);
  return { now, config: { threshold: C.thr, delay: C.delay, volt: C.volt, demo: C.demo }, rooms: list, leaderboard: board, alerts };
}

const app = express(); app.use(express.json());
app.post('/api/readings', (req, res) => {
  if (req.get('x-api-key') !== C.key) return res.status(401).json({ error: 'bad api key' });
  const { roomId, motion, current } = req.body || {};
  if (typeof current !== 'number' || !ingest(roomId, motion, current)) return res.status(400).json({ error: 'invalid payload' });
  res.json({ ok: true });
});
app.get('/api/state', (_, res) => res.json(snapshot()));
app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders(); clients.push(res); req.on('close', () => clients.splice(clients.indexOf(res), 1));
});
app.use(express.static(path.join(__dirname, 'public')));
setInterval(() => { const s = `data: ${JSON.stringify(snapshot())}\n\n`; clients.forEach(c => c.write(s)); }, 1000);

if (C.demo) { // simulate rooms that have no hardware
  const sim = {}; Object.keys(rooms).filter(id => id !== C.live).forEach(id =>
    sim[id] = { occ: Math.random() < .5, load: 0.4 + Math.random() * 1.2, on: Math.random() < .6, forgot: Math.random() < .4 });
  setInterval(() => Object.entries(sim).forEach(([id, s]) => {
    if (Math.random() < .02) { s.occ = !s.occ; if (s.occ) s.on = true; else s.on = s.forgot ? Math.random() < .8 : false; s.forgot = Math.random() < .4; }
    ingest(id, s.occ && Math.random() < .8, s.on ? s.load + (Math.random() - .5) * .08 : 0.005);
  }), 1000);
}
app.listen(C.port, () => console.log(`Ghost Hunter dashboard: http://localhost:${C.port}  (demo=${C.demo})`));
