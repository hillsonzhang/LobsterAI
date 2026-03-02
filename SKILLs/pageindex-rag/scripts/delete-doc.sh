#!/bin/bash
# Usage: delete-doc.sh <doc_id>
DOC_ID="$1"

if [ -z "$RAG_PORT" ]; then
  echo "Error: RAG_PORT not set"
  exit 1
fi

curl -s -X DELETE "http://127.0.0.1:${RAG_PORT}/documents/${DOC_ID}"
