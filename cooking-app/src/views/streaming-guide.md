# WebSocket 流式回答渲染指南

> 本文档梳理厨神小助智能体中 WebSocket 流式回答的完整渲染链路、各环节细节以及常见问题与解决思路。

> **当前实现**：基于 WebSocket 的全双工流式通信，支持心跳检测、自动重连、消息确认机制

---

## 一、整体架构总览

```
┌─────────────────────── 后端 (Express + WebSocket + DeepSeek) ───────────────────────┐
│                                                                                     │
│  WebSocket /api/chat/ws     ← 用户消息 + 消息确认 (ACK)                              │
│       │                                                                             │
│       ▼                                                                             │
│  agent.chatStream()        ← ReAct 推理循环                                         │
│       │                                                                             │
│       │  ┌── step 1~N：工具调用（非流式，内部 ReAct loop）                         │
│       │  │   · callLLMWithRetry → OpenAI SDK chat.completions.create                │
│       │  │   · 返回 tool_calls → executeTools → 结果追加到 messages                │
│       │  │   · 工具调用结果不会流式推送给前端                                      │
│       │  └── 直到 LLM 不再返回 tool_calls → 进入 answer 阶段                       │
│       │                                                                             │
│       ▼                                                                             │
│  llm.chatCompletionStream() ← 真正的流式阶段                                        │
│       │   · stream: true                                                            │
│       │   · for await (const chunk of stream)                                       │
│       │   · onChunk(delta.content) 每次推一个 token 片段                           │
│       ▼                                                                             │
│  ws.send({ type: 'chunk', content })  ← WebSocket 推送                             │
│       │                                                                             │
│       ▼                                                                             │
│  ws.send({ type: 'done', content, sessionId })  ← 通知前端流结束                    │
│       │                                                                             │
│       ▼                                                                             │
│  定时发送 ping → 心跳检测（30秒间隔，10秒超时）                                      │
│                                                                                     │
└──────────────────────────────────┬──────────────────────────────────────────────────┘
                                   │ WebSocket (ws://)
                                   ▼
┌─────────────────────── 前端 (Vue + Pinia) ──────────────────────────────────────────┐
│                                                                                     │
│  sendChatStream()           ← 原生 WebSocket API + 自动重连                          │
│       │   · new WebSocket(url)                                                     │
│       │   · onmessage → JSON.parse → 按 type 分派                                  │
│       │   · type='chunk' → onChunk, type='done' → onDone                           │
│       │   · 响应 ping → 发送 pong                                                  │
│       │   · 连接中断 → 指数退避重连（最多5次）                                       │
│       ▼                                                                             │
│  useConversation.sendMessage()  ← 状态编排层                                        │
│       │   · 创建 userMsg（存入 store.sessions[x].messages）                        │
│       │   · 创建空 aiMsg（streaming: true）                                        │
│       │   · onChunk → aiMsg.content += chunk                                       │
│       │   · onDone  → aiMsg.streaming = false                                      │
│       ▼                                                                             │
│  MessageBubble.vue          ← 渲染层                                                │
│       │   · marked.parse(content) → v-html                                        │
│       │   · streaming === true → 显示闪烁光标                                      │
│       ▼                                                                             │
│  MessageList.vue + useScrollToBottom  ← 滚到底层                                    │
│       │   · watch(messages.map(m => m.content).join(''))                           │
│       │   · nextTick → scrollTop = scrollHeight                                    │
│                                                                                     │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、各环节详细说明

### 2.1 后端：WebSocket 服务端推送

| 文件 | 位置 | 职责 |
|------|------|------|
| [index.ts](file:///e:/workspace/private/ai-agent-cooking-websocket/cooking-agent/src/index.ts) | WebSocket `/api/chat/ws` | WebSocket 服务器配置、消息分发、心跳检测 |
| [agent.ts](file:///e:/workspace/private/ai-agent-cooking-websocket/cooking-agent/src/agent.ts) | `chatStream()` | ReAct 循环 + 最终流式生成 |
| [deepseek.ts](file:///e:/workspace/private/ai-agent-cooking-websocket/cooking-agent/src/llm/deepseek.ts) | `chatCompletionStream()` | OpenAI SDK 流式调用，逐 chunk 回调 |

**WebSocket 消息格式：**

```json
// 客户端发送 - 聊天消息
{ "type": "chat", "message": "红烧肉怎么做", "sessionId": "default", "messageId": "12345_abc" }

// 客户端发送 - 心跳响应
{ "type": "pong" }

// 服务端发送 - 流式片段
{ "type": "chunk", "content": "好的" }

// 服务端发送 - 传输完成
{ "type": "done", "content": "好的，红烧肉的做法如下...", "sessionId": "default" }

// 服务端发送 - 错误
{ "type": "error", "error": "DeepSeek API 超时" }

// 服务端发送 - 心跳检测
{ "type": "ping" }

// 服务端发送 - 消息确认
{ "type": "ack", "messageId": "12345_abc" }

