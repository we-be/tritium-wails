package main

import (
	"cmp"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/we-be/tritium/pkg/tritium"
)

// Settings is what the Connect panel holds. Address, TLS, CA and EnvFile are
// saved between runs; the password and the encryption key never touch disk.
type Settings struct {
	Address  string `json:"address"`
	Password string `json:"password"`
	TLS      bool   `json:"tls"`
	CA       string `json:"ca"`
	Key      string `json:"key"`     // hex or base64, 32 bytes: values are sealed client-side
	EnvFile  string `json:"envFile"` // a node's dotenv file: fills address, password and CA
}

type Status struct {
	Connected bool   `json:"connected"`
	Address   string `json:"address"`
	Node      string `json:"node"` // what the node announces to its peers; empty when INFO does not say
	TLS       bool   `json:"tls"`
	Encrypted bool   `json:"encrypted"`
}

// Node is one row of the cluster view.
type Node struct {
	ID       string `json:"id"`
	Addr     string `json:"addr"`
	State    string `json:"state"`
	Version  string `json:"version"`
	Seeds    string `json:"seeds"`    // what the node dials, comma-separated
	Replicas string `json:"replicas"` // "1", or "1 (1 held)" when a peer stopped answering
	LastSeen string `json:"lastSeen"`
	Conns    int64  `json:"conns"`
	Bytes    int64  `json:"bytes"`
	Weight   int    `json:"weight"` // ELECTRONEGATIVITY: its share of key ownership; 0 never owns
	Keys     int64  `json:"keys"`   // what its store holds
	Memory   int64  `json:"memory"` // bytes its store uses
	Writes   int64  `json:"writes"` // writes carried out as owner since it started
}

type App struct {
	ctx    context.Context
	mu     sync.Mutex
	client *tritium.Client
	opts   tritium.ClientOptions // what Connect dialed with, so Where can dial a peer the same way
	status Status
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) { a.ctx = ctx }

func (a *App) shutdown(ctx context.Context) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.client != nil {
		a.client.Close()
	}
}

func settingsPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, "tritium-wails", "settings.json")
}

// LoadSettings returns what was saved last time, secrets excluded.
func (a *App) LoadSettings() Settings {
	s := Settings{Address: "127.0.0.1:8080"}
	if p := settingsPath(); p != "" {
		if data, err := os.ReadFile(p); err == nil {
			json.Unmarshal(data, &s)
		}
	}
	s.Password, s.Key = "", ""
	return s
}

func saveSettings(s Settings) {
	p := settingsPath()
	if p == "" {
		return
	}
	s.Password, s.Key = "", ""
	data, _ := json.MarshalIndent(s, "", "  ")
	os.MkdirAll(filepath.Dir(p), 0o700)
	os.WriteFile(p, data, 0o600)
}

// Connect opens a client from the settings, proves it with a PING, and
// replaces the previous one. An env file fills address, password and CA;
// fields typed in the panel win over it.
func (a *App) Connect(s Settings) (Status, error) {
	opts := tritium.ClientOptions{Address: s.Address, Password: s.Password, Timeout: 5 * time.Second}
	if s.EnvFile != "" {
		env, err := tritium.OptionsFromEnv(s.EnvFile)
		if err != nil {
			return a.status, err
		}
		if s.Address == "" {
			opts.Address = env.Address
		}
		if s.Password == "" {
			opts.Password = env.Password
		}
		if env.TLS != nil && !s.TLS && s.CA == "" {
			opts.TLS = env.TLS
		}
	}
	if s.TLS || s.CA != "" {
		var err error
		if opts.TLS, err = tritium.TLSConfig(s.CA); err != nil {
			return a.status, err
		}
	}
	if s.Key != "" {
		key, err := tritium.ParseKey(s.Key)
		if err != nil {
			return a.status, err
		}
		opts.Key = key
	}
	c, err := tritium.NewClient(&opts)
	if err != nil {
		return a.status, err
	}
	if err := c.Ping(); err != nil {
		c.Close()
		return a.status, fmt.Errorf("connected but PING failed: %w", err)
	}
	a.mu.Lock()
	if a.client != nil {
		a.client.Close()
	}
	a.client = c
	a.opts = opts
	a.status = Status{Connected: true, Address: opts.Address, Node: nodeAddr(c), TLS: opts.TLS != nil, Encrypted: opts.Key != nil}
	a.mu.Unlock()
	saveSettings(s)
	return a.status, nil
}

