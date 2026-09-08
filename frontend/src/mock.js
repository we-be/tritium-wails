// A stand-in for the Go side when the UI runs in a plain browser (`npm run
// dev`), so layout and states can be worked on without a node. main.js loads
// it only when the Wails runtime is absent, so the app never ships it.
const store = new Map([
  ['node:bazzite', '{"role":"primary","load":0.42}'],
  ['node:macair', '{"role":"replica","load":0.11}'],
  ['sig:macair', '[]'],
  ['sig:bazzite', '[]'],
  ['session:alice', '{"since":"2026-09-01"}'],
  ['session:bob', '{"since":"2026-09-03"}'],
  ['cache:weather', '{"tempF":71}'],
  ['cache:quote', '"the world is your oyster"'],
  ['lock:deploy', '1'],
  ['presence:hunter', 'online'],
]);
const zsets = new Map([['board:dev', [[1757260800, '{"who":"mubs","text":"rolled v0.14.1"}'], [1757261400, '{"who":"hunter","text":"nice"}']]]]);
const ttls = new Map([['lock:deploy', 12], ['presence:hunter', -1]]); // seconds left, or -1 for no expiry
const defaultTTL = 17600;
let status = {connected: false};
const wait = ms => new Promise(r => setTimeout(r, ms));
const notFound = k => new Error(`${k}: not found (missing or expired)`);
const notConnected = () => new Error('not connected');
const t = s => new Date(Date.now() - s * 1000).toISOString();
const globRe = pattern => new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');

export default {
  async LoadSettings() { return {address: '127.0.0.1:8080', envFile: '~/.config/mubs/tritium.env', tls: true, ca: ''}; },
  async Status() { return status; },
  async Connect(s) {
    await wait(300);
    if (s.password === 'wrong') throw new Error('AUTH failed: WRONGPASS invalid username-password pair');
    status = {connected: true, address: s.address || '127.0.0.1:8080', node: 'bazzite.local:8080', tls: s.tls || !!s.envFile, encrypted: !!s.key};
    return status;
  },
  async Disconnect() { status = {connected: false}; return status; },
  async Get(k) {
    if (!status.connected) throw notConnected();
    await wait(60);
    if (zsets.has(k)) {
      const m = zsets.get(k);
      return {type: 'zset', text: m.map(([s, v]) => `${s}\t${v}`).join('\n') + '\n', count: m.length};
    }
    if (!store.has(k)) throw notFound(k);
    return {type: 'string', text: store.get(k), count: 0};
  },
  async Set(k, v) {
    if (!status.connected) throw notConnected();
    await wait(60);
    if (zsets.has(k)) throw new Error(`${k} holds a sorted set; delete it first to store a string there`);
    store.set(k, v);
  },
  async Delete(k) { if (!status.connected) throw notConnected(); ttls.delete(k); return store.delete(k) || zsets.delete(k); },
  async Scan(pattern, cursor, count) {
    if (!status.connected) throw notConnected();
    await wait(80);
    const re = globRe(pattern || '*');
    const names = [...store.keys(), ...zsets.keys()].filter(k => re.test(k)).sort();
    const page = names.slice(cursor, cursor + (count || 10));
    const next = cursor + page.length < names.length ? cursor + page.length : 0;
    const keys = page.map(name => ({name, type: zsets.has(name) ? 'zset' : 'string', ttl: ttls.has(name) ? ttls.get(name) : defaultTTL}));
    return {keys, next};
  },
  async Events(since) {
    if (!status.connected) throw notConnected();
    const now = Date.now(), ev = (s, node, event, peer, keys = 0, took = 0) => ({at: now - s * 1000, node, event, peer, keys, took});
    return [
      ev(5, 'node-bazzite.local:8080', 'attach', 'macair.local:8080'),
      ev(5, 'node-bazzite.local:8080', 'resync', 'macair.local:8080', 27, 51),
      ev(12, 'node-macair.local:8080', 'start', ''),
      ev(40, 'node-macair.local:8080', 'detach', 'bazzite.local:8080'),
      ev(400, 'node-bazzite.local:8080', 'hold', 'pi.local:8080'),
      ev(340, 'node-bazzite.local:8080', 'evict', 'pi.local:8080', 0, 60500),
      ev(900, 'node-macair.local:8080', 'repair', 'bazzite.local:8080', 3),
    ].filter(e => now - e.at <= since * 1000);
  },
  async Nodes() {
    if (!status.connected) throw notConnected();
    return [
      {id: 'node-bazzite.local:8080', addr: 'bazzite.local:8080', state: 'healthy', version: 'v0.11.1', seeds: 'macair.local:8080', replicas: '1', lastSeen: t(1), conns: 6, bytes: 48213, weight: 2, keys: 27, memory: 198144, writes: 1286},
      {id: 'node-macair.local:8080', addr: 'macair.local:8080', state: 'degraded', version: 'v0.11.1', seeds: 'bazzite.local:8080', replicas: '1 (1 held)', lastSeen: t(12), conns: 3, bytes: 9120, weight: 1, keys: 27, memory: 197632, writes: 471},
      {id: 'node-pi.local:8080', addr: 'pi.local:8080', state: 'down', version: 'v0.11.0', seeds: 'bazzite.local:8080, macair.local:8080', replicas: '0', lastSeen: t(400), conns: 0, bytes: 0, weight: 0, keys: 0, memory: 0, writes: 0},
    ];
  },
};
