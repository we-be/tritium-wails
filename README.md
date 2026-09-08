# Tritium GUI

A desktop client for [tritium](https://github.com/we-be/tritium): browse and edit
keys, see the cluster, over the Redis protocol with the node's password, TLS, and
client-side encryption.

![tritium-wails](https://github.com/user-attachments/assets/6d5c5e00-cb9e-4b7d-a282-d6691e1be881)

## What it does

- **Connect** to any node by address and AUTH password, optionally over TLS verified
  against a CA bundle, and optionally with a 32-byte key so values are sealed before
  they leave the app (`tritium.ParseKey`: hex or base64). A node's own `.env` file fills
  address, password and CA in one go. Password and key stay in memory; the rest is
  remembered in `~/.config/tritium-wails/settings.json`.
- **Keys** — a pattern box pages through the keyspace with SCAN, listing each key's
  type and TTL and a "More" control for the next page; click one to load it into
  the editor. Get fills it, Set writes it (with a TTL), Delete removes it after a
  second click to confirm, and either refreshes the list. Enter gets, Ctrl+Enter
  sets. The `{ }` toggle shows a JSON value indented; an unedited value goes back
  byte for byte, an edited one is written compact. A sorted set loads read-only,
  one `score<TAB>member` per line, and Set will not write a string over it. A
  missing or expired key says so on the status line; a sealed client refuses
  values it did not seal. Where asks every healthy node what it has under the
  key and puts the answers under the editor — type, TTL, and either a size with
  a short digest of the bytes as they are stored or a member count — so a node
  holding something else, or refusing the password, says so in its own row.
- **Cluster** — the fleet as the connected node sees it, drawn as a ring: an edge
  for each seed a node dials (heavier when mutual, dashed to a node that is down,
  hollow for a seed that is not a member), the node you are on marked with a dot.
  Hover a node for its state, version, seeds, replicas (held ones flagged), last
  beat, connections and bytes moved; click to pin it, click empty space to let go.
  The card keeps one shape so rows compare across nodes, and sums the fleet up
  when nothing is selected. Under it, the fleet's event log for the last hour —
  attach, detach, hold, repair, stall, evict, resync, start — narrowed to the
  selected node. Under the ring, who is on the node you are connected to, as
  its own CLIENT LIST tells it: the workers, bridges and peers holding a
  socket, each with its user, last command, idle seconds and address.
  Refreshed every five seconds.
- **Log** — what you did this session, errors in red.

With an env file remembered the app connects on launch. Disconnected, the Keys and
Cluster panes sit blurred under a note; the log stays readable.

Nothing rendered comes through `innerHTML`: values come from a store anyone with the
password can write to.

## Development

Go 1.26 and Node. The frontend is plain JavaScript built by Vite; the app is Wails v2,
so a Linux build needs GTK 3 and WebKitGTK 4.1 headers (on an immutable desktop, a
Fedora distrobox with `gcc pkg-config gtk3-devel webkit2gtk4.1-devel golang` does it,
and the binary runs on the host).

```sh
cd frontend && npm install && npm run build && cd ..
go build -tags desktop,production,webkit2_41 -ldflags "-s -w" -o build/bin/tritium-wails .
./build/bin/tritium-wails
```

`npm run dev` in `frontend/` opens the UI in a browser against a stand-in Go side
with sample data (`src/mock.js`), for layout work without a node; `wails dev`
works too when the Wails CLI is installed. The Go bindings in
`frontend/wailsjs/go` mirror `app.go`; regenerate them with `wails generate module`
after changing the App's methods, or edit them by hand — they are one line each.
