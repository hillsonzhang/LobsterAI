# PageIndex RAG 本地知识库插件 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate PageIndex as a local sidecar RAG service into LobsterAI, with a Skill for Claude tool access and a dedicated knowledge base management UI page.

**Architecture:** Python FastAPI sidecar (started with Electron) → Main process manages lifecycle + IPC → Renderer provides KnowledgeBaseView page (via Sidebar button) + Redux state. Skill scripts call the local sidecar HTTP API so Claude can search/index documents.

**Tech Stack:** Python (FastAPI, uvicorn, pageindex), TypeScript/React, Redux Toolkit, SQLite (sql.js), Tailwind CSS, Heroicons

**Design doc:** `docs/plans/2026-03-02-pageindex-rag-design.md`

---

## Task 1: FastAPI Sidecar — Python service skeleton

**Files:**
- Create: `SKILLs/pageindex-rag/sidecar/requirements.txt`
- Create: `SKILLs/pageindex-rag/sidecar/app.py`
- Create: `SKILLs/pageindex-rag/sidecar/storage.py`

**Step 1: Create requirements.txt**

```
SKILLs/pageindex-rag/sidecar/requirements.txt
```
```
fastapi>=0.104.0
uvicorn>=0.24.0
pageindex>=0.1.0
```

**Step 2: Create storage.py — SQLite storage layer**

```
SKILLs/pageindex-rag/sidecar/storage.py
```
```python
import sqlite3
import json
import uuid
import time
from typing import Optional

class RagStorage:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._ensure_tables()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _ensure_tables(self):
        conn = self._get_conn()
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS rag_documents (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    type TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    nodes_count INTEGER DEFAULT 0,
                    error_message TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS rag_trees (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    doc_id TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
                    tree_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
            """)
            conn.commit()
        finally:
            conn.close()

    def create_document(self, name: str, file_path: str, doc_type: str) -> dict:
        doc_id = str(uuid.uuid4())
        now = int(time.time() * 1000)
        conn = self._get_conn()
        try:
            conn.execute(
                "INSERT INTO rag_documents (id, name, file_path, type, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
                (doc_id, name, file_path, doc_type, now, now)
            )
            conn.commit()
            return {"id": doc_id, "name": name, "file_path": file_path, "type": doc_type, "status": "pending", "nodes_count": 0, "created_at": now, "updated_at": now}
        finally:
            conn.close()

    def update_document_status(self, doc_id: str, status: str, nodes_count: int = 0, error_message: Optional[str] = None):
        now = int(time.time() * 1000)
        conn = self._get_conn()
        try:
            conn.execute(
                "UPDATE rag_documents SET status = ?, nodes_count = ?, error_message = ?, updated_at = ? WHERE id = ?",
                (status, nodes_count, error_message, now, doc_id)
            )
            conn.commit()
        finally:
            conn.close()

    def save_tree(self, doc_id: str, tree_json: str):
        now = int(time.time() * 1000)
        conn = self._get_conn()
        try:
            conn.execute("DELETE FROM rag_trees WHERE doc_id = ?", (doc_id,))
            conn.execute(
                "INSERT INTO rag_trees (doc_id, tree_json, created_at) VALUES (?, ?, ?)",
                (doc_id, tree_json, now)
            )
            conn.commit()
        finally:
            conn.close()

    def get_tree(self, doc_id: str) -> Optional[str]:
        conn = self._get_conn()
        try:
            row = conn.execute("SELECT tree_json FROM rag_trees WHERE doc_id = ?", (doc_id,)).fetchone()
            return row["tree_json"] if row else None
        finally:
            conn.close()

    def get_document(self, doc_id: str) -> Optional[dict]:
        conn = self._get_conn()
        try:
            row = conn.execute("SELECT * FROM rag_documents WHERE id = ?", (doc_id,)).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    def list_documents(self, limit: int = 50, offset: int = 0) -> dict:
        conn = self._get_conn()
        try:
            total = conn.execute("SELECT COUNT(*) FROM rag_documents").fetchone()[0]
            rows = conn.execute(
                "SELECT * FROM rag_documents ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (limit, offset)
            ).fetchall()
            return {"documents": [dict(r) for r in rows], "total": total}
        finally:
            conn.close()

    def delete_document(self, doc_id: str) -> bool:
        conn = self._get_conn()
        try:
            cursor = conn.execute("DELETE FROM rag_documents WHERE id = ?", (doc_id,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()
```

**Step 3: Create app.py — FastAPI main entry**

```
SKILLs/pageindex-rag/sidecar/app.py
```
```python
import os
import sys
import json
import threading
import traceback
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import uvicorn

from storage import RagStorage

app = FastAPI(title="PageIndex RAG Sidecar")

DB_PATH = os.environ.get("RAG_DB_PATH", "rag.sqlite")
PORT = int(os.environ.get("RAG_PORT", "0"))

storage = RagStorage(DB_PATH)

# Track background indexing tasks
_indexing_tasks: dict[str, threading.Thread] = {}


class IndexRequest(BaseModel):
    path: str
    type: str = "pdf"


class SearchRequest(BaseModel):
    query: str
    doc_ids: Optional[list[str]] = None
    top_k: int = 5


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/index")
def index_document(req: IndexRequest):
    if not os.path.exists(req.path):
        raise HTTPException(status_code=400, detail=f"File not found: {req.path}")

    name = os.path.basename(req.path)
    doc = storage.create_document(name, req.path, req.type)
    doc_id = doc["id"]

    def _build_index():
        try:
            storage.update_document_status(doc_id, "processing")
            # Import pageindex and build tree
            from indexer import build_tree
            tree_result = build_tree(req.path, req.type)
            tree_json = json.dumps(tree_result, ensure_ascii=False)
            nodes_count = len(tree_result.get("nodes", []))
            storage.save_tree(doc_id, tree_json)
            storage.update_document_status(doc_id, "completed", nodes_count=nodes_count)
        except Exception as e:
            storage.update_document_status(doc_id, "failed", error_message=str(e))
            traceback.print_exc()
        finally:
            _indexing_tasks.pop(doc_id, None)

    t = threading.Thread(target=_build_index, daemon=True)
    _indexing_tasks[doc_id] = t
    t.start()

    return {"doc_id": doc_id, "status": "processing"}


@app.get("/index/{doc_id}/status")
def get_index_status(doc_id: str):
    doc = storage.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "status": doc["status"],
        "nodes_count": doc["nodes_count"],
        "error_message": doc["error_message"],
    }


@app.post("/search")
def search_documents(req: SearchRequest):
    from searcher import search
    results = search(storage, req.query, req.doc_ids, req.top_k)
    return {"results": results}


@app.get("/documents")
def list_documents(limit: int = 50, offset: int = 0):
    return storage.list_documents(limit, offset)


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str):
    if not storage.delete_document(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
    return {"success": True}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT)
```

