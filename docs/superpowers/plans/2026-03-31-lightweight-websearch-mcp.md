# Lightweight Web Search MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Codex-powered web search with lightweight HTTP-based WebSearch + native fetch WebFetch.

**Architecture:** WebSearch calls an OpenAI Responses API compatible endpoint (`/v1/responses` with `web_search_preview` tool) via Node.js native `fetch`. WebFetch uses native `fetch` + `jsdom` + `@mozilla/readability` to extract page content. Both are registered as MCP tools in `coworkRunner.ts`, replacing the Codex implementation.

**Tech Stack:** Node.js native `fetch`, `jsdom`, `@mozilla/readability`, Zod, Claude SDK MCP tools

---

### Task 1: Add npm dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install jsdom and readability**

```bash
npm install jsdom @mozilla/readability && npm install -D @types/jsdom
```

- [ ] **Step 2: Verify packages installed**

```bash
node -e "require('jsdom'); require('@mozilla/readability'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add jsdom and @mozilla/readability for WebFetch"
```

---

### Task 2: Replace Codex search with WebSearch + WebFetch in coworkRunner.ts

**Files:**
- Modify: `src/main/libs/coworkRunner.ts:3392-3534`

- [ ] **Step 1: Delete the entire Codex search block**

Remove lines 3392–3534 in `coworkRunner.ts`. This includes:
- The comment `// Inject Codex-powered web search MCP tools`
- `codexBaseUrl`, `codexModel`, `codexEnvKey`, `codexConfigArgs` variable declarations
- `runCodexExec` function
- `codexSearchTools` array (both `WebSearch` and `WebFetch` tool definitions)
- `codexSearchServerName` and its `options.mcpServers` registration
- The log line `Registered Codex search MCP`

- [ ] **Step 2: Add the new WebSearch + WebFetch implementation**

Insert the following code at the same location (after the memory MCP server registration, before `let userMcpServerCount = 0;`):

