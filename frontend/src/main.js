import './style.css';
import logo from './assets/images/logo-universal.png';
import {Connect, Delete, Disconnect, Get, LoadSettings, Nodes, Set, Status} from '../wailsjs/go/main/App';

// Every piece of data reaches the DOM through textContent, never innerHTML: values
// come from a store anyone with the password can write to.
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) n.append(c);
  return n;
};

const history = [];
let status = {connected: false};

// ── layout ────────────────────────────────────────────────────────────────
const statusPill = el('span', {class: 'pill'}, 'disconnected');
const tabs = el('nav', {class: 'tabs'});
const panel = el('main', {class: 'panel'});
const sidebar = el('aside', {class: 'sidebar'});
document.querySelector('#app').append(
  el('header', {class: 'topbar'}, el('img', {class: 'logo', src: logo, alt: ''}), el('h1', {}, 'TRITIUM'), tabs, statusPill),
  el('div', {class: 'body'}, sidebar, panel),
);

function note(text, kind = '') {
  history.unshift({at: new Date(), text, kind});
  if (history.length > 200) history.pop();
  if (current === 'history') views.history();
}

function fail(err) {
  const text = String(err && err.message ? err.message : err);
  note(text, 'err');
  return text;
}

function setStatus(s) {
  status = s || {connected: false};
  statusPill.textContent = status.connected
    ? `${status.address}${status.tls ? ' · TLS' : ''}${status.encrypted ? ' · sealed' : ''}`
    : 'disconnected';
  statusPill.className = 'pill ' + (status.connected ? 'on' : 'off');
}

// ── connect panel (sidebar) ───────────────────────────────────────────────
const field = (label, input) => el('label', {class: 'field'}, el('span', {}, label), input);
const inAddr = el('input', {placeholder: '127.0.0.1:8080', autocomplete: 'off'});
const inPass = el('input', {type: 'password', placeholder: 'AUTH password', autocomplete: 'off'});
const inTLS = el('input', {type: 'checkbox'});
const inCA = el('input', {placeholder: '/path/to/ca.crt (empty = system roots)', autocomplete: 'off'});
const inKey = el('input', {type: 'password', placeholder: '32-byte key, hex or base64', autocomplete: 'off'});
const inEnv = el('input', {placeholder: "a node's .env: fills address, password, CA", autocomplete: 'off'});
const btnConnect = el('button', {class: 'primary', onclick: connect}, 'Connect');
const btnDisconnect = el('button', {onclick: async () => { setStatus(await Disconnect()); note('disconnected'); }}, 'Disconnect');

sidebar.append(
  el('h2', {}, 'Connection'),
  field('Node', inAddr),
  field('Password', inPass),
  el('label', {class: 'field check'}, inTLS, el('span', {}, 'TLS')),
  field('CA bundle', inCA),
  field('Encryption key', inKey),
  field('Env file', inEnv),
  el('div', {class: 'row'}, btnConnect, btnDisconnect),
  el('p', {class: 'hint'}, 'Password and key stay in memory; the rest is remembered. A sealed client reads only values it sealed.'),
);

async function connect() {
  btnConnect.disabled = true;
  try {
    const s = await Connect({address: inAddr.value.trim(), password: inPass.value, tls: inTLS.checked,
                             ca: inCA.value.trim(), key: inKey.value.trim(), envFile: inEnv.value.trim()});
    setStatus(s);
    note(`connected to ${s.address}`);
    if (current === 'nodes') views.nodes();
  } catch (e) {
    setStatus(status);
    resultBox.textContent = fail(e);
  } finally {
    btnConnect.disabled = false;
  }
}

// ── keys view ─────────────────────────────────────────────────────────────
const inGetKey = el('input', {placeholder: 'key', autocomplete: 'off'});
const inSetKey = el('input', {placeholder: 'key', autocomplete: 'off'});
const inSetVal = el('textarea', {placeholder: 'value', rows: 4});
const inTTL = el('input', {type: 'number', min: 0, placeholder: 'TTL s (0 = default)', class: 'ttl'});
const resultBox = el('pre', {class: 'result'}, 'Connect, then get a key.');

