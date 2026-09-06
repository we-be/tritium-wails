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
- **Keys** — get, set with a TTL, delete. A missing or expired key says so where the
  value would go; a sealed client refuses values it did not seal.
- **Cluster** — every node the connected one knows, its store, state, last beat,
  connections and bytes moved, refreshed every five seconds.
- **History** — what you did this session.

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

`wails dev` works too when the Wails CLI is installed. The Go bindings in
`frontend/wailsjs/go` mirror `app.go`; regenerate them with `wails generate module`
after changing the App's methods, or edit them by hand — they are one line each.
