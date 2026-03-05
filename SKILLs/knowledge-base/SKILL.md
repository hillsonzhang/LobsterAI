---
name: knowledge-base
description: "本地知识库检索，支持快速向量搜索和深度知识图谱分析"
official: true
version: 4.0.0
metadata:
  clawdbot:
    emoji: "📚"
    requires:
      bins: [curl]
---

# 知识库检索

本地知识库检索技能，基于 LightRAG 实现向量 + 知识图谱混合检索。支持两种搜索模式：快速搜索（默认）和深度搜索。

## 搜索模式

### 默认：快速搜索（fast）
直接返回相关文本片段，不调用 LLM。你根据检索到的原始文本回答用户问题。

### 深度搜索（deep）
仅在用户**明确要求**深度分析时使用。通过知识图谱 + LLM 综合分析，返回更全面的结果。

## 何时使用

- 用户提问涉及已上传到知识库的文档内容
- 用户要求你根据特定文档回答问题
- 用户要求你搜索知识库中的信息
- 用户要求索引新文档或管理知识库

## 端口获取

每次执行命令前，先获取最新端口（优先读文件，fallback 到环境变量）：

```bash
RAG_PORT=$(cat "$RAG_PORT_FILE" 2>/dev/null || echo $RAG_PORT)
```

## 可用工具

### 1. 快速搜索（默认使用）

```bash
RAG_PORT=$(cat "$RAG_PORT_FILE" 2>/dev/null || echo $RAG_PORT) && curl -s http://127.0.0.1:$RAG_PORT/search \
  -H "Content-Type: application/json" \
  -d '{"query": "搜索问题", "top_k": 5, "mode": "fast"}'
```

返回格式：`{"mode": "fast", "context": "相关文本片段..."}`

### 2. 深度搜索（仅用户明确要求时）

```bash
RAG_PORT=$(cat "$RAG_PORT_FILE" 2>/dev/null || echo $RAG_PORT) && curl -s --max-time 120 http://127.0.0.1:$RAG_PORT/search \
  -H "Content-Type: application/json" \
  -d '{"query": "搜索问题", "top_k": 10, "mode": "deep"}'
```

返回格式：`{"mode": "deep", "result": "LLM 综合分析结果..."}`

### 3. 上传文件到知识库 (upload)

直接上传文件并自动索引，支持 PDF、Markdown、TXT：

```bash
RAG_PORT=$(cat "$RAG_PORT_FILE" 2>/dev/null || echo $RAG_PORT) && curl -s http://127.0.0.1:$RAG_PORT/upload \
  -F "file=@/path/to/document.pdf"
```

可选指定文件类型（默认按扩展名自动判断）：

```bash
RAG_PORT=$(cat "$RAG_PORT_FILE" 2>/dev/null || echo $RAG_PORT) && curl -s http://127.0.0.1:$RAG_PORT/upload \
  -F "file=@/path/to/notes.txt" \
  -F "type=txt"
```

返回格式：`{"doc_id": "...", "name": "document.pdf", "status": "processing"}`

索引是异步的，可通过查询状态接口跟踪进度。

### 4. 通过路径索引文档 (index)

如果文件已在本地磁盘上，可直接传路径索引：

```bash
RAG_PORT=$(cat "$RAG_PORT_FILE" 2>/dev/null || echo $RAG_PORT) && curl -s http://127.0.0.1:$RAG_PORT/index \
  -H "Content-Type: application/json" \
  -d '{"path": "/absolute/path/to/document.pdf", "type": "pdf"}'
```

支持 `type`: `pdf`、`md`、`txt`。

### 5. 查询索引状态 (index_status)

```bash
RAG_PORT=$(cat "$RAG_PORT_FILE" 2>/dev/null || echo $RAG_PORT) && curl -s "http://127.0.0.1:$RAG_PORT/index/{doc_id}/status"
```

返回格式：`{"status": "processing|completed|failed", "nodes_count": 0, "error_message": null}`

### 6. 列出文档 (list_documents)

查看知识库中所有文档：

```bash
RAG_PORT=$(cat "$RAG_PORT_FILE" 2>/dev/null || echo $RAG_PORT) && curl -s "http://127.0.0.1:$RAG_PORT/documents?limit=50&offset=0"
```

### 7. 删除文档 (delete_document)

删除文档及其索引（删除后剩余文档会异步重建索引）：

```bash
RAG_PORT=$(cat "$RAG_PORT_FILE" 2>/dev/null || echo $RAG_PORT) && curl -s -X DELETE "http://127.0.0.1:$RAG_PORT/documents/{doc_id}"
```

## 使用原则

1. **总是默认使用快速搜索**
2. 仅当用户说「深度分析」「全面搜索」「详细分析」时才用深度搜索
3. 快速搜索：返回原始文本，由你综合回答
4. 深度搜索：返回 LLM 综合分析后的结果
5. 深度搜索耗时较长（可能需要 30-120 秒），提前告知用户
6. 用户要求添加文件到知识库时，优先使用 `/upload` 端点上传文件
7. 上传后通过 `/index/{doc_id}/status` 轮询索引状态，完成后告知用户

## 注意事项

- 每次执行命令前必须获取最新端口：`RAG_PORT=$(cat "$RAG_PORT_FILE" 2>/dev/null || echo $RAG_PORT)`
- `RAG_PORT_FILE` 和 `RAG_PORT` 环境变量由系统自动设置
- **禁止**使用 `${VAR:?...}` 等高级 shell 语法
- 索引需要 Embedding API 和 LLM API 都配置好
- 索引是异步的，大文档可能需要较长时间
- Embedding API 和 LLM API 需要在知识库页面分别配置
