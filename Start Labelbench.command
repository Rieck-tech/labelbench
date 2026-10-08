#!/bin/bash
# Double-click this file on a Mac to start Labelbench.
cd "$(dirname "$0")" || exit 1

if ! command -v npm >/dev/null 2>&1; then
    echo "Node.js isn't installed. Get the LTS version from https://nodejs.org, then try again."
    read -r -p "Press Enter to close."
    exit 1
fi

if [ ! -d node_modules/@bradycorporation ]; then
    echo "First start: installing what Labelbench needs (this needs internet once)…"
    npm install || { read -r -p "Install failed. Press Enter to close."; exit 1; }
fi

npm start