```typescript
      // --- Web Search & Fetch MCP tools ---
      // WebSearch: calls OpenAI Responses API with web_search_preview tool
      // WebFetch: native fetch + readability to extract page content
      // Config via env vars: ARK_API_KEY, ARK_BASE_URL, ARK_MODEL

      const arkApiKey = envVars.ARK_API_KEY || '';
      const arkBaseUrl = (envVars.ARK_BASE_URL || '').replace(/\/+$/, '');
      const arkModel = envVars.ARK_MODEL || '';

      const webSearchTools: any[] = [
        tool(
          'WebSearch',
          'Search the web for current information. Use this when you need real-time data, latest documentation, recent news, or any information beyond your knowledge cutoff.',
          {
            query: z.string().min(1).describe('The search query'),
          },
          async (args: { query: string }) => {
            coworkLog('INFO', 'web-search', `WebSearch: "${args.query}"`);

            if (!arkApiKey || !arkBaseUrl || !arkModel) {
              const msg = 'WebSearch not configured. Set ARK_API_KEY, ARK_BASE_URL, and ARK_MODEL in Settings → Environment Variables.';
              coworkLog('WARN', 'web-search', msg);
              return { content: [{ type: 'text', text: msg }], isError: true } as any;
            }

            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 60_000);

              const res = await fetch(`${arkBaseUrl}/v1/responses`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${arkApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: arkModel,
                  stream: false,
                  tools: [{ type: 'web_search_preview' }],
                  input: [
                    {
                      role: 'user',
                      content: [{ type: 'input_text', text: args.query }],
                    },
                  ],
                }),
                signal: controller.signal,
              });

              clearTimeout(timer);

              if (!res.ok) {
                const errBody = await res.text().catch(() => '');
                const msg = `WebSearch API error: ${res.status} ${res.statusText} ${errBody.slice(0, 300)}`;
                coworkLog('ERROR', 'web-search', msg);
                return { content: [{ type: 'text', text: msg }], isError: true } as any;
              }

              const json = await res.json();

              // Extract text from the response output array
              let text = '';
              if (Array.isArray(json.output)) {
                for (const item of json.output) {
                  if (item.type === 'message' && Array.isArray(item.content)) {
                    for (const block of item.content) {
                      if (block.type === 'output_text' && block.text) {
                        text += block.text + '\n';
                      }
                    }
                  }
                }
              }

              text = text.trim() || 'No results found.';
              coworkLog('INFO', 'web-search', `WebSearch returned ${text.length} chars`);
              return { content: [{ type: 'text', text }] } as any;
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              coworkLog('ERROR', 'web-search', `WebSearch failed: ${msg}`);
              return { content: [{ type: 'text', text: `Web search failed: ${msg}` }], isError: true } as any;
            }
          }
        ),
        tool(
          'WebFetch',
          'Fetch and read the content of a specific web page URL. Returns the main text content extracted from the page.',
          {
            url: z.string().url().describe('The URL to fetch and read'),
          },
          async (args: { url: string }) => {
            coworkLog('INFO', 'web-fetch', `WebFetch: "${args.url}"`);

            try {
              const { JSDOM } = require('jsdom');
              const { Readability } = require('@mozilla/readability');

              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 30_000);

              const res = await fetch(args.url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; LobsterAI/1.0)',
                },
                signal: controller.signal,
              });

              clearTimeout(timer);

              if (!res.ok) {
                const msg = `Failed to fetch URL: ${res.status} ${res.statusText}`;
                coworkLog('WARN', 'web-fetch', msg);
                return { content: [{ type: 'text', text: msg }], isError: true } as any;
              }

              const html = await res.text();
              const dom = new JSDOM(html, { url: args.url });
              const reader = new Readability(dom.window.document);
              const article = reader.parse();

              let text: string;
              if (article && article.textContent) {
                text = `# ${article.title || 'Untitled'}\n\n${article.textContent}`;
              } else {
                // Fallback: strip HTML tags
                text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
              }

              // Truncate to avoid overwhelming context
              const MAX_LEN = 50_000;
              if (text.length > MAX_LEN) {
                text = text.slice(0, MAX_LEN) + '\n\n[Content truncated]';
              }

              coworkLog('INFO', 'web-fetch', `WebFetch returned ${text.length} chars`);
              return { content: [{ type: 'text', text }] } as any;
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              coworkLog('ERROR', 'web-fetch', `WebFetch failed: ${msg}`);
              return { content: [{ type: 'text', text: `Web fetch failed: ${msg}` }], isError: true } as any;
            }
          }
        ),
      ];

      const webSearchServerName = `web-search-${sessionId.slice(0, 8)}`;
      options.mcpServers = {
        ...(options.mcpServers as Record<string, unknown>),
        [webSearchServerName]: createSdkMcpServer({
          name: webSearchServerName,
          tools: webSearchTools,
        }),
      };
      coworkLog('INFO', 'runClaudeCodeLocal', `Registered web search MCP: ${webSearchServerName}`);
```

- [ ] **Step 3: Verify the file compiles**

```bash
npx tsc --noEmit src/main/libs/coworkRunner.ts 2>&1 | head -20
```

Expected: no errors related to the changed code.

- [ ] **Step 4: Commit**

```bash
git add src/main/libs/coworkRunner.ts
git commit -m "feat: replace Codex search with lightweight HTTP WebSearch + native WebFetch"
```

---

### Task 3: Remove stale Codex environment variable references

**Files:**
- Modify: `src/main/libs/coworkRunner.ts` (if any other references to `CODEX_BASE_URL`, `CODEX_MODEL`, `CODEX_ENV_KEY` exist)

- [ ] **Step 1: Search for remaining Codex env var references**

```bash
grep -rn "CODEX_BASE_URL\|CODEX_MODEL\|CODEX_ENV_KEY\|codex-search\|codexSearch\|codexConfig\|runCodexExec" src/
```

Expected: no matches (all removed in Task 2). If any remain, delete them.

- [ ] **Step 2: Commit (if changes made)**

```bash
git add -A && git commit -m "chore: remove stale Codex env var references"
```

---

### Task 4: Manual smoke test

- [ ] **Step 1: Build the app**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 2: Test WebSearch**

Launch the app, open a cowork session, set `ARK_API_KEY`, `ARK_BASE_URL`, `ARK_MODEL` in Settings → Environment Variables. Ask the AI: "搜索今天的热点新闻". Verify the WebSearch tool is called and returns results.

- [ ] **Step 3: Test WebFetch**

Ask the AI: "帮我获取 https://example.com 的内容". Verify the WebFetch tool is called and returns extracted page text.

- [ ] **Step 4: Test missing config**

Remove `ARK_API_KEY` from env vars. Ask for a web search. Verify it returns the configuration error message, not a crash.