**Step 4: Commit**

```bash
git add SKILLs/pageindex-rag/sidecar/
git commit -m "feat(rag): add FastAPI sidecar skeleton with storage layer"
```

---

## Task 2: FastAPI Sidecar — Indexer and Searcher

**Files:**
- Create: `SKILLs/pageindex-rag/sidecar/indexer.py`
- Create: `SKILLs/pageindex-rag/sidecar/searcher.py`

**Step 1: Create indexer.py**

```
SKILLs/pageindex-rag/sidecar/indexer.py
```
```python
"""
Build PageIndex tree from PDF or Markdown files.

PageIndex's open-source code runs as a CLI: `python3 run_pageindex.py --pdf_path ...`
We wrap it to call programmatically. If the pageindex package isn't available,
we fall back to a subprocess call.
"""
import os
import json
import subprocess
import tempfile
from typing import Optional


def build_tree(file_path: str, file_type: str = "pdf") -> dict:
    """Build a PageIndex tree for the given document.

    Returns a dict with 'nodes' list and 'metadata'.
    """
    # Try using pageindex Python API first
    try:
        return _build_tree_api(file_path, file_type)
    except ImportError:
        return _build_tree_cli(file_path, file_type)


def _build_tree_api(file_path: str, file_type: str) -> dict:
    """Use PageIndex Python API."""
    from pageindex import PageIndexClient

    api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("CHATGPT_API_KEY", "")
    model = os.environ.get("PAGEINDEX_MODEL", "gpt-4o-2024-11-20")

    client = PageIndexClient(api_key=api_key)
    result = client.submit_document(file_path)
    doc_id = result.get("doc_id")

    # Poll for completion
    import time
    for _ in range(600):  # up to 10 minutes
        status = client.get_document(doc_id)
        if status.get("status") == "completed":
            tree = client.get_tree(doc_id)
            return tree.get("result", {"nodes": [], "metadata": {}})
        elif status.get("status") == "failed":
            raise RuntimeError(f"PageIndex indexing failed: {status.get('error', 'unknown')}")
        time.sleep(1)

    raise TimeoutError("PageIndex indexing timed out after 10 minutes")


def _build_tree_cli(file_path: str, file_type: str) -> dict:
    """Fallback: call PageIndex CLI via subprocess."""
    pageindex_root = os.environ.get("PAGEINDEX_ROOT", "")
    if not pageindex_root:
        raise RuntimeError("PAGEINDEX_ROOT not set and pageindex package not installed")

    script = os.path.join(pageindex_root, "run_pageindex.py")
    arg_flag = "--pdf_path" if file_type == "pdf" else "--md_path"

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = os.path.join(tmpdir, "output.json")
        cmd = [
            "python3", script,
            arg_flag, file_path,
            "--output_path", output_path,
        ]

        model = os.environ.get("PAGEINDEX_MODEL")
        if model:
            cmd.extend(["--model", model])

        env = {**os.environ}
        api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("CHATGPT_API_KEY", "")
        if api_key:
            env["CHATGPT_API_KEY"] = api_key

        proc = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=600)
        if proc.returncode != 0:
            raise RuntimeError(f"PageIndex CLI failed: {proc.stderr}")

        if os.path.exists(output_path):
            with open(output_path, "r") as f:
                return json.load(f)

        raise RuntimeError("PageIndex CLI produced no output")
```

**Step 2: Create searcher.py**

```
SKILLs/pageindex-rag/sidecar/searcher.py
```
```python
"""
Search indexed documents using PageIndex tree structures.
Performs reasoning-based retrieval over the tree index.
"""
import json
from typing import Optional

from storage import RagStorage


def search(storage: RagStorage, query: str, doc_ids: Optional[list[str]] = None, top_k: int = 5) -> list[dict]:
    """Search across indexed documents.

    Returns list of results with doc_id, content, sections, etc.
    """
    results = []

    # Get documents to search
    if doc_ids:
        docs = [storage.get_document(did) for did in doc_ids]
        docs = [d for d in docs if d and d["status"] == "completed"]
    else:
        all_docs = storage.list_documents(limit=1000)
        docs = [d for d in all_docs["documents"] if d["status"] == "completed"]

    for doc in docs:
        tree_json = storage.get_tree(doc["id"])
        if not tree_json:
            continue

        tree = json.loads(tree_json)
        matched = _search_tree(tree, query, top_k)
        for m in matched:
            results.append({
                "doc_id": doc["id"],
                "doc_name": doc["name"],
                **m,
            })

    # Sort by relevance score and limit
    results.sort(key=lambda x: x.get("score", 0), reverse=True)
    return results[:top_k]


def _search_tree(tree: dict, query: str, top_k: int) -> list[dict]:
    """Search within a single document's tree.

    Uses simple keyword matching as a baseline.
    For full reasoning-based retrieval, integrate PageIndex's search API.
    """
    nodes = tree.get("nodes", [])
    query_lower = query.lower()
    scored = []

    for node in nodes:
        summary = node.get("summary", "")
        content = node.get("content", "")
        title = node.get("title", "")
        text = f"{title} {summary} {content}".lower()

        # Simple relevance scoring based on query term overlap
        query_terms = query_lower.split()
        hits = sum(1 for term in query_terms if term in text)
        if hits > 0:
            score = hits / len(query_terms) if query_terms else 0
            scored.append({
                "content": content or summary,
                "section": title,
                "pages": node.get("pages", []),
                "score": score,
            })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]
```

