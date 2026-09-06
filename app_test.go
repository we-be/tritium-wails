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
	if err != nil || !st.Connected {
		t.Fatalf("Connect: %+v, %v", st, err)
	}
	if err := a.Set("wails:test", "hello", 30); err != nil {
		t.Fatal(err)
	}
	if v, err := a.Get("wails:test"); err != nil || v != "hello" {
		t.Fatalf("Get = %q, %v", v, err)
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
	a.Disconnect()
}
