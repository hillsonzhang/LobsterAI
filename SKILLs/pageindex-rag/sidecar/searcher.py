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
