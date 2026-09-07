package main

import (
	"context"
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
}

type App struct {
	ctx    context.Context
	mu     sync.Mutex
	client *tritium.Client
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
	a.status = Status{Connected: true, Address: opts.Address, TLS: opts.TLS != nil, Encrypted: opts.Key != nil}
	a.mu.Unlock()
	saveSettings(s)
	return a.status, nil
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

// Get returns the value under key; "not found" is an error like any other so
// the UI shows it where the value would go.
func (a *App) Get(key string) (string, error) {
	c, err := a.conn()
	if err != nil {
		return "", err
	}
	v, err := c.Get(key)
	if errors.Is(err, tritium.ErrNotFound) {
		return "", fmt.Errorf("%s: not found (missing or expired)", key)
	}
	if err != nil {
		return "", err
	}
	return string(v), nil
}

// Set stores value under key; ttl 0 uses the node's default.
func (a *App) Set(key, value string, ttl int) error {
	c, err := a.conn()
	if err != nil {
		return err
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
			LastSeen: n.LastSeen.Format(time.RFC3339), Conns: n.Stats.ActiveConnections, Bytes: n.Stats.BytesTransferred})
	}
	slices.SortFunc(out, func(a, b Node) int { return strings.Compare(a.Addr, b.Addr) })
	return out, nil
}