**Step 3: Commit**

```bash
git add SKILLs/pageindex-rag/sidecar/indexer.py SKILLs/pageindex-rag/sidecar/searcher.py
git commit -m "feat(rag): add indexer and searcher modules for sidecar"
```

---

## Task 3: Electron Main Process — Sidecar lifecycle management

**Files:**
- Create: `src/main/libs/pageindexSidecar.ts`

**Step 1: Create pageindexSidecar.ts**

Reference patterns from: `src/main/main.ts` (child process usage)

```
src/main/libs/pageindexSidecar.ts
```
```typescript
import { ChildProcess, spawn } from 'child_process';
import { app } from 'electron';
import path from 'path';
import net from 'net';

let sidecarProcess: ChildProcess | null = null;
let sidecarPort: number = 0;
let sidecarReady = false;
let restartCount = 0;
const MAX_RESTARTS = 3;

function getSkillsRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'SKILLs')
    : path.join(app.getAppPath(), 'SKILLs');
}

function getSidecarDir(): string {
  return path.join(getSkillsRoot(), 'pageindex-rag', 'sidecar');
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error('Failed to get port'));
      }
    });
    server.on('error', reject);
  });
}

async function waitForHealth(port: number, timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export async function startSidecar(dbPath: string, env?: Record<string, string>): Promise<void> {
  if (sidecarProcess) return;

  const port = await findFreePort();
  sidecarPort = port;
  sidecarReady = false;

  const sidecarDir = getSidecarDir();
  const appPy = path.join(sidecarDir, 'app.py');

  const childEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    RAG_DB_PATH: dbPath,
    RAG_PORT: String(port),
    ...env,
  };

  sidecarProcess = spawn('python3', [appPy], {
    cwd: sidecarDir,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  sidecarProcess.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
    // Keep only last 8KB
    if (stderr.length > 8192) stderr = stderr.slice(-8192);
  });

  sidecarProcess.on('exit', (code) => {
    console.log(`[RAG Sidecar] exited with code ${code}`);
    sidecarProcess = null;
    sidecarReady = false;

    if (code !== 0 && restartCount < MAX_RESTARTS) {
      restartCount++;
      console.log(`[RAG Sidecar] restarting (${restartCount}/${MAX_RESTARTS})...`);
      startSidecar(dbPath, env).catch(console.error);
    }
  });

  const healthy = await waitForHealth(port);
  if (healthy) {
    sidecarReady = true;
    restartCount = 0;
    console.log(`[RAG Sidecar] ready on port ${port}`);
  } else {
    console.error(`[RAG Sidecar] failed to start. stderr: ${stderr}`);
    stopSidecar();
  }
}

export function stopSidecar(): void {
  if (sidecarProcess) {
    sidecarProcess.kill('SIGTERM');
    sidecarProcess = null;
  }
  sidecarReady = false;
  sidecarPort = 0;
}

export function getSidecarStatus(): { running: boolean; port: number } {
  return { running: sidecarReady, port: sidecarPort };
}

export function getSidecarBaseUrl(): string | null {
  if (!sidecarReady || !sidecarPort) return null;
  return `http://127.0.0.1:${sidecarPort}`;
}
```

**Step 2: Commit**

```bash
git add src/main/libs/pageindexSidecar.ts
git commit -m "feat(rag): add sidecar lifecycle management for PageIndex"
```

---

## Task 4: Electron Main Process — RAG IPC handlers

**Files:**
- Create: `src/main/libs/ragService.ts`
- Modify: `src/main/main.ts` — register IPC handlers and start sidecar
- Modify: `src/main/preload.ts` — expose `rag` namespace

**Step 1: Create ragService.ts**

```
src/main/libs/ragService.ts
```
```typescript
import { getSidecarBaseUrl } from './pageindexSidecar';