// nodeAddr is the address the node announces to its peers, from INFO, so the
// cluster view can mark the node the app is on even when it was dialed over
// loopback. Empty for a user INFO tells less.
func nodeAddr(c *tritium.Client) string {
	v, err := c.Do("INFO")
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(bulk(v), "\n") {
		if rest, ok := strings.CutPrefix(strings.TrimSpace(line), "node_addr:"); ok {
			return rest
		}
	}
	return ""
}

func (a *App) Disconnect() Status {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.client != nil {
		a.client.Close()
		a.client = nil
	}
	a.status = Status{}
	return a.status
}

func (a *App) Status() Status {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.status
}

func (a *App) conn() (*tritium.Client, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.client == nil {
		return nil, errors.New("not connected")
	}
	return a.client, nil
}

// Value is what Get hands the editor: the string under a key, or a sorted set
// rendered one "score<TAB>member" per line, lowest score first.
type Value struct {
	Type  string `json:"type"` // string or zset
	Text  string `json:"text"`
	Count int    `json:"count"` // members, when a sorted set
}

// Get returns what a key holds; "not found" is an error like any other so the
// UI shows it where the value would go. A sorted set (a mubs board, the fleet
// index) is read whole with its scores, since GET alone refuses the type.
func (a *App) Get(key string) (Value, error) {
	c, err := a.conn()
	if err != nil {
		return Value{}, err
	}
	typ, err := c.Type(key)
	if err != nil {
		return Value{}, err
	}
	switch typ {
	case "none":
		return Value{}, fmt.Errorf("%s: not found (missing or expired)", key)
	case "zset":
		v, err := c.Do("ZRANGEBYSCORE", key, "-inf", "+inf", "WITHSCORES")
		if err != nil {
			return Value{}, err
		}
		items, _ := v.([]any)
		var sb strings.Builder
		for i := 0; i+1 < len(items); i += 2 {
			fmt.Fprintf(&sb, "%s\t%s\n", bulk(items[i+1]), bulk(items[i]))
		}
		return Value{Type: "zset", Text: sb.String(), Count: len(items) / 2}, nil
	}
	v, err := c.Get(key)
	if errors.Is(err, tritium.ErrNotFound) {
		return Value{}, fmt.Errorf("%s: not found (missing or expired)", key)
	}
	if err != nil {
		return Value{}, err
	}
	return Value{Type: "string", Text: string(v)}, nil
}

func bulk(v any) string {
	switch x := v.(type) {
	case []byte:
		return string(x)
	case string:
		return x
	}
	return fmt.Sprint(v)
}

// Set stores value under key; ttl 0 uses the node's default. A sorted set
// under that name is left alone: the editor shows one read-only, and a string
// written over it would silently drop a board.
func (a *App) Set(key, value string, ttl int) error {
	c, err := a.conn()
	if err != nil {
		return err
	}
	if typ, err := c.Type(key); err != nil {
		return err
	} else if typ == "zset" {
		return fmt.Errorf("%s holds a sorted set; delete it first to store a string there", key)
	}
	var t *int
	if ttl > 0 {
		t = &ttl
	}
	return c.Set(key, []byte(value), t)
}

// Delete removes key and reports whether it was there.
func (a *App) Delete(key string) (bool, error) {
	c, err := a.conn()
	if err != nil {
		return false, err
	}
	return c.Delete(key)
}

