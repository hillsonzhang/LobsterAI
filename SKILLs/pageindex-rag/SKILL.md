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
