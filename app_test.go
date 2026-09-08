package main

import (
	"os"
	"testing"
)

// Against a real node when TRITIUM_ENV names its env file; skipped otherwise.
func TestAppAgainstNode(t *testing.T) {
	env := os.Getenv("TRITIUM_ENV")
	if env == "" {
		t.Skip("set TRITIUM_ENV to a node's env file")
	}
	a := NewApp()
	st, err := a.Connect(Settings{EnvFile: env})
	if err != nil || !st.Connected || st.Node == "" {
		t.Fatalf("Connect: %+v, %v", st, err)
	}
	if err := a.Set("wails:test", "hello", 30); err != nil {
		t.Fatal(err)
	}
	if v, err := a.Get("wails:test"); err != nil || v.Text != "hello" {
		t.Fatalf("Get = %+v, %v", v, err)
	}
	if _, err := a.client.Do("ZADD", "wails:zset", "2", "b", "1", "a"); err != nil {
		t.Fatal(err)
	}
	if v, err := a.Get("wails:zset"); err != nil || v.Type != "zset" || v.Count != 2 || v.Text != "1\ta\n2\tb\n" {
		t.Fatalf("Get of a sorted set = %+v, %v", v, err)
	}
	if err := a.Set("wails:zset", "x", 30); err == nil {
		t.Fatal("Set over a sorted set was allowed")
	}
	if was, err := a.Delete("wails:zset"); err != nil || !was {
		t.Fatalf("Delete of a sorted set = %v, %v", was, err)
	}
	found := false
	for cursor := uint64(0); ; {
		page, err := a.Scan("wails:*", cursor, 50)
		if err != nil {
			t.Fatalf("Scan: %v", err)
		}
		for _, k := range page.Keys {
			if k.Name == "wails:test" && k.Type == "string" && k.TTL > 0 {
				found = true
			}
		}
		if page.Next == 0 {
			break
		}
		cursor = page.Next
	}
	if !found {
		t.Fatal("Scan did not find wails:test")
	}
	clients, err := a.Clients()
	if err != nil || len(clients) == 0 {
		t.Fatalf("Clients = %v, %v", clients, err)
	}
	t.Logf("clients: %d, first %s %q idle %ds", len(clients), clients[0].Addr, clients[0].Cmd, clients[0].Idle)
	copies, err := a.Where("wails:test")
	held := 0
	for _, c := range copies {
		if c.Error == "" && c.Type == "string" {
			held++
		}
		t.Logf("where %s: type=%s ttl=%d bytes=%d %s %s", c.Node, c.Type, c.TTL, c.Bytes, c.Digest, c.Error)
	}
	if err != nil || held == 0 {
		t.Fatalf("Where held nowhere: %+v, %v", copies, err)
	}
	if was, err := a.Delete("wails:test"); err != nil || !was {
		t.Fatalf("Delete = %v, %v", was, err)
	}
	if _, err := a.Get("wails:test"); err == nil {
		t.Fatal("deleted key still readable")
	}
	nodes, err := a.Nodes()
	if err != nil || len(nodes) == 0 {
		t.Fatalf("Nodes = %v, %v", nodes, err)
	}
	t.Logf("nodes: %d, first %s %s", len(nodes), nodes[0].Addr, nodes[0].State)
	if _, err := a.Events(3600); err != nil {
		t.Fatalf("Events: %v", err)
	}
	a.Disconnect()
}
