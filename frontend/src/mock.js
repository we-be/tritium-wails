// A stand-in for the Go side when the UI runs in a plain browser (`npm run
// dev`), so layout and states can be worked on without a node. main.js loads
// it only when the Wails runtime is absent, so the app never ships it.
const store = new Map([['node:bazzite', '{"role":"primary","load":0.42}'], ['sig:macair', '[]']]);
let status = {connected: false};
const wait = ms => new Promise(r => setTimeout(r, ms));
const notFound = k => new Error(`${k}: not found (missing or expired)`);
const notConnected = () => new Error('not connected');
const t = s => new Date(Date.now() - s * 1000).toISOString();

export default {
  async LoadSettings() { return {address: '127.0.0.1:8080', envFile: '~/.config/mubs/tritium.env', tls: true, ca: ''}; },
  async Status() { return status; },
  async Connect(s) {
    await wait(300);
    if (s.password === 'wrong') throw new Error('AUTH failed: WRONGPASS invalid username-password pair');
    status = {connected: true, address: s.address || 'bazzite.local:8080', tls: s.tls || !!s.envFile, encrypted: !!s.key};
    return status;
  },
  async Disconnect() { status = {connected: false}; return status; },
  async Get(k) { if (!status.connected) throw notConnected(); await wait(60); if (!store.has(k)) throw notFound(k); return store.get(k); },
  async Set(k, v) { if (!status.connected) throw notConnected(); await wait(60); store.set(k, v); },
  async Delete(k) { if (!status.connected) throw notConnected(); return store.delete(k); },
  async Nodes() {
    if (!status.connected) throw notConnected();
    return [
      {id: 'node-bazzite.local:8080', addr: 'bazzite.local:8080', state: 'healthy', version: 'v0.11.1', seeds: 'macair.local:8080', replicas: '1', lastSeen: t(1), conns: 6, bytes: 48213},
      {id: 'node-macair.local:8080', addr: 'macair.local:8080', state: 'degraded', version: 'v0.11.1', seeds: 'bazzite.local:8080', replicas: '1 (1 held)', lastSeen: t(12), conns: 3, bytes: 9120},
      {id: 'node-pi.local:8080', addr: 'pi.local:8080', state: 'down', version: 'v0.11.0', seeds: 'bazzite.local:8080, macair.local:8080', replicas: '0', lastSeen: t(400), conns: 0, bytes: 0},
    ];
  },
};
