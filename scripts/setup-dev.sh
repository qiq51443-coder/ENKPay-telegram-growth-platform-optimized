#!/bin/bash

# Setup Development Environment

echo "=== Setup Development Environment ==="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed"
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "✓ .env file created"
    echo "⚠ Please edit .env with your configuration"
fi

echo "✓ Setup complete!"