// Copy is what one node has under a key. Every write replicates, so the row
// that disagrees — another digest, a shorter value, a node that will not say —
// is the one worth looking at.
type Copy struct {
	Node   string `json:"node"`
	Type   string `json:"type"`
	TTL    int64  `json:"ttl"`
	Bytes  int64  `json:"bytes"`  // a string: how many bytes lie there, a sealed value as it lies
	Digest string `json:"digest"` // the first 8 hex of a sha256 over those same bytes
	Count  int    `json:"count"`  // a sorted set: how many members
	Error  string `json:"error"`  // this node alone would not answer
}

// Where asks every healthy node what it holds under key, dialing each on its
// own address with the settings this connection uses. A node that refuses the
// password answers in its own row rather than sinking the whole call.
func (a *App) Where(key string) ([]Copy, error) {
	c, err := a.conn()
	if err != nil {
		return nil, err
	}
	view, err := c.Nodes()
	if err != nil {
		return nil, err
	}
	a.mu.Lock()
	opts, mine := a.opts, a.status.Node
	a.mu.Unlock()
	addrs := make([]string, 0, len(view))
	for _, n := range view {
		if n.State == "healthy" {
			addrs = append(addrs, n.Addr)
		}
	}
	slices.Sort(addrs)
	out := make([]Copy, len(addrs))
	var wg sync.WaitGroup
	for i, addr := range addrs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if addr == mine || addr == opts.Address { // the node we are on answers on the open connection
				out[i] = holds(c, addr, key)
				return
			}
			peer := opts
			peer.Address = addr
			pc, err := tritium.NewClient(&peer)
			if err != nil {
				out[i] = Copy{Node: addr, Error: err.Error()}
				return
			}
			defer pc.Close()
			out[i] = holds(pc, addr, key)
		}()
	}
	wg.Wait()
	return out, nil
}

// holds reads key on one node. A string is measured and digested as stored,
// never opened: a sealed value has to be comparable across nodes by a client
// that may not hold its key.
func holds(c *tritium.Client, addr, key string) Copy {
	out := Copy{Node: addr}
	typ, err := c.Type(key)
	if err != nil {
		out.Error = err.Error()
		return out
	}
	out.Type = typ
	ttl, err := c.Do("TTL", key)
	if err != nil {
		out.Error = err.Error()
		return out
	}
	out.TTL, _ = ttl.(int64)
	switch typ {
	case "string":
		v, err := c.Do("GET", key)
		if err != nil {
			out.Error = err.Error()
			return out
		}
		b, _ := v.([]byte)
		sum := sha256.Sum256(b)
		out.Bytes, out.Digest = int64(len(b)), hex.EncodeToString(sum[:4])
	case "zset":
		v, err := c.Do("ZCARD", key)
		if err != nil {
			out.Error = err.Error()
			return out
		}
		n, _ := v.(int64)
		out.Count = int(n)
	}
	return out
}

// ScanKey is one row of a Keys-view page.
type ScanKey struct {
	Name string `json:"name"`
	Type string `json:"type"`
	TTL  int64  `json:"ttl"`
}

// ScanResult is one SCAN page: what matched, and the cursor to keep paging
// with. Next is 0 once the walk is done; otherwise it's opaque to the UI —
// hold it and pass it straight back for the next page.
type ScanResult struct {
	Keys []ScanKey `json:"keys"`
	Next uint64    `json:"next"`
}

// Scan lists keys matching pattern ("" or "*" for everything) one page at a
// time, fetching each key's type and TTL in the same round trip so the Keys
// view never issues a call per row.
func (a *App) Scan(pattern string, cursor uint64, count int) (ScanResult, error) {
	c, err := a.conn()
	if err != nil {
		return ScanResult{}, err
	}
	names, next, err := c.Scan(cursor, pattern, count)
	if err != nil {
		return ScanResult{}, err
	}
	keys := make([]ScanKey, 0, len(names))
	for _, name := range names {
		typ, err := c.Type(name)
		if err != nil {
			return ScanResult{}, err
		}
		ttl, err := c.Do("TTL", name)
		if err != nil {
			return ScanResult{}, err
		}
		n, _ := ttl.(int64)
		keys = append(keys, ScanKey{Name: name, Type: typ, TTL: n})
	}
	return ScanResult{Keys: keys, Next: next}, nil
}