// 服务端发送 - 欢迎消息
{ "type": "welcome", "message": "连接成功，准备接收消息" }
```

**心跳检测机制：**

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 心跳间隔 | 30 秒 | 服务端每 30 秒发送一次 ping |
| ping 超时 | 10 秒 | 超过 10 秒未收到 pong 响应则断开连接 |
| 空闲超时 | 10 分钟 | 长时间无活动自动断开连接 |

**ReAct 与流式的关系：**

```
用户消息 "红烧肉怎么做"
  │
  ├── ReAct Step 1: LLM 返回 tool_calls → executeTools → 结果追加
  ├── ReAct Step 2: LLM 返回 tool_calls → executeTools → 结果追加
  ├── ...
  └── ReAct Step N: LLM 不再返回 tool_calls → 进入 chatCompletionStream
        │
        └── 只有这最后一步是流式的
```

> **关键限制**：工具调用阶段不会向前端推送任何中间状态。前端的 AI 消息气泡会从空内容开始，等流式阶段才出现文字。

---

### 2.2 前端：WebSocket 接收与解析

| 文件 | 位置 | 职责 |
|------|------|------|
| [chat.ts](file:///e:/workspace/private/ai-agent-cooking-websocket/cooking-app/src/api/chat.ts) | `sendChatStream()` | 原生 WebSocket + JSON 解析 + 自动重连 |
| [useConversation.ts](file:///e:/workspace/private/ai-agent-cooking-websocket/cooking-app/src/hooks/useConversation.ts) | `sendMessage()` | 消息状态编排 + AI 回复增量追加 |

**WebSocket 核心逻辑（含自动重连）：**

```typescript
const ws = new WebSocket(wsUrl)
const messageId = generateMessageId()  // 生成唯一消息 ID

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'chat', message, sessionId, messageId }))
}

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  switch (data.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }))  // 响应心跳
      break
    case 'ack':
      console.log(`消息 ${data.messageId} 已确认`)
      break
    case 'chunk':
      onChunk(data.content)
      break
    case 'done':
      onDone(data.content)
      break
    case 'error':
      onError(new Error(data.error))
      break
  }
}

ws.onclose = (event) => {
  // 指数退避自动重连
  if (reconnectionAttempts < MAX_RECONNECT_ATTEMPTS) {
    const delay = INITIAL_DELAY * Math.pow(2, reconnectionAttempts)
    setTimeout(() => createConnection(), delay)
    reconnectionAttempts++
  }
}
```

**自动重连策略：**

| 参数 | 值 | 说明 |
|------|-----|------|
| 最大重连次数 | 5 次 | 超过则放弃重连 |
| 初始延迟 | 1 秒 | 第一次重连等待时间 |
| 最大延迟 | 30 秒 | 避免过长等待 |
| 策略 | 指数退避 + 随机抖动 | `delay = 1s * 2^attempt + jitter` |

**Vue 响应式更新链路：**

```
onChunk(chunk)
  → aiMsg.content += chunk        // ← reactive 数组元素的属性变更
  → computed: messages             // ← Pinia getter 依赖追踪
  → MessageBubble :message="msg"  // ← Props 传递
  → computed: renderedContent       // ← marked.parse(content)
  → v-html                          // ← DOM 更新
