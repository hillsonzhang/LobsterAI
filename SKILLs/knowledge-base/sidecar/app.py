import os
import asyncio
import shutil
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
import uvicorn

from storage import RagStorage

DB_PATH = os.environ.get("RAG_DB_PATH", "rag.sqlite")
PORT = int(os.environ.get("RAG_PORT", "0"))
WORKING_DIR = os.environ.get("RAG_WORKING_DIR", "./rag_data")

# Online embedding config from environment
EMBED_API_BASE = os.environ.get("EMBED_API_BASE", "")
EMBED_API_KEY = os.environ.get("EMBED_API_KEY", "")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "text-embedding-3-small")
EMBED_DIM = int(os.environ.get("EMBED_DIM", "1536"))

# LLM config (for LightRAG indexing + deep search)
LLM_API_BASE = os.environ.get("LLM_API_BASE", "")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "")
ENABLE_LLM_CACHE = os.environ.get("ENABLE_LLM_CACHE_FOR_EXTRACT", "true")

# Reranker (optional)
RERANK_ENABLED = os.environ.get("RERANK_ENABLED", "false").lower() == "true"
RERANK_API_KEY = os.environ.get("RERANK_API_KEY", "")
RERANK_MODEL = os.environ.get("RERANK_MODEL", "")
RERANK_API_BASE = os.environ.get("RERANK_API_BASE", "")

storage = RagStorage(DB_PATH)
rag = None  # LightRAG instance, initialized in lifespan
_rebuild_lock = asyncio.Lock()


# --- LightRAG setup ---

async def _llm_func(prompt, system_prompt=None, history_messages=[], **kwargs):
    from lightrag.llm.openai import openai_complete_if_cache
    return await openai_complete_if_cache(
        LLM_MODEL, prompt,
        system_prompt=system_prompt,
        history_messages=history_messages,
        api_key=LLM_API_KEY,
        base_url=LLM_API_BASE or None,
        **kwargs
    )


async def _embed_func(texts: list[str]):
    import numpy as np
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=EMBED_API_KEY, base_url=EMBED_API_BASE or None)
    resp = await client.embeddings.create(input=texts, model=EMBED_MODEL)
    return np.array([d.embedding for d in resp.data], dtype=np.float32)


def _create_lightrag():
    from lightrag import LightRAG
    from lightrag.utils import EmbeddingFunc

    lightrag_dir = os.path.join(WORKING_DIR, "lightrag")
    os.makedirs(lightrag_dir, exist_ok=True)

    instance = LightRAG(
        working_dir=lightrag_dir,
        llm_model_func=_llm_func,
        embedding_func=EmbeddingFunc(
            embedding_dim=EMBED_DIM,
            max_token_size=8192,
            func=_embed_func,
        ),
        vector_storage="FaissVectorDBStorage",
        enable_llm_cache_for_entity_extract=(ENABLE_LLM_CACHE == "true"),
        chunk_token_size=500,
        chunk_overlap_token_size=100,
        embedding_batch_num=32,
        llm_model_max_async=4,
        embedding_func_max_async=16,
    )
    return instance


# --- App lifecycle ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    global rag
    os.makedirs(WORKING_DIR, exist_ok=True)

    # Migrate from old vector store
    old_files = ["chunks.json", "matrix.npy"]
    needs_reindex = False
    for f in old_files:
        p = os.path.join(WORKING_DIR, f)
        if os.path.exists(p):
            os.remove(p)
            print(f"[RAG] Removed old vector store file: {f}")
            needs_reindex = True
    if needs_reindex:
        storage.reset_all_document_status()
        print("[RAG] Reset all document status for re-indexing")

    # Initialize LightRAG if both Embedding and LLM are configured
    if EMBED_API_KEY and LLM_API_KEY and LLM_MODEL:
        try:
            rag = _create_lightrag()
            await rag.initialize_storages()
            print(f"[RAG] LightRAG ready: llm={LLM_MODEL}, embed={EMBED_MODEL}, dim={EMBED_DIM}")

            # Reranker config
            if RERANK_ENABLED and RERANK_API_KEY:
                rag.enable_rerank = True
                print(f"[RAG] Reranker enabled: model={RERANK_MODEL}")

            # Auto re-index if migrated from old vector store
            if needs_reindex:
                remaining = storage.list_documents(limit=9999)
                docs = remaining.get("documents", [])
                if docs:
                    print(f"[RAG] Auto re-indexing {len(docs)} documents (migration)...")
                    asyncio.create_task(_rebuild_all(docs))
        except Exception as e:
            print(f"[RAG] LightRAG initialization failed: {e}")
            traceback.print_exc()
            rag = None
    elif EMBED_API_KEY:
        print("[RAG] Embedding configured but LLM not configured — LightRAG disabled")
    else:
        print("[RAG] No EMBED_API_KEY — LightRAG disabled")

    yield


app = FastAPI(title="RAG Sidecar", lifespan=lifespan)


# --- Models ---

class IndexRequest(BaseModel):
    path: str
    type: str = "pdf"

class SearchRequest(BaseModel):
    query: str
    doc_ids: Optional[list[str]] = None
    top_k: int = 5
    mode: str = "fast"  # "fast" | "deep"


# --- Text extraction ---

def _extract_text(file_path: str, file_type: str) -> str:
    if file_type in ("md", "txt"):
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    else:
        from PyPDF2 import PdfReader
        reader = PdfReader(file_path)
        pages = []
        for page in reader.pages:
            text = page.extract_text() or ""
            if text.strip():
                pages.append(text.strip())
        return "\n\n".join(pages)