async function sidecarFetch(path: string, options?: RequestInit): Promise<any> {
  const base = getSidecarBaseUrl();
  if (!base) throw new Error('RAG sidecar is not running');
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sidecar error ${res.status}: ${body}`);
  }
  return res.json();
}

export async function uploadDocument(filePath: string, type: string): Promise<any> {
  return sidecarFetch('/index', {
    method: 'POST',
    body: JSON.stringify({ path: filePath, type }),
  });
}

export async function listDocuments(limit = 50, offset = 0): Promise<any> {
  return sidecarFetch(`/documents?limit=${limit}&offset=${offset}`);
}

export async function deleteDocument(docId: string): Promise<any> {
  return sidecarFetch(`/documents/${docId}`, { method: 'DELETE' });
}

export async function getDocumentStatus(docId: string): Promise<any> {
  return sidecarFetch(`/index/${docId}/status`);
}

export async function searchDocuments(query: string, docIds?: string[]): Promise<any> {
  return sidecarFetch('/search', {
    method: 'POST',
    body: JSON.stringify({ query, doc_ids: docIds }),
  });
}
```

**Step 2: Register IPC handlers in main.ts**

Modify: `src/main/main.ts`

Find the area after existing IPC handlers (after skills handlers). Add:

```typescript
// --- RAG Knowledge Base IPC handlers ---
import { startSidecar, stopSidecar, getSidecarStatus } from './libs/pageindexSidecar';
import * as ragService from './libs/ragService';

ipcMain.handle('rag:uploadDocument', async (_event, { filePath, type }) => {
  return ragService.uploadDocument(filePath, type);
});

ipcMain.handle('rag:listDocuments', async (_event, { limit, offset } = {}) => {
  return ragService.listDocuments(limit, offset);
});

ipcMain.handle('rag:deleteDocument', async (_event, { docId }) => {
  return ragService.deleteDocument(docId);
});

ipcMain.handle('rag:getDocumentStatus', async (_event, { docId }) => {
  return ragService.getDocumentStatus(docId);
});

ipcMain.handle('rag:searchDocuments', async (_event, { query, docIds }) => {
  return ragService.searchDocuments(query, docIds);
});

ipcMain.handle('rag:getSidecarStatus', async () => {
  return getSidecarStatus();
});
```

Also add sidecar startup in the `app.whenReady()` block (find where other services are initialized):

```typescript
// Start RAG sidecar
const ragDbPath = path.join(app.getPath('userData'), DB_FILENAME);
const ragEnv: Record<string, string> = {};
// Pass LLM API keys from app config
const apiKey = store.get('apiKey');
if (apiKey) ragEnv['OPENAI_API_KEY'] = apiKey as string;
startSidecar(ragDbPath, ragEnv).catch(console.error);
```

Add sidecar shutdown in the `app.on('before-quit')` handler:

```typescript
stopSidecar();
```

**Step 3: Extend preload.ts**

Modify: `src/main/preload.ts` (after line 28, after the `skills` namespace)

Add the `rag` namespace:

```typescript
  rag: {
    uploadDocument: (filePath: string, type: string) =>
      ipcRenderer.invoke('rag:uploadDocument', { filePath, type }),
    listDocuments: (limit?: number, offset?: number) =>
      ipcRenderer.invoke('rag:listDocuments', { limit, offset }),
    deleteDocument: (docId: string) =>
      ipcRenderer.invoke('rag:deleteDocument', { docId }),
    getDocumentStatus: (docId: string) =>
      ipcRenderer.invoke('rag:getDocumentStatus', { docId }),
    searchDocuments: (query: string, docIds?: string[]) =>
      ipcRenderer.invoke('rag:searchDocuments', { query, docIds }),
    getSidecarStatus: () =>
      ipcRenderer.invoke('rag:getSidecarStatus'),
  },
```

**Step 4: Commit**

```bash
git add src/main/libs/ragService.ts src/main/main.ts src/main/preload.ts
git commit -m "feat(rag): add IPC handlers and preload API for RAG sidecar"
```

---

## Task 5: SQLite table creation in sqliteStore.ts

**Files:**
- Modify: `src/main/sqliteStore.ts:214` — add rag tables after scheduled_task_runs

**Step 1: Add tables in initializeTables()**

Find the end of `CREATE TABLE IF NOT EXISTS scheduled_task_runs` block (around line 213) and add:

```typescript
    // Create RAG knowledge base tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS rag_documents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        nodes_count INTEGER DEFAULT 0,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS rag_trees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
        tree_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_rag_trees_doc_id ON rag_trees(doc_id);
    `);
```

**Step 2: Commit**

```bash
git add src/main/sqliteStore.ts
git commit -m "feat(rag): add rag_documents and rag_trees tables to SQLite"
```

---

## Task 6: Redux slice — ragSlice.ts

**Files:**
- Create: `src/renderer/store/slices/ragSlice.ts`
- Modify: `src/renderer/store/index.ts` — register the slice

**Step 1: Create ragSlice.ts**

Reference pattern: `src/renderer/store/slices/skillSlice.ts`

```
src/renderer/store/slices/ragSlice.ts
```
```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface RagDocument {
  id: string;
  name: string;
  file_path: string;
  type: 'pdf' | 'md';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  nodes_count: number;
  error_message?: string;
  created_at: number;
  updated_at: number;
}

interface RagState {
  documents: RagDocument[];
  sidecarStatus: 'starting' | 'running' | 'stopped' | 'error';
  uploading: boolean;
  loading: boolean;
}

const initialState: RagState = {
  documents: [],
  sidecarStatus: 'stopped',
  uploading: false,
  loading: false,
};

