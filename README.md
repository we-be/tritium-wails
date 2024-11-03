# Tritium GUI Client

A modern, cross-platform GUI client for interacting with [Tritium](https://github.com/we-be/tritium) key-value stores.

![Screenshot from 2024-11-03 11-37-57](https://github.com/user-attachments/assets/6d5c5e00-cb9e-4b7d-a282-d6691e1be881)

## Features

- 🔑 Key-value operations (Get/Set)
- 📝 Command history tracking
- 🔌 Connection management
- 🎨 Clean, modern dark interface
- ⚡ Real-time connection status

## Installation

Download the latest release for your platform from the [releases page](https://github.com/we-be/tritium-wails/releases).

## Development

### Prerequisites

- [Go](https://go.dev/doc/install) (1.21 or later)
- [Wails](https://wails.io/docs/gettingstarted/installation)

### Setup

```bash
# Clone the repository
git clone https://github.com/we-be/tritium-wails.git
cd tritium-wails

# Install dependencies
go mod download
cd frontend && npm install

# Run in development mode
wails dev

# Build for production
wails build
```

## License

MIT