```

---

### 2.3 前端：Markdown 渲染与打字机效果

| 文件 | 组件/函数 | 职责 |
|------|----------|------|
| [MessageBubble.vue](file:///e:/workspace/private/ai-agent-cooking-websocket/cooking-app/src/components/MessageBubble.vue) | 气泡组件 | 区分 user/assistant，渲染 Markdown，闪烁光标 |
| [MessageList.vue](file:///e:/workspace/private/ai-agent-cooking-websocket/cooking-app/src/components/MessageList.vue) | 消息列表 | `v-for` 渲染所有消息 |
| [useScrollToBottom.ts](file:///e:/workspace/private/ai-agent-cooking-websocket/cooking-app/src/hooks/useScrollToBottom.ts) | 自动滚到底 | watch 内容变化 → nextTick → scrollTop |

**打字机光标效果：**

```html
<div class="markdown-body" v-html="renderedContent" />
<span v-if="message.streaming" class="typing-cursor" />
```

```css
.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 1.1em;
  background: var(--accent);
  margin-left: 2px;
  animation: blink 0.8s step-end infinite;
}
```

---

## 三、常见问题与解决思路

### 3.1 WebSocket 连接层面

| 问题 | 现象 | 原因 | 解决思路 |
|------|------|------|----------|
| **连接被拒绝** | WebSocket connection failed | 后端服务未启动或端口占用 | 检查服务状态和端口配置 |
| **连接中断** | 流式回答中途停止 | 后端崩溃或网络问题 | ✅ **已实现** 自动重连机制（指数退避） |
| **ping 超时** | 连接被强制断开 | 网络超时或客户端无响应 | ✅ **已实现** 心跳检测 + 超时断开 |
| **空闲超时** | 长时间无操作后断开 | 服务器资源管理策略 | ✅ **已实现** 10分钟空闲自动断开 |
| **Nginx 配置问题** | 连接建立后立即断开 | 未配置 Upgrade 头 | 添加 proxy_set_header Upgrade |
| **CORS 问题** | 跨域错误 | WebSocket 握手被拦截 | 配置 CORS 允许 WebSocket |

### 3.2 消息解析层面

| 问题 | 现象 | 原因 | 解决思路 |
|------|------|------|----------|
| **JSON 解析失败** | 控制台警告 | 消息格式不正确 | `try/catch` 包裹 JSON.parse |
| **消息类型错误** | 无法识别消息 | type 字段缺失或错误 | 增加类型检查 |
| **消息丢失** | 内容不完整 | 网络抖动或消息未确认 | ✅ **已实现** 消息确认（ACK）机制 |

### 3.3 渲染性能层面

| 问题 | 现象 | 原因 | 解决思路 |
|------|------|------|----------|
| **Markdown 重复解析** | 长回复卡顿 | 每次 chunk 触发全量解析 | 节流批量更新 |
| **滚动卡顿** | 流式过程中滚动不丝滑 | 高频触发 scrollTop | 使用 requestAnimationFrame |
| **v-html 安全风险** | XSS 潜在威胁 | HTML 直接注入 DOM | 考虑 DOMPurify 过滤 |

---

## 四、数据流时序图

```
 用户点击发送
      │
      ▼
 InputBar.handleSend()
      │
      ├─ inputText = ""                          // 清空输入框
      ├─ useConversation.sendMessage(content)
      │     │
      │     ├─ store.loading = true               // 按钮立刻 disabled
      │     ├─ session.messages.push(userMsg)     // 用户消息立刻可见
      │     ├─ session.messages.push(aiMsg)       // 空 AI 气泡立刻可见
      │     │
      │     ├─ sendChatStream(content, ..., {onChunk, onDone, onError})
      │     │     │
      │     │     ├─ new WebSocket(url)
      │     │     │     │
      │     │     │     └── ws.onopen → 发送消息 (含 messageId)
      │     │     │           │
      │     │     │           └── 后端 → ack (messageId)
      │     │     │                 │
      │     │     │                 └── 后端 ReAct 循环（无前端可见输出）
      │     │     │                       │
      │     │     │                       └── 开始流式输出
      │     │     │                             │
      │     │     │   chunk① ─────────────────▶ aiMsg.content = "红"
      │     │     │   chunk② ─────────────────▶ aiMsg.content = "红烧"
      │     │     │   chunk③ ─────────────────▶ aiMsg.content = "红烧肉"
      │     │     │   ...                                              → 逐字打印
      │     │     │   done   ─────────────────▶ aiMsg.streaming = false
      │     │     │                             store.loading = false
      │     │     │
      │     │     └─ onError ─────────────────▶ ElMessage.error('重连失败，请检查网络')
      │     │                                  store.loading = false
      │     │
      │     └─ 定时 ping/pong 心跳检测
```

---

## 五、当前实现状态清单

| 优先级 | 功能 | 状态 | 说明 |
|--------|------|------|------|
| 🔴 P0 | **连接中断错误提示** | ✅ 已实现 | 捕获 WebSocket 错误并显示提示 |
| 🔴 P0 | **AbortError 状态重置** | ✅ 已实现 | onError 回调中重置 loading 和 streaming 状态 |
| 🟡 P1 | **WebSocket 自动重连** | ✅ 已实现 | 指数退避策略，最多重连 5 次 |
| 🟡 P1 | **服务端心跳检测** | ✅ 已实现 | 30 秒间隔 ping，10 秒超时断开 |
| 🟡 P1 | **客户端心跳响应** | ✅ 已实现 | 响应服务端 ping 发送 pong |
| 🟡 P1 | **消息确认机制** | ✅ 已实现 | 服务端收到消息后返回 ACK |
| 🟡 P1 | **空闲超时断开** | ✅ 已实现 | 10 分钟无活动自动断开 |
| 🟡 P1 | **优雅关闭** | ✅ 已实现 | SIGINT 信号处理，通知客户端关闭 |
| 🟡 P1 | **ReAct 阶段无反馈** | 📋 待实现 | 发送 status 事件显示"正在思考..." |
| 🟢 P2 | **消息持久化** | 📋 待实现 | 消息丢失时可重试 |

---

## 六、WebSocket 优势总结

1. **全双工通信**：支持客户端和服务端双向实时通信
2. **更低延迟**：握手后直接传输，无 HTTP 头部开销
3. **更好的错误处理**：丰富的事件回调（onopen, onmessage, onclose, onerror）
4. **心跳检测**：内置 ping/pong 机制，及时检测死连接
5. **自动重连**：指数退避策略保证连接稳定性
6. **消息确认**：ACK 机制确保消息可靠传输
7. **二进制支持**：原生支持 Blob/ArrayBuffer，适合语音、图片等数据
8. **未来扩展**：为实时协作、语音对话等功能预留空间

---

## 七、Nginx 部署配置参考

如需使用 Nginx 反向代理 WebSocket，需添加以下配置：

```nginx
location /api/chat/ws {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;  # 长连接超时时间
    proxy_send_timeout 3600s;
}
```