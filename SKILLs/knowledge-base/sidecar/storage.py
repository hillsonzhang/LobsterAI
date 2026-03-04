import sqlite3
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

    def reset_all_document_status(self):
        """Reset all completed documents to pending (needs re-indexing)."""
        conn = self._get_conn()
        try:
            conn.execute(
                "UPDATE rag_documents SET status = 'pending', updated_at = ? WHERE status = 'completed'",
                (int(time.time() * 1000),)
            )
            conn.commit()
        finally:
            conn.close()
