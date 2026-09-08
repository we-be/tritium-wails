import './style.css';
import * as app from '../wailsjs/go/main/App';

// The Go side, or, when the UI runs in a plain browser (`npm run dev`) for
// layout work, a stand-in with sample data that the app build never loads.
const {Connect, Delete, Disconnect, Get, LoadSettings, Nodes, Scan, Set, Status} = window.go ? app : (await import('./mock.js')).default;

// Everything reaches the DOM through textContent, never innerHTML: values come
// from a store anyone with the password can write to.
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...children);
  return n;
};
const svg = (tag, attrs = {}, ...children) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...children);
  return n;
};

// The mark is a tritium nucleus: one proton, two neutrons.
const mark = () => svg('svg', {viewBox: '0 0 24 24', class: 'mark', 'aria-hidden': 'true'},
  svg('circle', {cx: 12, cy: 8.2, r: 4.3, class: 'proton'}),
  svg('circle', {cx: 7.6, cy: 15.6, r: 4.3, class: 'neutron'}),
  svg('circle', {cx: 16.4, cy: 15.6, r: 4.3, class: 'neutron'}));

const size = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(1)} MiB`;
const bytes = s => size(new TextEncoder().encode(s).length);
const ago = iso => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};
const clock = d => d.toLocaleTimeString([], {hour12: false});
const ttlText = n => n > 0 ? `${n}s` : n === -1 ? 'no ttl' : '—';

// ── cluster graph geometry ──
const GW = 520, GH = 460;
// ring spreads n nodes evenly around the centre; one sits alone, two face each other.
const ring = n => {
  const cx = GW / 2, cy = GH / 2 - 12, r = n < 2 ? 0 : Math.min(GW / 2 - 80, GH / 2 - 78);
  const start = n === 2 ? Math.PI : -Math.PI / 2;
  return Array.from({length: n}, (_, i) => {
    const t = start + 2 * Math.PI * i / n;
    return {x: Math.round(cx + r * Math.cos(t)), y: Math.round(cy + r * Math.sin(t))};
  });
};
const seedsOf = n => n.seeds ? n.seeds.split(',').map(s => s.trim()).filter(Boolean) : [];
const hostOf = a => a.replace(/:\d+$/, '').replace(/\.local$/, '');

// ── state ─────────────────────────────────────────────────────────────────
let status = {connected: false};
const log = [];
function record(text, kind = '') {
  log.unshift({at: new Date(), text, kind});
  if (log.length > 200) log.pop();
  if (view === views.log) view.render();
}

// run performs one action and puts its outcome on a status line and in the
// log: the summary fn returns, or the error in red.
async function run(line, fn) {
  try {
    const text = await fn();
    line.textContent = text;
    line.className = 'status';
    record(text);
  } catch (e) {
    const text = String(e?.message ?? e);
    line.textContent = text;
    line.className = 'status err';
    record(text, 'err');
  }
}

// ── layout ────────────────────────────────────────────────────────────────
const pill = el('span', {class: 'pill'});
const tabs = el('nav', {class: 'tabs'});
const panel = el('main', {class: 'panel'});
// Disconnected, the pane is only a preview of what a node would show, so it
// sits blurred under this note; the log is local and stays readable.
const veil = el('div', {class: 'veil'}, el('p', {class: 'title'}, 'Not connected'), el('p', {}, 'Connect to a node on the left to browse it.'));
const sidebar = el('aside', {class: 'sidebar'});
document.querySelector('#app').append(
  el('header', {class: 'topbar'}, mark(), el('h1', {}, 'tritium'), tabs, pill),
  el('div', {class: 'body'}, sidebar, panel),
);

function setStatus(s) {
  status = s || {connected: false};
  const badges = status.connected ? [status.address, status.tls && 'TLS', status.encrypted && 'sealed'].filter(Boolean) : ['disconnected'];
  pill.replaceChildren(el('i', {class: 'dot'}), ...badges.map(b => el('span', {}, b)));
  pill.className = 'pill ' + (status.connected ? 'on' : 'off');
  btnToggle.textContent = status.connected ? 'Disconnect' : 'Connect';
  document.body.classList.toggle('connected', status.connected);
}

// ── connection (sidebar) ──────────────────────────────────────────────────
const input = attrs => el('input', {autocomplete: 'off', spellcheck: false, ...attrs});
const field = (label, control, hint) => el('label', {class: 'field'}, el('span', {class: 'label'}, label), control, hint ? el('span', {class: 'hint'}, hint) : '');
const inEnv = input({placeholder: '~/.config/mubs/tritium.env'});
const inAddr = input({placeholder: '127.0.0.1:8080'});
const inPass = input({type: 'password', placeholder: '••••••••'});
const inTLS = el('input', {type: 'checkbox'});
const inCA = input({placeholder: 'empty: system roots'});
const inKey = input({type: 'password', placeholder: '32 bytes, hex or base64'});
const secure = el('details', {class: 'more'},
  el('summary', {}, 'TLS & encryption'),
  el('label', {class: 'check'}, inTLS, el('span', {}, 'Connect with TLS')),
  field('CA bundle', inCA),
  field('Encryption key', inKey, 'Values are sealed before they leave the app; a sealed client reads only values it sealed.'),
);
const btnToggle = el('button', {class: 'primary wide', type: 'submit'}, 'Connect');
const connLine = el('p', {class: 'status'}, 'Password and key stay in memory; the rest is remembered.');

sidebar.append(el('form', {class: 'connect', onsubmit: e => { e.preventDefault(); toggle(); }},
  el('h2', {}, 'Connection'),
  field('Env file', inEnv, "A node's own .env fills node, password and CA."),
  field('Node', inAddr),
  field('Password', inPass),
  secure,
  btnToggle,
  connLine,
));

async function toggle() {
  if (status.connected) {
    setStatus(await Disconnect());
    connLine.textContent = 'disconnected';
    connLine.className = 'status';
    record('disconnected');
    if (view.render) view.render();
    return;
  }
  btnToggle.disabled = true;
  await run(connLine, async () => {
    const s = await Connect({address: inAddr.value.trim(), password: inPass.value, tls: inTLS.checked,
                             ca: inCA.value.trim(), key: inKey.value.trim(), envFile: inEnv.value.trim()});
    setStatus(s);
    if (view.render) view.render();
    if (view === views.keys) inKeyName.focus();
    return `connected to ${s.address}`;
  });
  btnToggle.disabled = false;
}

// ── keys ──────────────────────────────────────────────────────────────────
const inKeyName = input({placeholder: 'key', class: 'key'});
const inTTL = input({type: 'number', min: 0, placeholder: 'TTL s', class: 'ttl', title: 'Seconds the value lives; empty uses the node default'});
const editor = el('textarea', {placeholder: 'value', rows: 14, spellcheck: false});
const keyLine = el('p', {class: 'status'}, 'Get fills the editor; Set writes it. Enter gets, Ctrl+Enter sets. { } indents JSON.');
const key = () => inKeyName.value.trim();

// ── JSON view ──
// Most values are JSON, so the editor can show one indented. The pretty form
// is a projection of the stored bytes: an unedited value goes back to the node
// exactly as read, an edited one is written compact. Scalars and plain text
// gain nothing from indentation and are left alone.
let pretty = false;
try { pretty = localStorage.getItem('pretty') === '1'; } catch {}
let fetched = {key: '', text: ''}; // the last string read, exact
const asJSON = text => {
  try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : undefined; } catch { return undefined; }
};
const projected = (text, on) => { const j = on && asJSON(text); return j ? JSON.stringify(j, null, 2) : text; };
const reserialize = (text, on) => { const j = asJSON(text); return j ? JSON.stringify(j, null, on ? 2 : 0) : text; };
const unedited = () => key() === fetched.key && editor.value === projected(fetched.text, pretty);
const btnPretty = el('button', {class: 'toggle' + (pretty ? ' on' : ''), title: 'Show JSON values indented; Set writes an edited one back compact', onclick: () => setPretty(!pretty)}, '{ }');
function setPretty(on) {
  if (!editor.readOnly) editor.value = unedited() ? projected(fetched.text, on) : reserialize(editor.value, on);
  pretty = on;
  btnPretty.classList.toggle('on', on);
  try { localStorage.setItem('pretty', on ? '1' : '0'); } catch {}
}

// A sorted set (a mubs board, the fleet index) comes back rendered one
// "score<TAB>member" per line and read-only: Set would drop it for a string.
const get = () => key() && run(keyLine, async () => {
  const v = await Get(key());
  editor.readOnly = v.type === 'zset';
  if (v.type === 'zset') {
    editor.value = v.text;
    return `${key()} · sorted set · ${v.count} member${v.count === 1 ? '' : 's'} as score, member · read-only`;
  }
  fetched = {key: key(), text: v.text};
  editor.value = projected(v.text, pretty);
  return `GET ${key()} · ${bytes(v.text)}${asJSON(v.text) ? ' · JSON' : ''}`;
});
const set = () => key() && run(keyLine, async () => {
  const ttl = Number(inTTL.value) || 0;
  const same = unedited();
  const out = same ? fetched.text : pretty ? reserialize(editor.value, false) : editor.value;
  await Set(key(), out, ttl);
  fetched = {key: key(), text: out};
  editor.value = projected(out, pretty);
  scanReset();
  return `SET ${key()} · ${bytes(out)}${ttl ? ` · expires in ${ttl}s` : ''}${!same && pretty && asJSON(out) ? ' · written compact' : ''}`;
});
const del = () => key() && run(keyLine, async () => {
  const was = await Delete(key());
  scanReset();
  return was ? `DEL ${key()}` : `${key()}: nothing to delete`;
});
inKeyName.addEventListener('keydown', e => { if (e.key === 'Enter') get(); });
inKeyName.addEventListener('input', () => { editor.readOnly = false; });
editor.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) set(); });

// ── key browser ──────────────────────────────────────────────────────────
const inPattern = input({placeholder: '*', class: 'key'});
const keyList = el('ul', {class: 'keylist'});
const btnMore = el('button', {class: 'wide', hidden: true, onclick: () => scanMore()}, 'More');
const scanLine = el('p', {class: 'status'});
let scanCursor = 0;
let scanRows = [];

function loadKey(name) {
  inKeyName.value = name;
  get();
}
function renderKeyList() {
  keyList.replaceChildren(...scanRows.map(k => el('li', {onclick: () => loadKey(k.name)},
    el('span', {class: 'kname'}, k.name), el('span', {class: 'ktype'}, k.type), el('span', {class: 'kttl'}, ttlText(k.ttl)))));
}
async function scanMore() {
  if (!status.connected) return;
  try {
    const {keys, next} = await Scan(inPattern.value.trim() || '*', scanCursor, 50);
    scanCursor = next;
    scanRows.push(...keys);
    renderKeyList();
    btnMore.hidden = next === 0;
    scanLine.textContent = `${scanRows.length} key${scanRows.length === 1 ? '' : 's'}${next ? ' · more available' : ''}`;
    scanLine.className = 'status';
  } catch (e) {
    scanLine.textContent = String(e?.message ?? e);
    scanLine.className = 'status err';
  }
}
async function scanReset() {
  scanCursor = 0;
  scanRows = [];
  btnMore.hidden = true;
  if (!status.connected) {
    keyList.replaceChildren();
    scanLine.textContent = 'Connect to a node to browse keys.';
    scanLine.className = 'status';
    return;
  }
  await scanMore();
}
inPattern.addEventListener('keydown', e => { if (e.key === 'Enter') scanReset(); });

// ── views ─────────────────────────────────────────────────────────────────
const views = {
  keys: {
    title: 'Keys',
    root: el('section', {class: 'card keys'},
      el('div', {class: 'browser'},
        el('div', {class: 'bar'}, inPattern, el('button', {class: 'primary', onclick: () => scanReset()}, 'Scan')),
        el('div', {class: 'scroll'}, keyList),
        btnMore, scanLine),
      el('div', {class: 'editor-col'},
        el('div', {class: 'bar'}, inKeyName, inTTL,
          el('button', {class: 'primary', onclick: get}, 'Get'),
          el('button', {onclick: set}, 'Set'),
          el('button', {class: 'danger', onclick: del}, 'Delete'), btnPretty),
        editor, keyLine)),
    mount() { if (status.connected) inKeyName.focus(); scanReset(); },
    render() { scanReset(); },
  },
  nodes: {
    title: 'Cluster',
    timer: null,
    graph: svg('svg', {class: 'graph', viewBox: `0 0 ${GW} ${GH}`, preserveAspectRatio: 'xMidYMid meet'}),
    detail: el('div', {class: 'detail'}),
    line: el('p', {class: 'status'}),
    pinned: null,
    hovered: null,
    byAddr: new Map(),
    mount() { this.render(); this.timer = setInterval(() => this.render(), 5000); },
    unmount() { clearInterval(this.timer); },
    async render() {
      const {graph, line} = this;
      if (!status.connected) {
        graph.replaceChildren();
        this.byAddr.clear();
        this.showDetail();
        line.textContent = 'Connect to a node to see the cluster as it sees it.';
        line.className = 'status';
        return;
      }
      try {
        const nodes = await Nodes();
        this.draw(nodes);
        line.textContent = `${nodes.length} node${nodes.length === 1 ? '' : 's'} as ${status.address} sees them · refreshed ${clock(new Date())}`;
        line.className = 'status';
      } catch (e) {
        line.textContent = String(e?.message ?? e);
        line.className = 'status err';
      }
    },
    // draw lays the members on a ring with an edge for each seed a node
    // dials. A seed nobody in the view answers to is drawn hollow, so a
    // member that dropped out still shows where it was expected.
    draw(nodes) {
      const byAddr = new Map(nodes.map(n => [n.addr, n]));
      for (const n of nodes) for (const s of seedsOf(n)) {
        if (!byAddr.has(s)) byAddr.set(s, {addr: s, state: 'ghost', version: '', seeds: '', replicas: '—', lastSeen: '', conns: 0, bytes: 0});
      }
      this.byAddr = byAddr;
      if (this.pinned && !byAddr.has(this.pinned)) this.pinned = null;
      const addrs = [...byAddr.keys()].sort();
      const at = Object.fromEntries(ring(addrs.length).map((p, i) => [addrs[i], p]));
      const edges = new Map();
      for (const n of nodes) for (const s of seedsOf(n)) {
        const k = [n.addr, s].sort().join(' ');
        const e = edges.get(k) || {a: n.addr, b: s, dirs: 0};
        e.dirs++;
        edges.set(k, e);
      }
      const gone = a => ['down', 'ghost'].includes(byAddr.get(a).state);
      const edgeEls = [...edges.values()].map(e => svg('line', {
        class: `gedge${e.dirs > 1 ? ' mutual' : ''}${gone(e.a) || gone(e.b) ? ' dead' : ''}`,
        x1: at[e.a].x, y1: at[e.a].y, x2: at[e.b].x, y2: at[e.b].y}));
      const nodeEls = addrs.map(a => {
        const n = byAddr.get(a), p = at[a];
        const cls = ['gnode', n.state, a === status.address && 'me', a === this.pinned && 'pinned', a === this.hovered && 'hover'].filter(Boolean).join(' ');
        const g = svg('g', {class: cls, transform: `translate(${p.x} ${p.y})`},
          svg('circle', {class: 'ring', r: 34}),
          svg('circle', {class: 'body', r: 25}),
          svg('circle', {class: 'core', r: 5}),
          svg('text', {class: 'label', y: 46}, hostOf(a)),
          svg('text', {class: 'sub', y: 61}, n.state === 'ghost' ? 'not a member' : n.version || '?'));
        g.addEventListener('mouseenter', () => { this.hovered = a; g.classList.add('hover'); this.showDetail(); });
        g.addEventListener('mouseleave', () => { this.hovered = null; g.classList.remove('hover'); this.showDetail(); });
        g.addEventListener('click', () => {
          this.pinned = this.pinned === a ? null : a;
          for (const x of this.graph.querySelectorAll('.gnode')) x.classList.toggle('pinned', x === g && !!this.pinned);
          this.showDetail();
        });
        return g;
      });
      this.graph.replaceChildren(svg('g', {}, ...edgeEls), svg('g', {}, ...nodeEls));
      this.showDetail();
    },
    // The detail card follows the hovered node and falls back to the pinned one.
    showDetail() {
      const a = this.hovered ?? this.pinned;
      const n = a && this.byAddr.get(a);
      if (!n) {
        this.detail.replaceChildren(el('p', {class: 'hint'}, status.connected ? 'Hover a node for its details; click to keep them.' : ''));
        return;
      }
      const rows = n.state === 'ghost'
        ? [['state', 'seeded, not a member', 'down']]
        : [['state', n.state, n.state], ['version', n.version || '?'], ['seeds', seedsOf(n).join('\n') || '—'],
           ['replicas', n.replicas, n.replicas.includes('held') ? 'degraded' : ''], ['seen', ago(n.lastSeen)],
           ['conns', String(n.conns)], ['moved', size(n.bytes)]];
      this.detail.replaceChildren(
        el('h3', {}, n.addr, a === status.address ? el('span', {class: 'tag'}, 'you') : '', this.pinned === a ? el('span', {class: 'tag'}, 'pinned') : ''),
        el('dl', {}, ...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', {class: cls || ''}, v)])));
    },
  },
  log: {
    title: 'Log',
    local: true,
    list: el('ul', {class: 'log'}),
    mount() { this.render(); },
    render() {
      this.list.replaceChildren(...log.map(h => el('li', {class: h.kind}, el('time', {}, clock(h.at)), el('span', {}, h.text))));
    },
  },
};
views.nodes.root = el('section', {class: 'card nodes'},
  el('div', {class: 'bar'}, el('h2', {}, 'Cluster'), el('span', {class: 'grow'}), el('button', {onclick: () => views.nodes.render()}, 'Refresh')),
  el('div', {class: 'graph-wrap'}, views.nodes.graph, views.nodes.detail), views.nodes.line);
views.log.root = el('section', {class: 'card'},
  el('div', {class: 'bar'}, el('h2', {}, 'Log'), el('span', {class: 'grow'}), el('button', {onclick: () => { log.length = 0; views.log.render(); }}, 'Clear')),
  views.log.list);

let view = null;
function show(name) {
  view?.unmount?.();
  view = views[name];
  for (const t of tabs.children) t.classList.toggle('active', t.dataset.view === name);
  panel.replaceChildren(view.root, veil);
  panel.classList.toggle('local', !!view.local);
  view.mount?.();
}
for (const [name, v] of Object.entries(views)) {
  tabs.append(el('button', {class: 'tab', 'data-view': name, onclick: () => show(name)}, v.title));
}

// ── boot ──────────────────────────────────────────────────────────────────
setStatus(status);
show('keys');
LoadSettings().then(s => {
  inEnv.value = s.envFile || '';
  inAddr.value = s.address || '';
  inTLS.checked = !!s.tls;
  inCA.value = s.ca || '';
  secure.open = !!(s.tls || s.ca);
}).catch(() => {});
Status().then(setStatus).catch(() => {});
