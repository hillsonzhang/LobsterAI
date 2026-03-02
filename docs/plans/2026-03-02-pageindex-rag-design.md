# PageIndex RAG 本地知识库插件设计

## 概述

将 PageIndex（vectorless, reasoning-based RAG）集成到 LobsterAI 中，作为本地 Sidecar 服务随 Electron 启动，通过 Skill 暴露给 Cowork 中的 Claude Agent，并在 Cowork 侧栏提供知识库管理 UI。

## 需求

- PageIndex 作为本地 FastAPI 服务，随 Electron 启动/关闭
- 复用 LobsterAI 已配置的 LLM API Key
- 支持 PDF + Markdown 文档格式
- Cowork 侧栏新增知识库管理区域（上传、列表、删除、状态）
- 注册为 `document-rag` Skill，Claude 可调用检索/索引工具
- 树索引持久化到 SQLite（复用现有 lobsterai.sqlite）

---

## 架构

```
Renderer (React)
  ├── Cowork 侧栏: 知识库管理 UI
  └── CoworkSessionDetail: Claude 通过 Skill 调用检索
         │ IPC
Main Process (Electron)
  ├── pageindexSidecar.ts: 管理 Python 进程生命周期
  ├── ragService.ts: IPC handler 逻辑
  └── main.ts: 注册 rag:* IPC 通道
         │ HTTP (localhost:随机端口)
PageIndex FastAPI Sidecar (Python)
  ├── 文档索引构建（调用 PageIndex + LLM）
  ├── 推理式检索
  └── SQLite 存储
```

---

## 模块设计

### 1. FastAPI Sidecar

**目录结构：**
```
SKILLs/pageindex-rag/
├── SKILL.md                    # Skill 定义文档
├── sidecar/
│   ├── requirements.txt        # fastapi, uvicorn, pageindex
│   ├── app.py                  # FastAPI 主入口
│   ├── indexer.py              # 索引构建逻辑
│   ├── searcher.py             # 检索逻辑
│   └── storage.py              # SQLite 存储层
├── scripts/
│   ├── search.sh               # Skill 工具: 检索文档
│   ├── index.sh                # Skill 工具: 索引新文档
│   ├── list-docs.sh            # Skill 工具: 列出文档
│   └── delete-doc.sh           # Skill 工具: 删除文档
└── package.json                # (可选)
```

**API 端点：**

| 端点 | 方法 | 功能 | 请求 | 响应 |
|------|------|------|------|------|
| `/health` | GET | 健康检查 | - | `{"status": "ok"}` |
| `/index` | POST | 建立文档索引 | `{path, type}` | `{doc_id, status: "processing"}` |
| `/index/{doc_id}/status` | GET | 查询索引进度 | - | `{status, progress, nodes_count}` |
| `/search` | POST | 推理式检索 | `{query, doc_ids?, top_k?}` | `{results: [{doc_id, sections, pages, content}]}` |
| `/documents` | GET | 列出所有文档 | `?limit&offset` | `{documents: [...]}` |
| `/documents/{doc_id}` | DELETE | 删除文档及索引 | - | `{success: true}` |

**索引构建流程（异步）：**
1. POST `/index` → 返回 `doc_id` + `processing` 状态
2. 后台线程调用 PageIndex 构建树索引
3. 完成后存入 SQLite `rag_trees` 表
4. 前端轮询 `/index/{doc_id}/status` 获取进度

**LLM 配置：**
- 环境变量: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`
- Model: `PAGEINDEX_MODEL` 环境变量
- PageIndex 原生支持 OpenAI，Anthropic 需做适配层

### 2. Main Process 集成

**新增文件：**
```
src/main/libs/
├── pageindexSidecar.ts    # Sidecar 生命周期管理
└── ragService.ts          # RAG IPC handler
```

**pageindexSidecar.ts 核心逻辑：**
- `startSidecar()`: app ready 时启动 Python 进程
  - 选择随机可用端口
  - 环境变量传入 API Key、端口、SQLite 路径
  - 健康检查轮询（500ms 间隔，30s 超时）
- `stopSidecar()`: app before-quit 时 SIGTERM
- `restartSidecar()`: 异常退出自动重启（最多 3 次）
- `getSidecarPort()`: 返回当前端口供 IPC handler 使用

**IPC 通道：**
```
rag:uploadDocument    → { filePath, type } → { docId, status }
rag:listDocuments     → { limit?, offset? } → { documents }
rag:deleteDocument    → { docId } → { success }
rag:getDocumentStatus → { docId } → { status, progress }
rag:searchDocuments   → { query, docIds? } → { results }
rag:getSidecarStatus  → {} → { running, port }
```

**Preload API 扩展 (`window.electron.rag`)：**
```typescript
rag: {
  uploadDocument: (filePath, type) => ipcRenderer.invoke('rag:uploadDocument', ...),
  listDocuments: (limit?, offset?) => ipcRenderer.invoke('rag:listDocuments', ...),
  deleteDocument: (docId) => ipcRenderer.invoke('rag:deleteDocument', ...),
  getDocumentStatus: (docId) => ipcRenderer.invoke('rag:getDocumentStatus', ...),
  searchDocuments: (query, docIds?) => ipcRenderer.invoke('rag:searchDocuments', ...),
  getSidecarStatus: () => ipcRenderer.invoke('rag:getSidecarStatus'),
}
```

### 3. SQLite Schema

```sql
CREATE TABLE rag_documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  type TEXT NOT NULL,            -- 'pdf' | 'md'
  status TEXT DEFAULT 'pending', -- pending | processing | completed | failed
  nodes_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE rag_trees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  tree_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