// Nodes is the cluster as the connected node sees it, sorted by address.
// Event is one line of a node's fleet log: attach, detach, hold, repair,
// stall, evict, resync or start, with the peer involved when there is one.
type Event struct {
	At    int64  `json:"at"` // unix milliseconds
	Node  string `json:"node"`
	Event string `json:"event"`
	Peer  string `json:"peer"`
	Keys  int    `json:"keys"`
	Took  int64  `json:"took"` // milliseconds
}

// Events is every node's fleet log over the last sinceSeconds, newest first.
func (a *App) Events(sinceSeconds int) ([]Event, error) {
	c, err := a.conn()
	if err != nil {
		return nil, err
	}
	view, err := c.Nodes()
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(view))
	for id := range view {
		ids = append(ids, id)
	}
	evs, err := c.Events(ids, time.Duration(sinceSeconds)*time.Second)
	if err != nil {
		return nil, err
	}
	out := make([]Event, 0, len(evs))
	for _, e := range evs {
		out = append(out, Event{At: e.At, Node: e.Node, Event: e.Event, Peer: e.Peer, Keys: e.Keys, Took: e.Took})
	}
	slices.SortFunc(out, func(x, y Event) int { return cmp.Compare(y.At, x.At) })
	return out, nil
}

func (a *App) Nodes() ([]Node, error) {
	c, err := a.conn()
	if err != nil {
		return nil, err
	}
	view, err := c.Nodes()
	if err != nil {
		return nil, err
	}
	out := make([]Node, 0, len(view))
	for id, n := range view {
		replicas := strconv.Itoa(n.Stats.Replicas)
		if n.Stats.Held > 0 {
			replicas += fmt.Sprintf(" (%d held)", n.Stats.Held)
		}
		out = append(out, Node{ID: id, Addr: n.Addr, State: string(n.State),
			Version: n.Version, Seeds: strings.Join(n.Seeds, ", "), Replicas: replicas,
			LastSeen: n.LastSeen.Format(time.RFC3339), Conns: n.Stats.ActiveConnections, Bytes: n.Stats.BytesTransferred,
			Weight: n.Weight(), Keys: n.Stats.Keys, Memory: n.Stats.Memory, Writes: n.Stats.Writes})
	}
	slices.SortFunc(out, func(a, b Node) int { return strings.Compare(a.Addr, b.Addr) })
	return out, nil
}

// Client is one connection a node is holding.
type Client struct {
	ID   string `json:"id"`
	Addr string `json:"addr"`
	Name string `json:"name"` // what the connection called itself: a worker, a bridge, a peer
	Age  int64  `json:"age"`  // seconds since it connected
	Idle int64  `json:"idle"` // seconds since its last command
	User string `json:"user"`
	Cmd  string `json:"cmd"` // the last command it ran
}

// Clients lists who is on the connected node, in the order the node lists
// them. CLIENT LIST answers with a line of key=value pairs per connection;
// a node that has no such command says so and the view shows that.
func (a *App) Clients() ([]Client, error) {
	c, err := a.conn()
	if err != nil {
		return nil, err
	}
	v, err := c.Do("CLIENT", "LIST")
	if err != nil {
		return nil, err
	}
	out := []Client{}
	for _, line := range strings.Split(bulk(v), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		var cl Client
		for _, f := range strings.Fields(line) {
			k, val, _ := strings.Cut(f, "=")
			switch k {
			case "id":
				cl.ID = val
			case "addr":
				cl.Addr = val
			case "name":
				cl.Name = val
			case "age":
				cl.Age, _ = strconv.ParseInt(val, 10, 64)
			case "idle":
				cl.Idle, _ = strconv.ParseInt(val, 10, 64)
			case "user":
				cl.User = val
			case "cmd":
				cl.Cmd = val
			}
		}
		out = append(out, cl)
	}
	return out, nil
}
