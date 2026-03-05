#!/bin/bash
# Usage: search.sh <query> [doc_ids_comma_separated] [top_k]
QUERY="$1"
DOC_IDS="$2"
TOP_K="${3:-5}"

if [ -z "$RAG_PORT" ]; then
  echo "Error: RAG_PORT not set"
  exit 1
fi

# Use python to safely JSON-encode variables, preventing injection
JSON_BODY=$(python3 -c "
import json, sys
query = sys.argv[1]
doc_ids_str = sys.argv[2]
top_k = int(sys.argv[3])
body = {'query': query, 'top_k': top_k}
if doc_ids_str:
    body['doc_ids'] = [d.strip() for d in doc_ids_str.split(',') if d.strip()]
print(json.dumps(body))
" "$QUERY" "$DOC_IDS" "$TOP_K")

curl -s "http://127.0.0.1:${RAG_PORT}/search" \
  -H "Content-Type: application/json" \
  -d "$JSON_BODY"
