"""
Build index tree from PDF or Markdown files.

Priority:
1. PageIndex cloud API (if PAGEINDEX_API_KEY is set)
2. PageIndex local CLI (if PAGEINDEX_ROOT is set)
3. Local fallback using PyPDF2 — works offline, no API key needed
"""
import os
import json
import subprocess
import tempfile
from typing import Optional


def build_tree(file_path: str, file_type: str = "pdf") -> dict:
    """Build a tree index for the given document.

    Returns a dict with 'nodes' list and 'metadata'.
    """
    api_key = os.environ.get("PAGEINDEX_API_KEY", "")
    pageindex_root = os.environ.get("PAGEINDEX_ROOT", "")

    # 1. PageIndex cloud API
    if api_key:
        try:
            return _build_tree_api(file_path, file_type, api_key)
        except Exception as e:
            print(f"[indexer] PageIndex API failed: {e}, trying next method...")

    # 2. PageIndex local CLI
    if pageindex_root:
        try:
            return _build_tree_cli(file_path, file_type, pageindex_root)
        except Exception as e:
            print(f"[indexer] PageIndex CLI failed: {e}, trying local fallback...")

    # 3. Local fallback — always available
    return _build_tree_local(file_path, file_type)


def _build_tree_api(file_path: str, file_type: str, api_key: str) -> dict:
    """Use PageIndex cloud API."""
    from pageindex import PageIndexClient
    import time

    client = PageIndexClient(api_key=api_key)
    result = client.submit_document(file_path)
    doc_id = result.get("doc_id")

    for _ in range(600):  # up to 10 minutes
        status = client.get_document(doc_id)
        if status.get("status") == "completed":
            tree = client.get_tree(doc_id)
            return tree.get("result", {"nodes": [], "metadata": {}})
        elif status.get("status") == "failed":
            raise RuntimeError(f"PageIndex indexing failed: {status.get('error', 'unknown')}")
        time.sleep(1)

    raise TimeoutError("PageIndex indexing timed out after 10 minutes")


def _build_tree_cli(file_path: str, file_type: str, pageindex_root: str) -> dict:
    """Use PageIndex local CLI via subprocess."""
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
        proc = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=600)
        if proc.returncode != 0:
            raise RuntimeError(f"PageIndex CLI failed: {proc.stderr}")

        if os.path.exists(output_path):
            with open(output_path, "r") as f:
                return json.load(f)

        raise RuntimeError("PageIndex CLI produced no output")


def _build_tree_local(file_path: str, file_type: str) -> dict:
    """Local fallback: extract text directly without external API.

    PDF: uses PyPDF2 to extract text per page.
    Markdown: splits by headings.
    """
    if file_type == "md":
        return _extract_markdown(file_path)
    else:
        return _extract_pdf(file_path)


def _extract_pdf(file_path: str) -> dict:
    """Extract text from PDF using PyPDF2, one node per page."""
    from PyPDF2 import PdfReader

    reader = PdfReader(file_path)
    nodes = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        text = text.strip()
        if text:
            nodes.append({
                "title": f"Page {i + 1}",
                "content": text,
                "summary": text[:200] + "..." if len(text) > 200 else text,
                "pages": [i + 1],
            })

    return {
        "nodes": nodes,
        "metadata": {
            "file_path": file_path,
            "total_pages": len(reader.pages),
            "method": "local_pypdf2",
        },
    }


def _extract_markdown(file_path: str) -> dict:
    """Extract sections from Markdown, split by headings."""
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    import re
    sections = re.split(r'^(#{1,3}\s+.+)$', content, flags=re.MULTILINE)

    nodes = []
    current_title = "Introduction"
    current_content = ""

    for part in sections:
        if re.match(r'^#{1,3}\s+', part):
            # Save previous section
            if current_content.strip():
                text = current_content.strip()
                nodes.append({
                    "title": current_title,
                    "content": text,
                    "summary": text[:200] + "..." if len(text) > 200 else text,
                    "pages": [],
                })
            current_title = part.strip().lstrip("#").strip()
            current_content = ""
        else:
            current_content += part

    # Save last section
    if current_content.strip():
        text = current_content.strip()
        nodes.append({
            "title": current_title,
            "content": text,
            "summary": text[:200] + "..." if len(text) > 200 else text,
            "pages": [],
        })

    return {
        "nodes": nodes,
        "metadata": {
            "file_path": file_path,
            "method": "local_markdown",
        },
    }
