# Lightweight Web Search MCP — Design Spec

## Goal

Replace the heavy Codex-based web search MCP with two lightweight implementations:
- **WebSearch**: HTTP request to an OpenAI Responses API compatible endpoint with `web_search_preview` tool
- **WebFetch**: Node.js native `fetch` + `@mozilla/readability` + `jsdom` for page content extraction

## Configuration

Reuse existing environment variables system (Settings → Environment Variables tab):

| Variable | Purpose | Example |
|---|---|---|
| `ARK_API_KEY` | Bearer token for the API | `eyJ...` |
| `ARK_BASE_URL` | API base URL | `http://llm-model-hub-apis.sf-express.com` |
| `ARK_MODEL` | Model name | `openai/gpt-5.2` |

All three are required for WebSearch to function. If missing, WebSearch tool calls return a helpful error message.

WebFetch requires no additional configuration — it uses Node.js native fetch.

## WebSearch Implementation

### Request Format

```
POST {ARK_BASE_URL}/v1/responses
Authorization: Bearer {ARK_API_KEY}
Content-Type: application/json

{
  "model": "{ARK_MODEL}",
  "stream": false,
  "tools": [{ "type": "web_search_preview" }],
  "input": [
    {
      "role": "user",
      "content": [{ "type": "input_text", "text": "<search query>" }]
    }
  ]
}
```

### Response Parsing

Non-streaming response returns JSON with an `output` array. Extract text content from `output_text` type items:

```json
{
  "id": "...",
  "output": [
    { "type": "web_search_call", "id": "...", "status": "completed" },
    {
      "type": "message",
      "content": [
        { "type": "output_text", "text": "..." }
      ]
    }
  ]
}
```

Walk `output[]`, find items with content arrays, extract `output_text` entries.

### Timeout

60 seconds, matching the previous Codex implementation.

## WebFetch Implementation

1. `fetch(url)` with 30s timeout, User-Agent header
2. Parse HTML with `jsdom`
3. Extract main content with `@mozilla/readability`
4. Return extracted text (title + content), truncated to ~50k chars to avoid overwhelming context

Fallback: if readability extraction fails, return raw text content stripped of HTML tags.

## What Gets Removed

- All Codex-related code in `coworkRunner.ts` (~lines 3392–3534): `codexBaseUrl`, `codexModel`, `codexEnvKey`, `codexConfigArgs`, `runCodexExec`, `codexSearchTools`, `codexSearchServerName`
- Related environment variables: `CODEX_BASE_URL`, `CODEX_MODEL`, `CODEX_ENV_KEY`

## What Stays

- `msetRuntime.ts`, `setup-mset.js`, `resources/mset/` — still needed for Node.js runtime
- `disallowedTools: ['WebSearch', 'WebFetch']` — still block Claude's built-in versions
- Memory MCP server — untouched
- User-configured MCP servers — untouched

## Dependencies

New npm packages:
- `jsdom` (+ `@types/jsdom` as devDep)
- `@mozilla/readability`

No new external processes. Everything runs in the Electron main process.
