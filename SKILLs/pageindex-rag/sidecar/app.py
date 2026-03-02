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
