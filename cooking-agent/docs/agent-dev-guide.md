# Agent 开发指南

> 基于 cooking-agent 项目的实战总结，涵盖 ReAct 推理、Function Calling、Skill 系统、工具开发、会话持久化等 Agent 开发全流程。

---

## 目录

1. [Agent 架构概览](#1-agent-架构概览)
2. [ReAct 推理循环](#2-react-推理循环)
3. [Function Calling 集成](#3-function-calling-集成)
4. [工具体系设计](#4-工具体系设计)
5. [Skill 系统（Markdown 驱动）](#5-skill-系统markdown-驱动)
6. [Prompt 工程](#6-prompt-工程)
7. [会话与消息持久化](#7-会话与消息持久化)
8. [流式对话实现](#8-流式对话实现)
9. [类型系统设计](#9-类型系统设计)
10. [错误处理与降级](#10-错误处理与降级)
11. [注意事项清单](#11-注意事项清单)

---

## 1. Agent 架构概览

### 1.1 核心组件关系

```
┌─────────────────────────────────────────────────────────┐
│                      Express 路由层                      │
│   /api/chat  /api/chat/stream  /api/history  ...        │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                   CookingAgent                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ ReAct 推理   │  │ 会话管理      │  │ 消息持久化    │  │
│  │ 循环控制     │  │ (CRUD)       │  │ (DB 读写)     │  │
│  └──────┬──────┘  └──────────────┘  └───────────────┘  │
│         │                                               │
│  ┌──────▼──────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ OpenAI SDK   │  │ 工具调度器    │  │ Skill 加载器  │  │
│  │ (DeepSeek)  │  │ executeTools │  │ loadSkills    │  │
│  └─────────────┘  └──────┬───────┘  └───────┬───────┘  │
│                          │                   │           │
└──────────────────────────┼───────────────────┼───────────┘
                           │                   │
              ┌────────────▼─────┐    ┌───────▼─────────┐
              │  工具实现层       │    │  skills/*.md    │
              │  recipe/nutrition │    │  知识定义文件    │
              │  safety/technique │    └─────────────────┘
              │  suggest          │
              └──────────────────┘
```

### 1.2 数据流

```
用户输入 → Express 路由 → Agent.chat() / Agent.chatStream()
  → 加载历史消息（DB）
  → ReAct 循环：
      ① 调用 LLM（带 tools 参数）
      ② LLM 返回 tool_calls → 执行工具 → 结果追加到消息列表
      ③ LLM 返回 content → 最终回答
  → 持久化所有消息（DB）
  → 返回结果给前端
```

---

## 2. ReAct 推理循环

### 2.1 什么是 ReAct

ReAct = **Re**asoning + **A**cting，是一种让 LLM 在推理过程中主动调用工具的模式。

```
┌──────────────────────────────────────────────┐
│  Thought  →  分析用户意图，决定下一步行动     │
│  Action   →  调用工具（或直接回答）           │
│  Observe  →  获取工具返回结果                 │
│  Loop     →  重复直到有足够信息给出完整回答   │
│  Answer   →  综合所有信息，给出最终回答       │
└──────────────────────────────────────────────┘
```

### 2.2 实现代码

```typescript
class CookingAgent {
  private readonly MAX_REACT_STEPS = 5  // 最大推理步数，防止无限循环

  async chat(userMessage: string, sessionId: string): Promise<ChatResult> {
    const messages = this.loadMessages(sessionId)

    // 追加用户消息
    messages.push({ role: 'user', content: userMessage })
    this.persistMessage(sessionId, userMsg)

    // ReAct 循环
    for (let step = 1; step <= this.MAX_REACT_STEPS; step++) {
      // ① 调用 LLM
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        tools: TOOL_LIST.map(t => ({ ... })),  // 注册工具
        tool_choice: 'auto',                    // LLM 自动决定是否调用工具
        temperature: 0.7,
        max_tokens: 2048,
      })

      const assistantMsg = response.choices[0].message

      // ② 判断：LLM 要调用工具还是直接回答？
      if (assistantMsg.tool_calls?.length > 0) {
        // → 执行工具，结果追加到消息列表，继续循环
        const toolResults = await executeTools(toolCalls, sessionId)
        messages.push(...toolMessages)
      } else {
        // → 最终回答，结束循环
        return { success: true, message: assistantMsg.content, sessionId }
      }
    }

    // 达到最大步数，返回降级回答
    return { success: true, message: '抱歉，这个问题比较复杂...', sessionId }
  }
}
```

### 2.3 关键注意事项

| 要点 | 说明 |
|------|------|
| **最大步数限制** | 必须设置 `MAX_REACT_STEPS`，防止 LLM 陷入无限工具调用循环 |
| **`tool_choice: 'auto'`** | 让 LLM 自行判断是否需要调用工具，不要强制 |
| **消息顺序** | system → user → assistant(tool_calls) → tool(result) → assistant(tool_calls) → ... → assistant(final) |
| **tool 消息必须紧跟 assistant(tool_calls)** | 否则 API 返回 400 错误 |
| **降级回答** | 达到最大步数时返回友好提示，不要抛错 |

### 2.4 消息顺序约束（重要！）

OpenAI/DeepSeek API 对消息顺序有严格要求：

```
✅ 正确：
  assistant (含 tool_calls) → tool (tool_call_id 匹配) → assistant (含 tool_calls) → tool → assistant (最终)

❌ 错误：
  assistant (含 tool_calls) → assistant (含 tool_calls) → tool  ← 缺少中间的 tool 消息
  tool → assistant  ← tool 消息前面没有对应的 assistant(tool_calls)
```

---

## 3. Function Calling 集成

### 3.1 工具注册

```typescript
const response = await this.client.chat.completions.create({
  model: 'deepseek-chat',
  messages: messages,
  tools: TOOL_LIST.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,           // 工具唯一标识
      description: t.description,  // 工具描述（LLM 据此判断何时调用）
      parameters: t.parameters,    // JSON Schema 参数定义
    },
  })),
  tool_choice: 'auto',
})
```

### 3.2 解析 LLM 的工具调用

```typescript
const assistantMsg = response.choices[0].message

if (assistantMsg.tool_calls?.length > 0) {
  // 提取工具调用信息
  const toolCalls: ToolCall[] = assistantMsg.tool_calls.map(c => ({
    id: c.id,                        // 工具调用唯一 ID
    name: c.function.name,           // 工具名称
    arguments: c.function.arguments, // JSON 字符串参数
  }))

  // 执行工具
  const results = await executeTools(toolCalls, sessionId)
}
```

### 3.3 关键注意事项

- **`tool_calls` 必须持久化**：assistant 消息的 `tool_calls` 字段需要存入数据库，否则后续加载历史时 tool 消息找不到前置引用
- **参数是 JSON 字符串**：`c.function.arguments` 是字符串，需要 `JSON.parse()` 解析
- **并行工具调用**：LLM 可能一次返回多个 `tool_calls`，用 `Promise.all` 并行执行

---

## 4. 工具体系设计

### 4.1 工具定义结构

每个工具由两部分组成：**元信息（Tool）** + **实现函数（ToolImpl）**。

```typescript
// ── 元信息：告诉 LLM 这个工具是干什么的 ──
export const recipe_tool: Tool = {
  name: 'search_recipe',
  description: '当用户询问某个菜名的具体做法、配方、步骤时使用...',
  parameters: {
    type: 'object',
    properties: {
      dish_name: {
        type: 'string',
        description: '要查询的菜名，如：红烧肉、宫保鸡丁',
      },
      difficulty: {
        type: 'string',
        enum: ['简单', '中等', '困难'],
        description: '用户期望的难度级别（可选）',
      },
    },
    required: ['dish_name'],
  },
}

// ── 实现函数：实际执行逻辑 ──
export const recipe_impl: ToolImpl<{ dish_name: string; difficulty?: string }> =
  async (args) => {
    const start = Date.now()

    // 查询数据库或内置数据
    const recipe = RECIPE_DB.find(r =>
      r.name === args.dish_name ||
      r.alias?.includes(args.dish_name)
    )

    if (!recipe) {
      return {
        success: false,
        error: `未找到「${args.dish_name}」的菜谱`,
        duration: Date.now() - start,
      }
    }

    return {
      success: true,
      data: recipe,
      duration: Date.now() - start,
    }
  }
```

### 4.2 工具注册表

```typescript
// tools/index.ts — 集中注册

export const TOOL_LIST: Tool[] = [
  recipe_tool,
  nutrition_tool,
  safety_tool,
  technique_tool,
  suggest_tool,
]

const TOOL_IMPLS: Record<string, ToolImpl> = {
  search_recipe: recipe_impl,
  calculate_nutrition: nutrition_impl,
  check_ingredient_safe: safety_impl,
  explain_technique: technique_impl,
  suggest_dishes: suggest_impl,
}
```

### 4.3 工具执行调度

```typescript
export async function executeTool(call: ToolCall, sessionId: string): Promise<ToolResult> {
  const impl = TOOL_IMPLS[call.name]

  if (!impl) {
    return { success: false, error: `工具 "${call.name}" 不存在` }
  }

  // 解析参数
  let args: Record<string, unknown>
  try {
    args = JSON.parse(call.arguments)
  } catch {
    return { success: false, error: `参数格式错误：${call.arguments}` }
  }

  // 执行工具
  try {
    return await impl(args)
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// 并行执行多个工具
export async function executeTools(calls: ToolCall[], sessionId: string) {
  return Promise.all(
    calls.map(call => ({
      id: call.id,
      result: await executeTool(call, sessionId),
    }))
  )
}
```

### 4.4 关键注意事项

| 要点 | 说明 |
|------|------|
| **工具描述要精准** | LLM 完全依赖 `description` 判断何时调用，描述模糊会导致误调用 |
| **参数 schema 要完整** | `required` 数组标注必填参数，`enum` 限制可选值 |
| **实现函数不抛错** | 错误包装在 `ToolResult` 中返回，不要 throw |
| **记录耗时** | `duration` 字段方便性能监控 |
| **参数解析容错** | `JSON.parse` 可能失败，需要 try/catch |
| **工具不存在时友好提示** | 返回 `success: false` 而非抛错 |

---

## 5. Skill 系统（Markdown 驱动）

### 5.1 设计理念

将 Agent 的领域知识从代码中抽离到 `.md` 文件，实现**知识热更新**——修改 `.md` 文件后重启服务即可生效，无需改代码。

### 5.2 .md 文件结构

```markdown
# 菜谱查询 Skill

## 元数据
- **name**: recipe
- **trigger**: 菜谱查询、做法、配方
- **priority**: 1

## 角色设定
你是一位经验丰富的中华料理大师，精通各大菜系...

## 工具
| 工具名 | 用途 |
|--------|------|
| search_recipe | 根据菜名查询详细做法和配方 |

## 回答格式
【菜名】xxx
【难度】⭐⭐⭐
...

## 触发关键词
- 怎么做
- 做法
- 配方
- 菜谱

## 禁忌/注意事项
- 不得虚构不存在的食材搭配
- 食品安全相关问题需额外调用 safety 工具检查
```

### 5.3 加载流程

```typescript
// loader.ts
export function loadSkills(): Skill[] {
  if (_loaded) return _skills  // 幂等，只加载一次

  const skillsDir = path.join(__dirname, '../skills')
  const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'))

  for (const file of files) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const skill = parseSkillMarkdown(name, content)

    // 注册触发词 → Skill 映射
    for (const trigger of skill.triggerKeywords) {
      _globalTriggers.set(trigger, skill.name)
    }

    _skills.push(skill)
  }

  // 按优先级排序
  _skills.sort((a, b) => a.priority - b.priority)
  _loaded = true
  return _skills
}
```

### 5.4 解析逻辑

```typescript
function parseSkillMarkdown(name: string, content: string): Skill {
  const lines = content.split('\n')

  // 按 ## 二级标题提取各区块
  const metaSection    = extractSection(lines, '元数据')
  const roleSection    = extractSection(lines, '角色设定')
  const toolsSection   = extractSection(lines, '工具')
  const formatSection  = extractSection(lines, '回答格式')
  const triggerSection = extractSection(lines, '触发关键词')
  const warningsSection = extractSection(lines, '禁忌') || extractSection(lines, '注意事项')

  return {
    name: meta.name || name,
    priority: parseInt(meta.priority || '5', 10),
    roleInstruction: roleSection.trim(),
    tools: parseToolList(toolsSection),
    responseFormat: formatSection.trim(),
    triggerKeywords: parseKeywordList(triggerSection),
    warnings: warningsSection?.trim(),
  }
}
```

### 5.5 关键注意事项

- **幂等加载**：`_loaded` 标志位防止重复加载
- **优先级排序**：`priority` 越小越优先，safety 设为 0（最高）
- **触发词注册**：建立 `triggerWord → skillName` 映射表
- **解析容错**：区块不存在时返回空字符串，不抛错
- **热更新**：修改 `.md` 后重启服务即可，无需重新编译

---

## 6. Prompt 工程

### 6.1 系统提示词结构

```
BASE_SYSTEM_PROMPT（固定人设）
  + skillsBlock（从 .md 动态加载的 Skill 角色设定）
  + REACT_INSTRUCTIONS（推理行为规范）
  + toolsBlock（可用工具列表）
  + 触发词列表
  + Skill 状态摘要
```

### 6.2 构建函数

```typescript
export function buildSystemMessage(): string {
  loadSkills()  // 确保 Skill 已加载

  const skillsBlock = buildSkillsSystemBlock()
  const toolsBlock = buildToolsBlock()

  return [
    BASE_SYSTEM_PROMPT,
    skillsBlock,
    REACT_INSTRUCTIONS,
    toolsBlock,
    `当前已注册触发词：${triggerWords.join('、')}`,
    `Skill 状态：${summary.length} 个已加载`,
  ].join('\n')
}
```

### 6.3 关键注意事项

- **人设要具体**：明确语言风格、专业领域、行为边界
- **安全红线前置**：食品安全等硬约束放在最前面
- **工具描述要详细**：LLM 完全依赖描述判断何时调用
- **回答格式模板**：提供结构化输出模板，提升回答质量
- **每次调用重新构建**：`buildSystemMessage()` 每次都重新读取，保证热更新

---

## 7. 会话与消息持久化

### 7.1 会话生命周期

```
创建会话 → 追加消息 → 更新标题 → 更新活跃时间 → 删除会话
```

### 7.2 消息加载

```typescript
private loadMessages(sessionId: string): Message[] {
  // 会话不存在 → 创建新会话 + 写入 system prompt
  if (!sessionRepo.findById(sessionId)) {
    sessionRepo.create(sessionId, '新对话', Date.now())
    const systemMsg = { role: 'system', content: buildSystemMessage() }
    messageRepo.insert(sessionId, systemMsg, Date.now())
    return [systemMsg]
  }

  // 会话存在 → 从 DB 加载所有消息
  const rows = messageRepo.findBySessionId(sessionId)
  return rows.map(r => ({
    role: r.role,
    content: r.content,
    tool_call_id: r.tool_call_id ?? undefined,
    tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
  }))
}
```

### 7.3 消息写入

```typescript
private persistMessage(sessionId: string, msg: Message): void {
  messageRepo.insert(sessionId, msg, Date.now())
}
```

### 7.4 会话标题自动生成

```typescript
// 首条用户消息的前 20 字作为会话标题
const isFirstUserMessage = messageRepo.countBySessionId(sessionId) === 1
if (isFirstUserMessage) {
  const title = userMessage.slice(0, 20) + '…'
  sessionRepo.updateTitle(sessionId, title, Date.now())
}
```

### 7.5 关键注意事项

- **system prompt 只存一次**：新建会话时写入，后续加载时从 DB 读取
- **tool_calls 必须持久化**：JSON 序列化存入 `tool_calls` 列，加载时反序列化
- **历史查询过滤 system**：`findHistoryBySessionId` 排除 system 消息，前端不需要
- **级联删除**：删除会话时自动删除关联消息（`ON DELETE CASCADE`）

---

## 8. 流式对话实现

### 8.1 与普通对话的区别

| | 普通对话 | 流式对话 |
|------|----------|----------|
| API 参数 | `stream: false`（默认） | `stream: true` |
| 返回方式 | 一次性返回完整结果 | 逐 token 推送 |
| 用户体验 | 等待后一次性显示 | 打字机效果 |
| 适用场景 | 短回答、API 调用 | 长文本、聊天场景 |

### 8.2 实现代码

```typescript
/**
 * chatStream — 流式对话（SSE 推送）
 *
 * @param userMessage — 用户输入文本
 * @param sessionId   — 会话 ID
 * @param onChunk     — 逐 token 回调（前端实现打字机效果）
 * @param onDone      — 完成回调（前端停止 streaming 状态）
 * @param signal      — AbortSignal，用于用户手动中止或连接断开时中断 LLM 生成
 */
async chatStream(
  userMessage: string,
  sessionId: string,
  onChunk: (delta: string) => void,
  onDone: (fullContent: string) => void,
  signal?: AbortSignal,  // ← 中止信号
): Promise<void> {
  const messages = this.loadMessages(sessionId)
  messages.push({ role: 'user', content: userMessage })

  // ReAct 循环（工具调用阶段不流式）
  for (let step = 1; step <= this.MAX_REACT_STEPS; step++) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages,
      tools: TOOL_LIST.map(...),
      tool_choice: 'auto',
    })

    const assistantMsg = response.choices[0].message

    if (assistantMsg.tool_calls?.length > 0) {
      // 工具调用阶段：非流式
      const results = await executeTools(toolCalls, sessionId)
      messages.push(...toolMessages)
    } else {
      // 最终回答阶段：流式输出
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        stream: true,  // ← 开启流式
        temperature: 0.7,
        max_tokens: 2048,
      })

      let fullContent = ''
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          fullContent += delta
          onChunk(delta)  // 实时推送每个 token
        }
      }

      // 持久化完整回答
      messages.push({ role: 'assistant', content: fullContent })
      this.persistMessage(sessionId, answerMsg)

      onDone(fullContent)
      return
    }
  }
}
```

### 8.3 中止信号集成

从 index.ts 的 SSE 端点通过 `signal?: AbortSignal` 参数传入，沿以下路径传播：

```
index.ts AbortController
  → agent.chatStream(signal)
    → llm.chatCompletionStream(signal)
      → for await 循环中检查 signal.aborted
```

**检测时机：**

| 位置 | 检测代码 | 日志 |
|------|----------|------|
| ReAct 每轮循环前 | `if (signal?.aborted) { cancelled = true; break }` | `[Agent] 🛑 检测到中止信号，ReAct 第 N 轮前退出` |
| LLM 流式输出每个 chunk | `if (signal?.aborted) break` | LLM SDK 内部处理 |
| 流式完成后 | `if (signal?.aborted) { cancelled = true }` | `[Agent] 🛑 流式输出中被中止，已生成 N 字符` |

**中止后处理：**
- 有部分内容 → 追加 `[已中止]` 标记，持久化部分结果
- 无任何内容 → 返回提示语 "请求已被中断，请重试。"
- 两种情况均调用 `onDone()`，确保前端状态正常清理

### 8.4 关键注意事项

- **工具调用阶段不流式**：ReAct 循环中的工具调用使用非流式模式，避免中间 thinking 被推送给用户
- **最终回答才流式**：只有 LLM 决定直接回答时才开启 `stream: true`
- **流式完成后持久化**：`onDone` 回调中将完整内容写入磁盘
- **`for await` 遍历流**：使用 `for await (const chunk of stream)` 消费 OpenAI 的 SSE 流
- **delta 可能为空**：某些 chunk 不含 content（如含 usage 信息），需要判空
- **中止信号守卫**：SSE 端点的 `req.on('close')` 极易误触发，通过 `finished` / `hasStreamed` / `writableEnded` 三标记精确判断，参见 [streaming-guide.md](file:///e:/workspace/private/ai-agent-cooking/cooking-app/src/views/streaming-guide.md) §6.4

---

## 9. 类型系统设计

### 9.1 核心类型

```typescript
// ── 消息类型（与 OpenAI API 对齐）──
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
}

// ── 工具元信息 ──
export interface Tool {
  name: string
  description: string
  parameters: ToolParameters
}

// ── 工具实现签名 ──
export type ToolImpl<T = Record<string, unknown>> = (args: T) => Promise<ToolResult>

// ── 工具返回值 ──
export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
  duration?: number
}

// ── ReAct 步骤 ──
export interface ReActStep {
  step: number
  thought: string
  action: string
  actionInput?: unknown
  observation?: string
}
```

### 9.2 关键注意事项

- **Message 与 OpenAI SDK 对齐**：直接复用 SDK 的消息结构，避免手动定义偏差
- **ToolImpl 使用泛型**：`ToolImpl<T>` 让每个工具的参数类型精确
- **ToolResult 统一格式**：所有工具返回相同结构，方便调度层统一处理
- **ReActStep 用于日志**：记录每步推理过程，方便调试

---

## 10. 错误处理与降级

### 10.1 分层策略

```
工具层：错误包装在 ToolResult 中，不抛异常
  ↓
Agent 层：try/catch 包裹 LLM 调用，达到最大步数时降级
  ↓
路由层：try/catch 包裹 Agent 调用，返回 500
```

### 10.2 工具层

```typescript
// ✅ 正确：错误包装在返回值中
export const recipe_impl: ToolImpl = async (args) => {
  try {
    const recipe = RECIPE_DB.find(...)
    if (!recipe) {
      return { success: false, error: '未找到菜谱' }
    }
    return { success: true, data: recipe }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
```

### 10.3 Agent 层

```typescript
// 达到最大步数 → 降级回答
if (step > this.MAX_REACT_STEPS) {
  const fallback = '抱歉，这个问题比较复杂，请您换个更具体的问题...'
  return { success: true, message: fallback, sessionId }
}

// LLM 调用失败 → 抛给路由层
catch (error) {
  console.error(`调用失败：${error.message}`)
  throw error
}
```

### 10.4 关键注意事项

- **工具层不抛异常**：所有错误包装在 `ToolResult` 中，让 LLM 自行判断如何处理
- **Agent 层区分可恢复/不可恢复**：达到最大步数降级，API 调用失败抛给上层
- **路由层统一兜底**：返回 500 + 错误描述
- **启动时快速失败**：API Key 缺失等致命问题直接 `process.exit(1)`

---

## 11. 注意事项清单

### ReAct 推理

- [ ] 设置 `MAX_REACT_STEPS` 防止无限循环
- [ ] `tool_choice: 'auto'` 让 LLM 自行决定
- [ ] 消息顺序：assistant(tool_calls) → tool → assistant(tool_calls) → tool → assistant(final)
- [ ] tool 消息的 `tool_call_id` 必须与 assistant 的 `tool_calls[].id` 匹配

### 工具开发

- [ ] `description` 要精准描述触发场景
- [ ] `parameters.required` 标注必填参数
- [ ] 实现函数不抛异常，错误包装在 `ToolResult` 中
- [ ] 记录 `duration` 耗时
- [ ] 参数 JSON 解析要 try/catch

### Skill 系统

- [ ] `.md` 文件严格按 `## 二级标题` 分节
- [ ] `priority` 越小越优先（safety = 0）
- [ ] 触发关键词覆盖常见问法
- [ ] 回答格式提供结构化模板

### Prompt 工程

- [ ] 人设具体明确（语言风格、专业领域、行为边界）
- [ ] 安全红线前置
- [ ] 每次调用 `buildSystemMessage()` 重新构建
- [ ] 工具描述与 Skill 定义保持一致

### 持久化

- [ ] system prompt 只存一次
- [ ] `tool_calls` JSON 序列化存入数据库
- [ ] 加载历史时反序列化 `tool_calls`
- [ ] 历史查询过滤 system 消息
- [ ] 会话标题自动生成（首条消息前 20 字）

### 流式对话

- [ ] 工具调用阶段使用非流式模式
- [ ] 最终回答阶段才开启 `stream: true`
- [ ] `for await` 遍历流时判空 delta
- [ ] 流式完成后持久化完整内容

### 错误处理

- [ ] 工具层不抛异常
- [ ] Agent 层达到最大步数降级
- [ ] 路由层统一返回 500
- [ ] 启动时校验必填环境变量

### 日志

- [ ] 记录每步 ReAct 推理过程
- [ ] 记录工具调用和结果
- [ ] 记录 token 消耗
- [ ] 关键操作带 sessionId

---

## 12. LLM 调用重试机制

### 12.1 为什么需要重试

LLM API 调用可能因网络波动、服务端限流、临时故障等原因失败。直接抛错给用户会严重影响体验。

### 12.2 指数退避重试

```typescript
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 500

private async callLLMWithRetry(messages: Message[]): Promise<ChatCompletionResult> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await this.llm.chatCompletion({ messages, tools, ... })
    } catch (err) {
      lastError = err as Error
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
        // 第 1 次重试等 500ms，第 2 次等 1000ms，第 3 次等 2000ms
        console.warn(`LLM 调用失败（第 ${attempt}/${MAX_RETRIES} 次），${delay}ms 后重试`)
        await sleep(delay)
      }
    }
  }

  throw lastError ?? new Error('LLM 调用失败，已达最大重试次数')
}
```

### 12.3 关键注意事项

- **最大重试次数**：3 次足够覆盖临时故障，过多会延长用户等待时间
- **指数退避**：`500ms → 1000ms → 2000ms`，给服务端恢复时间
- **日志记录**：每次重试都打印日志，方便排查问题

---

## 13. 代码重构：消除重复

### 13.1 问题

`chat()` 和 `chatStream()` 两个方法中存在大量重复逻辑：
- 用户消息预处理（追加、持久化、标题更新）
- 工具调用处理（解析 tool_calls、执行工具、追加结果）
- ReAct 日志输出
- 兜底回答

### 13.2 解决方案：提取公共方法

```typescript
class CookingAgent {
  // 用户消息预处理（chat / chatStream 共用）
  private prependUserMessage(messages, sessionId, userMessage): void { ... }

  // 工具调用处理（chat / chatStream 共用）
  private async handleToolCalls(messages, sessionId, ...): Promise<number> { ... }

  // ReAct 循环日志
  private logReActSummary(reactLog, totalToolCalls): void { ... }

  // 兜底回答
  private fallbackAnswer(messages, sessionId): ChatResult { ... }
}
```

重构后 `chat()` 从 ~120 行缩减到 ~60 行，`chatStream()` 从 ~150 行缩减到 ~70 行。

---

## 14. LLM Provider 抽象层

### 14.1 设计目标

将 LLM 调用抽象为统一接口，支持多 Provider 切换（DeepSeek、OpenAI 等），业务层无需关心具体实现。

### 14.2 接口定义

```typescript
export interface LLMProvider {
  readonly name: string
  readonly model: string
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>
  chatCompletionStream(
    params: ChatCompletionParams,
    onChunk: (chunk: string) => void,
    onDone: (result: ChatCompletionResult) => void,
    onError: (err: Error) => void,
  ): Promise<void>
}
```

### 14.3 Provider 注册

```typescript
// llm/index.ts
const providers: Map<string, LLMProvider> = new Map()

function initProviders(): void {
  // DeepSeek Chat（默认）
  if (process.env.DEEPSEEK_API_KEY) {
    providers.set('deepseek-chat', new DeepSeekProvider({ ... }))
  }
  // DeepSeek Reasoner（复杂推理）
  if (process.env.DEEPSEEK_REASONER_KEY) {
    providers.set('deepseek-reasoner', new DeepSeekProvider({ ... }))
  }
  // OpenAI（可选）
  if (process.env.OPENAI_API_KEY) {
    providers.set('openai', new DeepSeekProvider({ ... }))
  }
}
```

### 14.4 模型分级路由

```typescript
type ModelTier = 'fast' | 'smart' | 'vision'

function getProviderForTier(tier: ModelTier): LLMProvider {
  switch (tier) {
    case 'fast':   return deepseek-chat      // 快速响应
    case 'smart':  return deepseek-reasoner  // 复杂推理
    case 'vision': return openai             // 多模态
  }
}
```

---

## 15. 用户画像系统

### 15.1 功能

- 存储用户偏好：过敏食材、膳食模式、烹饪水平、忌口食材、卡路里目标
- 每次对话时将画像注入 system prompt，让 LLM 了解用户需求

### 15.2 数据模型

```typescript
interface UserProfile {
  id: string
  allergies: string[]      // 过敏食材：['花生', '海鲜']
  diet_type: string        // 膳食模式：'生酮' | '地中海' | '素食' | ...
  skill_level: string      // 烹饪水平：'beginner' | 'intermediate' | 'advanced'
  disliked: string[]       // 忌口食材：['香菜', '苦瓜']
  calorie_goal: number     // 每日卡路里目标
}
```

### 15.3 Prompt 注入

```typescript
// user-profile.repository.ts
buildProfilePrompt(): string {
  const profile = this.getOrCreate()
  let prompt = '\n【用户偏好】\n'
  if (profile.allergies.length > 0) {
    prompt += `- 过敏食材：${profile.allergies.join('、')}（绝对不能推荐含这些食材的菜）\n`
  }
  if (profile.diet_type) {
    prompt += `- 膳食模式：${profile.diet_type}\n`
  }
  // ...
  return prompt
}
```

---

## 16. RAG 知识库

### 16.1 设计

基于 TF-IDF 的轻量级检索增强生成（RAG），在 LLM 调用前先检索相关知识，减少幻觉。

### 16.2 检索流程

```
用户问题 → 分词 → TF-IDF 检索 → topK 文档 → 注入 LLM context
```

### 16.3 知识分类

| 分类 | 内容 | 示例 |
|------|------|------|
| recipe | 菜谱知识 | 红烧肉做法、宫保鸡丁配方 |
| technique | 烹饪技巧 | 炒菜不粘锅、火候控制 |
| ingredient | 食材知识 | 食材搭配、营养价值 |

---

## 17. 食材替换系统

### 17.1 功能

当用户询问"没有 XX 能用什么代替"时，从内置的 18 种常见食材替换规则中查找替代方案。

### 17.2 数据结构

```typescript
interface SubstituteEntry {
  ingredient: string           // 原食材
  category: string             // 分类：调料/食材
  substitutes: Substitute[]    // 替代方案列表
}

interface Substitute {
  name: string      // 替代品名称
  ratio: string     // 用量比例
  note: string      // 使用说明
  best_for: string[] // 最适合的场景
}
```

---

## 18. 膳食模式适配

### 18.1 功能

支持 8 种常见膳食模式的禁忌食材和替代方案：
生酮、地中海、素食、低卡、无麸质、低钠、高蛋白、糖尿病友好

### 18.2 工具定义

```typescript
export const diet_tool: Tool = {
  name: 'check_diet_compatibility',
  description: '检查某个菜谱或食材是否符合特定膳食模式...',
  parameters: {
    type: 'object',
    properties: {
      dish_or_ingredients: { type: 'string', description: '菜名或食材列表' },
      diet_type: { type: 'string', description: '膳食模式' },
    },
    required: ['dish_or_ingredients', 'diet_type'],
  },
}
```