def _guess_file_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".md":
        return "md"
    elif ext == ".txt":
        return "txt"
    else:
        return "pdf"


# --- Indexing ---

async def _index_document(doc_id: str, file_path: str, file_type: str):
    try:
        storage.update_document_status(doc_id, "processing")
        text = _extract_text(file_path, file_type)
        if not text.strip():
            storage.update_document_status(doc_id, "failed", error_message="No text extracted from document")
            return
        await rag.ainsert(text)
        storage.update_document_status(doc_id, "completed")
    except Exception as e:
        storage.update_document_status(doc_id, "failed", error_message=str(e))
        traceback.print_exc()


async def _rebuild_all(documents: list[dict]):
    """Clear LightRAG data and re-index all remaining documents."""
    global rag
    async with _rebuild_lock:
        try:
            lightrag_dir = os.path.join(WORKING_DIR, "lightrag")
            if os.path.exists(lightrag_dir):
                shutil.rmtree(lightrag_dir)
            rag = _create_lightrag()
            await rag.initialize_storages()
            for doc in documents:
                if doc.get("status") in ("completed", "failed") and os.path.exists(doc.get("file_path", "")):
                    await _index_document(doc["id"], doc["file_path"], doc["type"])
        except Exception as e:
            print(f"[RAG] Rebuild failed: {e}")
            traceback.print_exc()


# --- Endpoints ---

@app.get("/health")
def health():
    return {
        "status": "ok",
        "embedding_configured": bool(EMBED_API_KEY),
        "llm_configured": bool(LLM_API_KEY and LLM_MODEL),
        "rerank_enabled": RERANK_ENABLED,
        "lightrag_ready": rag is not None,
    }


@app.get("/embedding/test")
def test_embedding():
    if not EMBED_API_KEY:
        return {"success": False, "error": "EMBED_API_KEY not configured"}
    try:
        from openai import OpenAI
        client = OpenAI(api_key=EMBED_API_KEY, base_url=EMBED_API_BASE or None)
        resp = client.embeddings.create(input=["test"], model=EMBED_MODEL)
        if resp.data and len(resp.data) > 0:
            return {"success": True}
        return {"success": False, "error": "Empty response from embedding API"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/llm/test")
async def test_llm():
    if not LLM_API_KEY:
        return {"success": False, "error": "LLM_API_KEY not configured"}
    if not LLM_MODEL:
        return {"success": False, "error": "LLM_MODEL not configured"}
    try:
        result = await _llm_func("Say 'ok'", system_prompt="Reply with one word.")
        return {"success": bool(result)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/index")
async def index_document(req: IndexRequest):
    if not os.path.exists(req.path):
        raise HTTPException(status_code=400, detail=f"File not found: {req.path}")

    name = os.path.basename(req.path)
    doc = storage.create_document(name, req.path, req.type)
    doc_id = doc["id"]

    if rag is None:
        raise HTTPException(status_code=503, detail="LightRAG not initialized (check LLM + Embedding config)")

    asyncio.create_task(_index_document(doc_id, req.path, req.type))
    return {"doc_id": doc_id, "status": "processing"}


@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    type: Optional[str] = Form(None),
):
    """Upload a file and index it into the knowledge base."""
    if rag is None:
        raise HTTPException(status_code=503, detail="LightRAG not initialized (check LLM + Embedding config)")

    filename = file.filename or "upload"
    file_type = type or _guess_file_type(filename)

    # Save uploaded file to working dir
    uploads_dir = os.path.join(WORKING_DIR, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)

    import uuid
    safe_name = f"{uuid.uuid4().hex[:8]}_{filename}"
    file_path = os.path.join(uploads_dir, safe_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    doc = storage.create_document(filename, file_path, file_type)
    doc_id = doc["id"]

    asyncio.create_task(_index_document(doc_id, file_path, file_type))
    return {"doc_id": doc_id, "name": filename, "status": "processing"}


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


@app.post("/index/{doc_id}/retry")
async def retry_index(doc_id: str):
    """Re-index a pending or failed document."""
    if rag is None:
        raise HTTPException(status_code=503, detail="LightRAG not initialized (check LLM + Embedding config)")
    doc = storage.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    file_path = doc.get("file_path", "")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail=f"File not found: {file_path}")
    asyncio.create_task(_index_document(doc_id, file_path, doc["type"]))
    return {"doc_id": doc_id, "status": "processing"}


@app.post("/search")
async def search_documents(req: SearchRequest):
    if rag is None:
        raise HTTPException(status_code=503, detail="LightRAG not initialized")

    from lightrag import QueryParam

    if req.mode == "deep":
        result = await rag.aquery(
            req.query,
            param=QueryParam(mode="hybrid", only_need_context=False, top_k=req.top_k)
        )
        return {"mode": "deep", "result": result}
    else:
        context = await rag.aquery(
            req.query,
            param=QueryParam(mode="naive", only_need_context=True, top_k=req.top_k)
        )
        return {"mode": "fast", "context": context}


@app.get("/documents")
def list_documents(limit: int = 50, offset: int = 0):
    return storage.list_documents(limit, offset)


@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    if not storage.delete_document(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
    remaining = storage.list_documents(limit=9999)
    asyncio.create_task(_rebuild_all(remaining.get("documents", [])))
    return {"success": True}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT)
