#!/bin/bash
# Usage: index.sh <file_path> [type]
FILE_PATH="$1"
TYPE="${2:-pdf}"

if [ -z "$RAG_PORT" ]; then
  echo "Error: RAG_PORT not set"
  exit 1
fi

# Use python to safely JSON-encode variables, preventing injection
JSON_BODY=$(python3 -c "
import json, sys
print(json.dumps({'path': sys.argv[1], 'type': sys.argv[2]}))
" "$FILE_PATH" "$TYPE")

curl -s "http://127.0.0.1:${RAG_PORT}/index" \
  -H "Content-Type: application/json" \
  -d "$JSON_BODY"
