package main

import (
	"context"
	"fmt"
	"time"

	"github.com/we-be/tritium/pkg/tritium"
)

// App struct
type App struct {
	ctx    context.Context
	client *tritium.Client
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Initialize tritium client
	client, err := tritium.NewClient(&tritium.ClientOptions{
		Address: "localhost:40217", // Make sure this matches your server port
		Timeout: 5 * time.Second,
	})
	if err != nil {
		fmt.Printf("Failed to connect to tritium server: %v\n", err)
		return
	}
	a.client = client
}

// SetValue sets a value in the store
func (a *App) SetValue(key string, value string) string {
	if a.client == nil {
		return "Error: Client not connected"
	}

	err := a.client.Set(key, []byte(value), nil)
	if err != nil {
		return fmt.Sprintf("Error: %v", err)
	}
	return "Value set successfully"
}

// GetValue gets a value from the store
func (a *App) GetValue(key string) string {
	if a.client == nil {
		return "Error: Client not connected"
	}

	value, err := a.client.Get(key)
	if err != nil {
		return fmt.Sprintf("Error: %v", err)
	}
	return string(value)
}
