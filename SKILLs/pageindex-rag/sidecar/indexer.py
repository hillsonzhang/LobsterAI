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
