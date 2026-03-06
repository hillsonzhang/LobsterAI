# Cowork 自定义 Subagent 设计

## 概述

在 Cowork 现有的 Claude Agent SDK 集成基础上，支持用户自定义 Subagent。用户可以在设置中定义多个专项 Agent（如代码审查、测试运行、文档生成等），Cowork 主 Agent 根据任务自动或显式调用对应的 Subagent。

**当前状态**: Cowork 已支持 SDK 内置的 `general-purpose` Subagent（`Task` 工具未被禁用），但不支持自定义 Agent 定义。

---

## 架构

```
Renderer (React)
  ├── Settings → Subagent 管理页: 增删改查自定义 Agent
  ├── CoworkSessionDetail: 展示 Subagent 执行过程
  └── CoworkView: Agent 选择/启用 UI
         │ IPC
Main Process (Electron)
  ├── coworkStore.ts: subagent 定义持久化 (SQLite)
  ├── coworkRunner.ts: 构建 options.agents 传入 SDK query()
  └── main.ts: 注册 cowork:subagent:* IPC 通道
         │
Claude Agent SDK
  └── query({ prompt, options: { agents: { ... }, allowedTools: [..., 'Task'] } })
```

---

## 数据模型

### SubagentDefinition

```typescript
interface SubagentDefinition {
  id: string;            // UUID
  name: string;          // Agent 名称，作为 agents 对象的 key（如 "code-reviewer"）
  description: string;   // 描述，SDK 根据此字段自动匹配任务
  prompt: string;        // System prompt，定义 Agent 的角色和行为
  tools: string[];       // 允许的工具列表，空数组表示继承所有工具
  model: 'inherit' | 'opus' | 'sonnet' | 'haiku';  // 模型选择
  enabled: boolean;      // 是否启用
  isBuiltIn: boolean;    // 是否为预置 Agent（不可删除）
  createdAt: number;
  updatedAt: number;
}
```

### 存储

在 SQLite `cowork_subagents` 表中持久化：

```sql
CREATE TABLE IF NOT EXISTS cowork_subagents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  prompt TEXT NOT NULL,
  tools_json TEXT NOT NULL DEFAULT '[]',
  model TEXT NOT NULL DEFAULT 'inherit',
  enabled INTEGER NOT NULL DEFAULT 1,
  is_built_in INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

## 预置 Subagent

提供几个开箱即用的预置 Agent，用户可以修改但不可删除：

| name | description | tools | model |
|------|-------------|-------|-------|
| `code-reviewer` | 代码审查专家，分析代码质量、安全性和可维护性 | `Read, Grep, Glob` | `inherit` |
| `test-runner` | 测试执行专家，运行测试并分析结果 | `Bash, Read, Grep` | `inherit` |
| `doc-writer` | 文档撰写专家，生成和更新项目文档 | `Read, Write, Glob, Grep` | `inherit` |

---

## 改动文件

### 后端 (Main Process)

| 文件 | 改动 |
|------|------|
| `src/main/coworkStore.ts` | 新增 `cowork_subagents` 表，CRUD 方法 |
| `src/main/libs/coworkRunner.ts` | 从 store 加载已启用的 subagent，构建 `options.agents` |
| `src/main/main.ts` | 注册 `cowork:subagent:*` IPC handler |
| `src/main/preload.ts` | 暴露 `cowork.subagent.*` IPC 通道 |

### 前端 (Renderer)

| 文件 | 改动 |
|------|------|
| `src/renderer/types/electron.d.ts` | 新增 subagent 相关类型 |
| `src/renderer/types/cowork.ts` | 新增 `SubagentDefinition` 类型 |
| `src/renderer/components/Settings.tsx` | 新增 Subagent 管理 tab 页 |
| `src/renderer/services/i18n.ts` | 新增相关 i18n 文本 |

---

## 模块设计

### 1. CoworkStore — Subagent CRUD

```typescript
// coworkStore.ts 新增方法
listSubagents(): SubagentDefinition[]
getSubagent(id: string): SubagentDefinition | null
createSubagent(input: Omit<SubagentDefinition, 'id' | 'createdAt' | 'updatedAt'>): SubagentDefinition
updateSubagent(id: string, input: Partial<SubagentDefinition>): SubagentDefinition
deleteSubagent(id: string): void  // isBuiltIn=true 的不可删除
getEnabledSubagents(): SubagentDefinition[]
```

初始化时插入预置 Agent（`INSERT OR IGNORE`）。

### 2. CoworkRunner — 注入 agents

在 `runClaudeCodeLocal()` 构建 `options` 时：

```typescript
// 从 store 加载已启用的 subagent 定义
const subagents = this.store.getEnabledSubagents();
if (subagents.length > 0) {
  const agents: Record<string, unknown> = {};
  for (const sa of subagents) {
    agents[sa.name] = {
      description: sa.description,
      prompt: sa.prompt,
      tools: sa.tools.length > 0 ? sa.tools : undefined,  // 空数组=继承所有
      model: sa.model !== 'inherit' ? sa.model : undefined,
    };
  }
  options.agents = agents;
}
```

无需修改事件处理逻辑 — Subagent 产生的事件通过同一个 event stream 返回，现有的 `handleClaudeEvent` 完全兼容。

### 3. IPC 通道

```
cowork:subagent:list    → listSubagents()
cowork:subagent:get     → getSubagent(id)
cowork:subagent:create  → createSubagent(input)
cowork:subagent:update  → updateSubagent(id, input)
cowork:subagent:delete  → deleteSubagent(id)
```

### 4. Settings UI — Subagent 管理页

在 Settings 中新增 `subagents` tab（类似 MCP/Skills 管理页的设计语言）：

- **列表页**: 展示所有 subagent，开关切换启用/禁用，预置标签
- **编辑弹窗**: name, description, prompt（textarea）, tools（多选 checkbox）, model（下拉选择）
- **新增按钮**: 创建自定义 Agent
- **删除**: 自定义 Agent 可删除，预置 Agent 只能禁用

#### 可用工具列表（多选）

```
☑ Read      ☑ Write     ☑ Edit      ☑ Bash
☑ Glob      ☑ Grep      ☐ WebSearch ☐ WebFetch
```

空选表示继承主 Agent 的所有可用工具。

---

## UI 展示增强（可选，后续迭代）

Subagent 产生的事件带有 `parent_tool_use_id` 字段，可用于：

1. **折叠展示**: 将 subagent 的执行过程折叠在一个可展开区域内
2. **标签标识**: 在消息旁显示 subagent 名称标签（如 `[code-reviewer]`）
3. **独立计时**: 展示 subagent 的执行耗时

---

## SDK 约束

- Subagent **不能嵌套** — subagent 的 tools 不应包含 `Task`
- Subagent name 必须是有效标识符（字母、数字、连字符）
- description 应清晰描述使用场景，SDK 据此自动匹配任务
- Windows 下 prompt 不宜过长（命令行长度限制 8191 字符）

---

## 验证计划

1. `npm run compile:electron` 编译通过
2. 启动应用，Settings 中可以看到预置 Subagent 列表
3. 新增/编辑/删除/启用/禁用自定义 Subagent
4. 在 Cowork 中发送 "请使用 code-reviewer 审查当前项目" 验证 subagent 被调用
5. 在 Cowork 中发送普通任务，验证 SDK 根据 description 自动选择 subagent
6. 禁用所有 subagent 后验证行为回退到无自定义 agent 的状态
