#!/bin/bash
# Usage: list-docs.sh [limit] [offset]
LIMIT="${1:-50}"
OFFSET="${2:-0}"

if [ -z "$RAG_PORT" ]; then
  echo "Error: RAG_PORT not set"
  exit 1
fi

curl -s "http://127.0.0.1:${RAG_PORT}/documents?limit=${LIMIT}&offset=${OFFSET}"