async function get() {
  const key = inGetKey.value.trim();
  if (!key) return;
  try {
    const v = await Get(key);
    resultBox.textContent = v;
    note(`GET ${key} → ${v.length} bytes`);
  } catch (e) { resultBox.textContent = fail(e); }
}
async function set() {
  const key = inSetKey.value.trim();
  if (!key) return;
  const ttl = Number(inTTL.value) || 0;
  try {
    await Set(key, inSetVal.value, ttl);
    resultBox.textContent = `OK  ${key}${ttl ? `  (expires in ${ttl}s)` : ''}`;
    note(`SET ${key} (${inSetVal.value.length} bytes${ttl ? `, ttl ${ttl}s` : ''})`);
  } catch (e) { resultBox.textContent = fail(e); }
}
async function del() {
  const key = inGetKey.value.trim() || inSetKey.value.trim();
  if (!key) return;
  try {
    const was = await Delete(key);
    resultBox.textContent = was ? `deleted ${key}` : `${key}: nothing to delete`;
    note(`DEL ${key} → ${was ? 'deleted' : 'absent'}`);
  } catch (e) { resultBox.textContent = fail(e); }
}
inGetKey.addEventListener('keydown', e => { if (e.key === 'Enter') get(); });

const keysView = el('div', {class: 'keys'},
  el('section', {},
    el('h2', {}, 'Get'),
    el('div', {class: 'row'}, inGetKey, el('button', {class: 'primary', onclick: get}, 'Get'), el('button', {class: 'danger', onclick: del}, 'Delete')),
    resultBox),
  el('section', {},
    el('h2', {}, 'Set'),
    el('div', {class: 'row'}, inSetKey, inTTL),
    inSetVal,
    el('div', {class: 'row'}, el('button', {class: 'primary', onclick: set}, 'Set'))),
);

// ── nodes view ────────────────────────────────────────────────────────────
const nodesTable = el('table', {class: 'nodes'});
const nodesNote = el('p', {class: 'hint'});
const nodesView = el('div', {}, el('h2', {}, 'Cluster'), nodesTable, nodesNote);
let nodesTimer = null;

const ago = iso => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};
const kb = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(1)} MiB`;

async function renderNodes() {
  nodesTable.replaceChildren();
  try {
    const nodes = await Nodes();
    nodesTable.append(el('tr', {}, ...['', 'address', 'version', 'seeds', 'replicas', 'state', 'seen', 'conns', 'moved'].map(h => el('th', {}, h))));
    for (const n of nodes) {
      const dot = el('span', {class: 'dot ' + n.state}, '●');
      nodesTable.append(el('tr', {}, el('td', {}, dot), el('td', {}, n.addr), el('td', {}, n.version || '?'),
                           el('td', {}, n.seeds || '—'), el('td', {}, n.replicas), el('td', {}, n.state),
                           el('td', {}, ago(n.lastSeen)), el('td', {}, String(n.conns)), el('td', {}, kb(n.bytes))));
    }
    nodesNote.textContent = `${nodes.length} node(s) as ${status.address} sees them · refreshes every 5s`;
  } catch (e) { nodesNote.textContent = fail(e); }
}

// ── history view ──────────────────────────────────────────────────────────
const historyList = el('ul', {class: 'history'});
const historyView = el('div', {}, el('h2', {}, 'History'), historyList);

// ── tabs ──────────────────────────────────────────────────────────────────
let current = 'keys';
const views = {
  keys: () => panel.replaceChildren(keysView),
  nodes: () => { panel.replaceChildren(nodesView); renderNodes(); },
  history: () => {
    historyList.replaceChildren(...history.map(h => el('li', {class: h.kind},
      el('time', {}, h.at.toLocaleTimeString()), el('span', {}, h.text))));
    panel.replaceChildren(historyView);
  },
};
for (const name of Object.keys(views)) {
  tabs.append(el('button', {class: 'tab' + (name === current ? ' active' : ''), onclick: e => {
    current = name;
    for (const t of tabs.children) t.classList.toggle('active', t === e.currentTarget);
    clearInterval(nodesTimer); nodesTimer = null;
    views[name]();
    if (name === 'nodes') nodesTimer = setInterval(renderNodes, 5000);
  }}, name[0].toUpperCase() + name.slice(1)));
}
views.keys();

// ── boot ──────────────────────────────────────────────────────────────────
LoadSettings().then(s => {
  inAddr.value = s.address || '';
  inTLS.checked = !!s.tls;
  inCA.value = s.ca || '';
  inEnv.value = s.envFile || '';
}).catch(() => {});
Status().then(setStatus).catch(() => {});
inAddr.focus();