### 4. UI 组件

**导航方式：** 与 SkillsView、ScheduledTasksView 同级，通过 App.tsx 的 `mainView` 状态切换。

**侧栏入口（Sidebar.tsx 操作按钮区）：**
```
┌──────────────────────┐
│  [+ 新对话]           │
│  [搜索]               │
│  [定时任务]           │
│  [技能]               │
│  [知识库]  ← 新增按钮  │
├──────────────────────┤
│  Cowork History       │
│  ├ Session 1          │
│  ├ Session 2          │
│  └ ...                │
├──────────────────────┤
│  [设置]               │
└──────────────────────┘
```

点击「知识库」按钮 → `mainView` 切换为 `'knowledgeBase'` → 渲染 `KnowledgeBaseView`。
侧栏仅显示按钮，不显示文档子项或状态。

**新增文件：**
```
src/renderer/components/knowledgeBase/
├── KnowledgeBaseView.tsx       # 二级页面主视图 (与 SkillsView 同级)
├── KnowledgeBaseDocList.tsx    # 文档列表 (表格: 名称、类型、状态、操作)
├── KnowledgeBaseUpload.tsx     # 上传区域 (拖拽 + 文件选择)
└── KnowledgeBaseDocDetail.tsx  # 文档详情 (索引树结构预览，可选)
```

**KnowledgeBaseView 页面布局：**
```
┌─────────────────────────────────────────────┐
│  ← 返回    知识库管理          服务状态: 运行中 │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─ 上传区域 ─────────────────────────────┐ │
│  │  拖拽文件到此处，或点击选择文件          │ │
│  │  支持 PDF、Markdown 格式               │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  文档列表                          共 3 个文档 │
│  ┌──────────┬──────┬────────┬────────────┐ │
│  │ 名称      │ 类型  │ 状态    │ 操作        │ │
│  ├──────────┼──────┼────────┼────────────┤ │
│  │ report   │ PDF  │ 已完成  │ [查看] [删除]│ │
│  │ manual   │ MD   │ 已完成  │ [查看] [删除]│ │
│  │ spec     │ PDF  │ 索引中… │ [取消]      │ │
│  └──────────┴──────┴────────┴────────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

**交互流程：**
- 拖拽或点击上传文件 → 文件复制到 app data → 调用 `rag:uploadDocument`
- 文档列表展示所有已上传文档，轮询更新索引状态
- 「查看」→ 展开文档详情/树结构预览
- 「删除」→ 确认弹窗 → 调用 `rag:deleteDocument`
- 页头「← 返回」→ 回到 Cowork 主视图
- 页头显示 Sidecar 服务状态指示器

**修改的现有文件：**
- `src/renderer/App.tsx` - mainView 新增 `'knowledgeBase'` 状态，渲染 KnowledgeBaseView
- `src/renderer/components/Sidebar.tsx` - 技能按钮下方新增知识库按钮

**新增 Redux State (`ragSlice.ts`)：**
```typescript
interface RagState {
  documents: RagDocument[];
  sidecarStatus: 'starting' | 'running' | 'stopped' | 'error';
  uploading: boolean;
}

interface RagDocument {
  id: string;
  name: string;
  type: 'pdf' | 'md';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  nodesCount: number;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}
```

### 5. Skill 定义

**SKILL.md frontmatter:**
```yaml
---
name: document-rag
description: "基于 PageIndex 的本地知识库检索，支持 PDF 和 Markdown 文档的推理式 RAG"
license: Proprietary
official: true
version: 1.0.0
metadata:
  clawdbot:
    emoji: "📚"
    requires:
      bins: [python3, curl]
---
```

**暴露给 Claude 的工具：**
1. `search_documents` - 在知识库中检索相关内容
2. `index_document` - 为新文档建立索引
3. `list_documents` - 查看知识库文档列表
4. `delete_document` - 删除文档及其索引

**skills.config.json 新增：**
```json
"pageindex-rag": { "order": 50, "enabled": true }
```

---

## 实施步骤

### Phase 1: FastAPI Sidecar
1. 创建 `SKILLs/pageindex-rag/sidecar/` 目录及 Python 代码
2. 实现 app.py (FastAPI 入口 + 端点)
3. 实现 indexer.py (PageIndex 调用 + 异步索引)
4. 实现 storage.py (SQLite 读写)
5. 实现 searcher.py (检索逻辑)
6. 编写 requirements.txt

### Phase 2: Main Process 集成
7. 实现 pageindexSidecar.ts (进程生命周期管理)
8. 实现 ragService.ts (IPC handler)
9. 在 main.ts 中注册 IPC 通道 + 启动 Sidecar
10. 扩展 preload.ts 暴露 rag API
11. 添加 SQLite 表迁移逻辑

### Phase 3: Skill 定义
12. 编写 SKILL.md
13. 实现 scripts/ 下的 shell 脚本
14. 更新 skills.config.json

### Phase 4: UI 组件
15. 新增 ragSlice.ts (独立 Redux slice)
16. 实现 KnowledgeBaseView.tsx (二级页面主视图)
17. 实现 KnowledgeBaseDocList.tsx (文档表格列表)
18. 实现 KnowledgeBaseUpload.tsx (拖拽上传区域)
19. 修改 Sidebar.tsx (技能按钮下方新增知识库按钮)
20. 修改 App.tsx (mainView 新增 'knowledgeBase' 状态)

### Phase 5: 联调测试
20. 端到端测试: 上传 PDF → 索引 → 检索 → Claude 回答
21. 错误处理: Sidecar 崩溃恢复、索引失败、网络异常
22. UI 状态同步验证