const ragSlice = createSlice({
  name: 'rag',
  initialState,
  reducers: {
    setDocuments: (state, action: PayloadAction<RagDocument[]>) => {
      state.documents = action.payload;
    },
    addDocument: (state, action: PayloadAction<RagDocument>) => {
      state.documents.unshift(action.payload);
    },
    updateDocumentStatus: (state, action: PayloadAction<{ id: string; status: RagDocument['status']; nodes_count?: number; error_message?: string }>) => {
      const doc = state.documents.find(d => d.id === action.payload.id);
      if (doc) {
        doc.status = action.payload.status;
        if (action.payload.nodes_count !== undefined) doc.nodes_count = action.payload.nodes_count;
        if (action.payload.error_message !== undefined) doc.error_message = action.payload.error_message;
      }
    },
    removeDocument: (state, action: PayloadAction<string>) => {
      state.documents = state.documents.filter(d => d.id !== action.payload);
    },
    setSidecarStatus: (state, action: PayloadAction<RagState['sidecarStatus']>) => {
      state.sidecarStatus = action.payload;
    },
    setUploading: (state, action: PayloadAction<boolean>) => {
      state.uploading = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const {
  setDocuments,
  addDocument,
  updateDocumentStatus,
  removeDocument,
  setSidecarStatus,
  setUploading,
  setLoading,
} = ragSlice.actions;

export default ragSlice.reducer;
```

**Step 2: Register in store/index.ts**

Modify: `src/renderer/store/index.ts`

Add import at line 7:
```typescript
import ragReducer from './slices/ragSlice';
```

Add to reducer object at line 16:
```typescript
    rag: ragReducer,
```

**Step 3: Commit**

```bash
git add src/renderer/store/slices/ragSlice.ts src/renderer/store/index.ts
git commit -m "feat(rag): add ragSlice to Redux store"
```

---

## Task 7: Renderer service — knowledgeBase.ts

**Files:**
- Create: `src/renderer/services/knowledgeBase.ts`

**Step 1: Create knowledgeBase.ts**

Reference pattern: `src/renderer/services/cowork.ts`

```
src/renderer/services/knowledgeBase.ts
```
```typescript
import { store } from '../store';
import {
  setDocuments,
  addDocument,
  updateDocumentStatus,
  removeDocument,
  setSidecarStatus,
  setUploading,
  setLoading,
} from '../store/slices/ragSlice';
import type { RagDocument } from '../store/slices/ragSlice';

class KnowledgeBaseService {
  private pollingTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  async loadDocuments(): Promise<void> {
    store.dispatch(setLoading(true));
    try {
      const result = await window.electron?.rag?.listDocuments();
      if (result?.documents) {
        store.dispatch(setDocuments(result.documents));
        // Start polling for any processing documents
        for (const doc of result.documents) {
          if (doc.status === 'pending' || doc.status === 'processing') {
            this.startPollingStatus(doc.id);
          }
        }
      }
    } finally {
      store.dispatch(setLoading(false));
    }
  }

  async checkSidecarStatus(): Promise<void> {
    try {
      const status = await window.electron?.rag?.getSidecarStatus();
      store.dispatch(setSidecarStatus(status?.running ? 'running' : 'stopped'));
    } catch {
      store.dispatch(setSidecarStatus('error'));
    }
  }

  async uploadDocument(filePath: string): Promise<void> {
    store.dispatch(setUploading(true));
    try {
      const ext = filePath.split('.').pop()?.toLowerCase();
      const type = ext === 'md' ? 'md' : 'pdf';
      const result = await window.electron?.rag?.uploadDocument(filePath, type);
      if (result?.doc_id) {
        const doc: RagDocument = {
          id: result.doc_id,
          name: filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown',
          file_path: filePath,
          type,
          status: 'processing',
          nodes_count: 0,
          created_at: Date.now(),
          updated_at: Date.now(),
        };
        store.dispatch(addDocument(doc));
        this.startPollingStatus(result.doc_id);
      }
    } finally {
      store.dispatch(setUploading(false));
    }
  }

  async deleteDocument(docId: string): Promise<void> {
    await window.electron?.rag?.deleteDocument(docId);
    this.stopPollingStatus(docId);
    store.dispatch(removeDocument(docId));
  }

  private startPollingStatus(docId: string): void {
    if (this.pollingTimers.has(docId)) return;
    const timer = setInterval(async () => {
      try {
        const status = await window.electron?.rag?.getDocumentStatus(docId);
        if (status) {
          store.dispatch(updateDocumentStatus({
            id: docId,
            status: status.status,
            nodes_count: status.nodes_count,
            error_message: status.error_message,
          }));
          if (status.status === 'completed' || status.status === 'failed') {
            this.stopPollingStatus(docId);
          }
        }
      } catch {
        this.stopPollingStatus(docId);
      }
    }, 2000);
    this.pollingTimers.set(docId, timer);
  }

  private stopPollingStatus(docId: string): void {
    const timer = this.pollingTimers.get(docId);
    if (timer) {
      clearInterval(timer);
      this.pollingTimers.delete(docId);
    }
  }

  cleanup(): void {
    for (const timer of this.pollingTimers.values()) {
      clearInterval(timer);
    }
    this.pollingTimers.clear();
  }
}

export const knowledgeBaseService = new KnowledgeBaseService();
```

**Step 2: Commit**

```bash
git add src/renderer/services/knowledgeBase.ts
git commit -m "feat(rag): add knowledgeBase renderer service"
```

---

## Task 8: i18n translation keys

**Files:**
- Modify: `src/renderer/services/i18n.ts`

**Step 1: Add Chinese keys**

Find `skills: '技能',` (line 403 area in zh section) and add nearby:

```typescript
    knowledgeBase: '知识库',
    knowledgeBaseTitle: '知识库管理',
    knowledgeBaseUpload: '上传文档',
    knowledgeBaseUploadHint: '拖拽文件到此处，或点击选择文件',
    knowledgeBaseUploadFormats: '支持 PDF、Markdown 格式',
    knowledgeBaseDocList: '文档列表',
    knowledgeBaseDocCount: '共 {count} 个文档',
    knowledgeBaseEmpty: '暂无文档，上传文件开始构建知识库',
    knowledgeBaseStatusPending: '等待中',
    knowledgeBaseStatusProcessing: '索引中...',
    knowledgeBaseStatusCompleted: '已完成',
    knowledgeBaseStatusFailed: '失败',
    knowledgeBaseDelete: '删除文档',
    knowledgeBaseDeleteConfirm: '确定要删除这个文档吗？索引数据也会一并删除。',
    knowledgeBaseSidecarRunning: '服务运行中',
    knowledgeBaseSidecarStopped: '服务未启动',
    knowledgeBaseSidecarError: '服务异常',
    knowledgeBaseSidecarStarting: '服务启动中...',
    knowledgeBaseView: '查看',
    knowledgeBaseNodes: '{count} 个节点',
```

**Step 2: Add English keys**

Find `skills: 'Skills',` (line 1056 area in en section) and add nearby:

```typescript
    knowledgeBase: 'Knowledge Base',
    knowledgeBaseTitle: 'Knowledge Base',
    knowledgeBaseUpload: 'Upload Document',
    knowledgeBaseUploadHint: 'Drag files here or click to select',
    knowledgeBaseUploadFormats: 'Supports PDF and Markdown',
    knowledgeBaseDocList: 'Documents',
    knowledgeBaseDocCount: '{count} documents',
    knowledgeBaseEmpty: 'No documents yet. Upload files to build your knowledge base.',
    knowledgeBaseStatusPending: 'Pending',
    knowledgeBaseStatusProcessing: 'Indexing...',
    knowledgeBaseStatusCompleted: 'Completed',
    knowledgeBaseStatusFailed: 'Failed',
    knowledgeBaseDelete: 'Delete Document',
    knowledgeBaseDeleteConfirm: 'Are you sure you want to delete this document? Index data will also be removed.',
    knowledgeBaseSidecarRunning: 'Service running',
    knowledgeBaseSidecarStopped: 'Service not running',
    knowledgeBaseSidecarError: 'Service error',
    knowledgeBaseSidecarStarting: 'Service starting...',
    knowledgeBaseView: 'View',
    knowledgeBaseNodes: '{count} nodes',
```

**Step 3: Commit**

```bash
git add src/renderer/services/i18n.ts
git commit -m "feat(rag): add i18n translation keys for knowledge base"
```

---

## Task 9: UI — KnowledgeBaseView page

**Files:**
- Create: `src/renderer/components/knowledgeBase/KnowledgeBaseView.tsx`
- Create: `src/renderer/components/knowledgeBase/index.ts`

**Step 1: Create KnowledgeBaseView.tsx**

Reference pattern: `src/renderer/components/skills/SkillsView.tsx` (lines 1-56)

```
src/renderer/components/knowledgeBase/KnowledgeBaseView.tsx
```
```tsx
import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { i18nService } from '../../services/i18n';
import { knowledgeBaseService } from '../../services/knowledgeBase';
import KnowledgeBaseUpload from './KnowledgeBaseUpload';
import KnowledgeBaseDocList from './KnowledgeBaseDocList';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import ComposeIcon from '../icons/ComposeIcon';
import WindowTitleBar from '../window/WindowTitleBar';

interface KnowledgeBaseViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  onBack?: () => void;
  updateBadge?: React.ReactNode;
}

const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  onBack,
  updateBadge,
}) => {
  const isMac = window.electron.platform === 'darwin';
  const { documents, sidecarStatus, loading } = useSelector((state: RootState) => state.rag);

  useEffect(() => {
    knowledgeBaseService.checkSidecarStatus();
    knowledgeBaseService.loadDocuments();
    return () => knowledgeBaseService.cleanup();
  }, []);

  const sidecarStatusText = {
    starting: i18nService.t('knowledgeBaseSidecarStarting'),
    running: i18nService.t('knowledgeBaseSidecarRunning'),
    stopped: i18nService.t('knowledgeBaseSidecarStopped'),
    error: i18nService.t('knowledgeBaseSidecarError'),
  }[sidecarStatus];

  const sidecarDotColor = {
    starting: 'bg-yellow-400',
    running: 'bg-green-400',
    stopped: 'bg-gray-400',
    error: 'bg-red-400',
  }[sidecarStatus];

  return (
    <div className="flex-1 flex flex-col dark:bg-claude-darkBg bg-claude-bg h-full">
      {/* Header */}
      <div className="draggable flex h-12 items-center justify-between px-4 border-b dark:border-claude-darkBorder border-claude-border shrink-0">
        <div className="flex items-center space-x-3 h-8">
          {isSidebarCollapsed && (
            <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
              <button
                type="button"
                onClick={onToggleSidebar}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
              </button>
              <button
                type="button"
                onClick={onNewChat}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
              >
                <ComposeIcon className="h-4 w-4" />
              </button>
              {updateBadge}
            </div>
          )}
          <h1 className="text-lg font-semibold dark:text-claude-darkText text-claude-text">
            {i18nService.t('knowledgeBaseTitle')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${sidecarDotColor}`} />
          <span className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {sidecarStatusText}
          </span>
          <WindowTitleBar inline />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          <KnowledgeBaseUpload
            onUpload={(filePath) => knowledgeBaseService.uploadDocument(filePath)}
            disabled={sidecarStatus !== 'running'}
          />
          <KnowledgeBaseDocList
            documents={documents}
            loading={loading}
            onDelete={(docId) => knowledgeBaseService.deleteDocument(docId)}
          />
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBaseView;
```

**Step 2: Create index.ts**

```
src/renderer/components/knowledgeBase/index.ts
```
```typescript
export { default as KnowledgeBaseView } from './KnowledgeBaseView';
```

**Step 3: Commit**

```bash
git add src/renderer/components/knowledgeBase/
git commit -m "feat(rag): add KnowledgeBaseView page component"
```

---

## Task 10: UI — Upload and DocList components

**Files:**
- Create: `src/renderer/components/knowledgeBase/KnowledgeBaseUpload.tsx`
- Create: `src/renderer/components/knowledgeBase/KnowledgeBaseDocList.tsx`

**Step 1: Create KnowledgeBaseUpload.tsx**

```
src/renderer/components/knowledgeBase/KnowledgeBaseUpload.tsx
```
```tsx
import React, { useCallback, useRef, useState } from 'react';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { i18nService } from '../../services/i18n';

interface KnowledgeBaseUploadProps {
  onUpload: (filePath: string) => void;
  disabled?: boolean;
}

const KnowledgeBaseUpload: React.FC<KnowledgeBaseUploadProps> = ({ onUpload, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'pdf' || ext === 'md') {
        onUpload((file as any).path || file.name);
      }
    }
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled) handleFiles(e.dataTransfer.files);
  }, [disabled, handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!disabled) fileInputRef.current?.click();
  }, [disabled]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      className={`
        border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
        ${isDragging
          ? 'border-claude-accent bg-claude-accent/5'
          : 'dark:border-claude-darkBorder border-claude-border hover:border-claude-accent/50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <ArrowUpTrayIcon className="h-8 w-8 mx-auto mb-3 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
      <p className="text-sm font-medium dark:text-claude-darkText text-claude-text">
        {i18nService.t('knowledgeBaseUploadHint')}
      </p>
      <p className="text-xs mt-1 dark:text-claude-darkTextSecondary text-claude-textSecondary">
        {i18nService.t('knowledgeBaseUploadFormats')}
      </p>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.md"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
};

export default KnowledgeBaseUpload;
```

**Step 2: Create KnowledgeBaseDocList.tsx**

```
src/renderer/components/knowledgeBase/KnowledgeBaseDocList.tsx
```
```tsx
import React, { useState } from 'react';
import { TrashIcon, DocumentTextIcon, DocumentIcon } from '@heroicons/react/24/outline';
import { i18nService } from '../../services/i18n';
import type { RagDocument } from '../../store/slices/ragSlice';

interface KnowledgeBaseDocListProps {
  documents: RagDocument[];
  loading: boolean;
  onDelete: (docId: string) => void;
}

const statusColors: Record<string, string> = {
  pending: 'text-yellow-500',
  processing: 'text-blue-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
};

const statusKeys: Record<string, string> = {
  pending: 'knowledgeBaseStatusPending',
  processing: 'knowledgeBaseStatusProcessing',
  completed: 'knowledgeBaseStatusCompleted',
  failed: 'knowledgeBaseStatusFailed',
};

const KnowledgeBaseDocList: React.FC<KnowledgeBaseDocListProps> = ({ documents, loading, onDelete }) => {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="text-center py-8 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
        Loading...
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-8 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
        {i18nService.t('knowledgeBaseEmpty')}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium dark:text-claude-darkText text-claude-text">
          {i18nService.t('knowledgeBaseDocList')}
        </h2>
        <span className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
          {i18nService.t('knowledgeBaseDocCount').replace('{count}', String(documents.length))}
        </span>
      </div>
      <div className="space-y-2">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between px-4 py-3 rounded-lg dark:bg-claude-darkSurface bg-claude-surface border dark:border-claude-darkBorder border-claude-border"
          >
            <div className="flex items-center gap-3 min-w-0">
              {doc.type === 'pdf' ? (
                <DocumentIcon className="h-5 w-5 shrink-0 text-red-400" />
              ) : (
                <DocumentTextIcon className="h-5 w-5 shrink-0 text-blue-400" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium dark:text-claude-darkText text-claude-text truncate">
                  {doc.name}
                </p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${statusColors[doc.status] || ''}`}>
                    {i18nService.t(statusKeys[doc.status] || '')}
                  </span>
                  {doc.status === 'completed' && doc.nodes_count > 0 && (
                    <span className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      {i18nService.t('knowledgeBaseNodes').replace('{count}', String(doc.nodes_count))}
                    </span>
                  )}
                  {doc.status === 'failed' && doc.error_message && (
                    <span className="text-xs text-red-400 truncate max-w-[200px]" title={doc.error_message}>
                      {doc.error_message}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {confirmingId === doc.id ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { onDelete(doc.id); setConfirmingId(null); }}
                    className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                  >
                    {i18nService.t('knowledgeBaseDelete')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    className="text-xs px-2 py-1 rounded dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                  >
                    {i18nService.t('cancel')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingId(doc.id)}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-red-500 hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KnowledgeBaseDocList;
```

**Step 3: Commit**

```bash
git add src/renderer/components/knowledgeBase/KnowledgeBaseUpload.tsx src/renderer/components/knowledgeBase/KnowledgeBaseDocList.tsx
git commit -m "feat(rag): add Upload and DocList UI components"
```

---

## Task 11: Wire up Sidebar button + App.tsx routing

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx:15,16-18,25-35,129-143`
- Modify: `src/renderer/App.tsx:9-10,33,185-195,562-599`

**Step 1: Modify Sidebar.tsx**

Add `BookOpenIcon` import at line 8:
```typescript
import { MagnifyingGlassIcon, PuzzlePieceIcon, ClockIcon, BookOpenIcon } from '@heroicons/react/24/outline';
```

Update `activeView` type at line 15:
```typescript
  activeView: 'cowork' | 'skills' | 'scheduledTasks' | 'knowledgeBase';
```

Add `onShowKnowledgeBase` prop at line 18 (after `onShowScheduledTasks`):
```typescript
  onShowKnowledgeBase: () => void;
```

Add destructuring at line 30 (after `onShowScheduledTasks`):
```typescript
  onShowKnowledgeBase,
```

Add knowledge base button after the skills button (after line 143, before the closing `</div>` at line 144):
```tsx
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen(false);
              onShowKnowledgeBase();
            }}
            className={`w-full inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
              activeView === 'knowledgeBase'
                ? 'dark:text-claude-darkText text-claude-text dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover'
                : 'dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-claude-text dark:hover:text-claude-darkText hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover'
            }`}
          >
            <BookOpenIcon className="h-4 w-4" />
            {i18nService.t('knowledgeBase')}
          </button>
```

**Step 2: Modify App.tsx**

Add import at line 10 (after ScheduledTasksView import):
```typescript
import { KnowledgeBaseView } from './components/knowledgeBase';
```

Update mainView state type at line 33:
```typescript
const [mainView, setMainView] = useState<'cowork' | 'skills' | 'scheduledTasks' | 'knowledgeBase'>('cowork');
```

Add handler after line 195 (after `handleShowScheduledTasks`):
```typescript
  const handleShowKnowledgeBase = useCallback(() => {
    setMainView('knowledgeBase');
  }, []);
```

Add prop to Sidebar at line 569 (after `onShowScheduledTasks`):
```typescript
          onShowKnowledgeBase={handleShowKnowledgeBase}
```

Add KnowledgeBaseView rendering. Change the conditional at line 583-599 to include the new view. After the `scheduledTasks` ternary and before the final `: (` for CoworkView:
```tsx
            ) : mainView === 'knowledgeBase' ? (
              <KnowledgeBaseView
                isSidebarCollapsed={isSidebarCollapsed}
                onToggleSidebar={handleToggleSidebar}
                onNewChat={handleNewChat}
                onBack={handleShowCowork}
                updateBadge={isSidebarCollapsed ? updateBadge : null}
              />
```

**Step 3: Commit**

```bash
git add src/renderer/components/Sidebar.tsx src/renderer/App.tsx
git commit -m "feat(rag): wire up knowledge base button in sidebar and App routing"
```

---

## Task 12: Skill definition — SKILL.md + scripts + config

**Files:**
- Create: `SKILLs/pageindex-rag/SKILL.md`
- Create: `SKILLs/pageindex-rag/scripts/search.sh`
- Create: `SKILLs/pageindex-rag/scripts/index.sh`
- Create: `SKILLs/pageindex-rag/scripts/list-docs.sh`
- Create: `SKILLs/pageindex-rag/scripts/delete-doc.sh`
- Modify: `SKILLs/skills.config.json`

**Step 1: Create SKILL.md**

```
SKILLs/pageindex-rag/SKILL.md
```
````markdown
---
name: pageindex-rag
description: "基于 PageIndex 的本地知识库 RAG 检索，支持 PDF 和 Markdown 文档的推理式检索"
official: true
version: 1.0.0
metadata:
  clawdbot:
    emoji: "📚"
    requires:
      bins: [curl]
---

# PageIndex RAG 知识库检索

本地知识库检索技能，基于 PageIndex 的树状索引和推理式检索。用户通过 LobsterAI 知识库管理界面上传和索引文档后，你可以使用本技能在知识库中检索相关内容来回答问题。

## 何时使用

- 用户提问涉及已上传到知识库的文档内容
- 用户要求你根据特定文档回答问题
- 用户要求你搜索知识库中的信息
- 用户要求索引新文档或管理知识库

## 可用工具

### 1. 搜索文档 (search_documents)

在知识库中检索相关内容：

```bash
curl -s http://127.0.0.1:${RAG_PORT}/search \
  -H "Content-Type: application/json" \
  -d '{"query": "你的搜索问题", "top_k": 5}'
```

或指定文档搜索：

```bash
curl -s http://127.0.0.1:${RAG_PORT}/search \
  -H "Content-Type: application/json" \
  -d '{"query": "搜索问题", "doc_ids": ["doc-id-1", "doc-id-2"]}'
```

### 2. 列出文档 (list_documents)

查看知识库中所有文档：

```bash
curl -s "http://127.0.0.1:${RAG_PORT}/documents?limit=50&offset=0"
```

### 3. 索引文档 (index_document)

为新文档建立索引：

```bash
curl -s http://127.0.0.1:${RAG_PORT}/index \
  -H "Content-Type: application/json" \
  -d '{"path": "/absolute/path/to/document.pdf", "type": "pdf"}'
```

支持 `type`: `pdf` 或 `md`。

### 4. 删除文档 (delete_document)

删除文档及其索引：

```bash
curl -s -X DELETE "http://127.0.0.1:${RAG_PORT}/documents/{doc_id}"
```

## 使用模式

### 模式 1：基于知识库回答问题

1. 先用 `list_documents` 查看可用文档
2. 用 `search_documents` 搜索相关内容
3. 基于检索结果回答用户问题，引用来源

### 模式 2：用户要求索引新文档

1. 用 `index_document` 提交文档
2. 返回 doc_id 和处理状态
3. 告知用户索引正在进行中

## 注意事项

- `RAG_PORT` 环境变量由 LobsterAI 自动设置
- 搜索返回的 `content` 字段包含相关文档片段
- 索引是异步的，大文档可能需要几分钟
- 仅搜索状态为 `completed` 的文档
````

**Step 2: Create shell scripts**

```
SKILLs/pageindex-rag/scripts/search.sh
```
```bash
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
```

```
SKILLs/pageindex-rag/scripts/index.sh
```
```bash
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
```

```
SKILLs/pageindex-rag/scripts/list-docs.sh
```
```bash
#!/bin/bash
# Usage: list-docs.sh [limit] [offset]
LIMIT="${1:-50}"
OFFSET="${2:-0}"

if [ -z "$RAG_PORT" ]; then
  echo "Error: RAG_PORT not set"
  exit 1
fi

curl -s "http://127.0.0.1:${RAG_PORT}/documents?limit=${LIMIT}&offset=${OFFSET}"
```

```
SKILLs/pageindex-rag/scripts/delete-doc.sh
```
```bash
#!/bin/bash
# Usage: delete-doc.sh <doc_id>
DOC_ID="$1"

if [ -z "$RAG_PORT" ]; then
  echo "Error: RAG_PORT not set"
  exit 1
fi

curl -s -X DELETE "http://127.0.0.1:${RAG_PORT}/documents/${DOC_ID}"
```

**Step 3: Update skills.config.json**

Modify: `SKILLs/skills.config.json`

Add to the `defaults` object:
```json
    "pageindex-rag": { "order": 35, "enabled": true },
```

**Step 4: Make scripts executable and commit**

```bash
chmod +x SKILLs/pageindex-rag/scripts/*.sh
git add SKILLs/pageindex-rag/ SKILLs/skills.config.json
git commit -m "feat(rag): add pageindex-rag skill with SKILL.md, scripts, and config"
```

---

## Task 13: Pass RAG_PORT to Cowork environment

**Files:**
- Modify: `src/main/libs/coworkRunner.ts` — add RAG_PORT to the environment passed to Claude Agent SDK

**Step 1: Find where environment variables are set for cowork sessions**

In `coworkRunner.ts`, find where `enhancedEnv` or similar environment object is built (where `SKILLS_ROOT` is set). Add `RAG_PORT` from the sidecar.

```typescript
import { getSidecarStatus } from './pageindexSidecar';

// In the env building section:
const ragStatus = getSidecarStatus();
if (ragStatus.running) {
  enhancedEnv['RAG_PORT'] = String(ragStatus.port);
}
```

**Step 2: Commit**

```bash
git add src/main/libs/coworkRunner.ts
git commit -m "feat(rag): pass RAG_PORT to cowork session environment"
```

---

## Task 14: Integration testing

**Step 1: Install Python dependencies**

```bash
cd SKILLs/pageindex-rag/sidecar && pip3 install -r requirements.txt
```

**Step 2: Test sidecar standalone**

```bash
cd SKILLs/pageindex-rag/sidecar
RAG_DB_PATH=/tmp/test_rag.sqlite RAG_PORT=9876 python3 app.py &
sleep 2
# Health check
curl http://127.0.0.1:9876/health
# List (empty)
curl http://127.0.0.1:9876/documents
# Kill
kill %1
```

**Step 3: Test in Electron**

```bash
npm run electron:dev
```

Manual testing checklist:
- [ ] Sidebar shows "知识库" button below "技能"
- [ ] Clicking it navigates to KnowledgeBaseView
- [ ] Service status indicator shows correctly
- [ ] Upload a PDF file → appears in list with "索引中..." status
- [ ] Document completes indexing → status shows "已完成"
- [ ] Delete a document → removed from list
- [ ] In Cowork session, Claude can call `search_documents` via the skill

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(rag): PageIndex RAG knowledge base plugin - complete integration"
```
