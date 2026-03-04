#!/bin/bash
# Usage: index.sh <file_path> [type]
FILE_PATH="$1"
TYPE="${2:-pdf}"

if [ -z "$RAG_PORT" ]; then
  echo "Error: RAG_PORT not set"
  exit 1
fi

curl -s "http://127.0.0.1:${RAG_PORT}/index" \
  -H "Content-Type: application/json" \
  -d "{\"path\": \"$FILE_PATH\", \"type\": \"$TYPE\"}"
