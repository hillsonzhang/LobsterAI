#!/bin/bash
# Usage: search.sh <query> [doc_ids_comma_separated] [top_k]
QUERY="$1"
DOC_IDS="$2"
TOP_K="${3:-5}"

if [ -z "$RAG_PORT" ]; then
  echo "Error: RAG_PORT not set"
  exit 1
fi

if [ -n "$DOC_IDS" ]; then
  IDS_JSON=$(echo "$DOC_IDS" | tr ',' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
  curl -s "http://127.0.0.1:${RAG_PORT}/search" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$QUERY\", \"doc_ids\": [$IDS_JSON], \"top_k\": $TOP_K}"
else
  curl -s "http://127.0.0.1:${RAG_PORT}/search" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$QUERY\", \"top_k\": $TOP_K}"
fi
