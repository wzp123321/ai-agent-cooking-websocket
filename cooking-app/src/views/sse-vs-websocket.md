# SSE vs WebSocket — 选型分析与实践建议

> 本文档梳理 SSE (Server-Sent Events) 与 WebSocket 的技术差异、优劣势对比以及不同场景下的选型建议，结合厨神小助项目的实际架构给出理由。

> **当前实现**：本项目已从 SSE 迁移到 WebSocket 实现流式对话。

---

## 一、协议层面

### 1.1 SSE（Server-Sent Events）

```
┌─────────┐                         ┌──────────────┐
│  浏览器  │ ── HTTP GET ──────────→ │  HTTP Server  │
│         │ ←── text/event-stream ── │               │
│ (客户端) │ ←── data: {...}\n\n ─── │  (服务端)      │
│         │ ←── data: {...}\n\n ─── │               │
│         │ ←── ...                │               │
│         │ ←── res.end()          │               │
└─────────┘                         └──────────────┘

基于协议：HTTP/1.1 或 HTTP/2
内容类型：text/event-stream
消息格式：event: <type>\ndata: <json>\n\n
方向：    服务端 → 客户端（单向推送）
本地连接：EventSource API
连接复用：HTTP/2 下同一 TCP 连接可承载多个 SSE 流
```

SSE 本质上是**一个永不结束的 HTTP 响应**。服务端保持响应流开启，持续写入事件数据，直到 `res.end()` 或连接断开。

### 1.2 WebSocket（当前实现）

```
┌─────────┐                         ┌──────────────┐
│  浏览器  │ ── HTTP Upgrade ──────→ │  HTTP Server  │
│         │ ←── 101 Switching ───── │               │
│ (客户端) │ ═══ ws:// 全双工 ══════ │  (服务端)      │
│         │ ←── text/binary frame ─ │               │
│         │ ── text/binary frame ─→ │               │
│         │ ←── ping frame ──────── │               │
│         │ ── pong frame ────────→ │               │
└─────────┘                         └──────────────┘

基于协议：独立协议（ws:// / wss://），通过 HTTP Upgrade 握手建立
数据格式：文本帧（UTF-8）或二进制帧（Blob/ArrayBuffer）
方向：    客户端 ↔ 服务端（全双工）
本地连接：WebSocket API
连接复用：每个 WebSocket 独占一个 TCP 连接
```

WebSocket 是**独立的双向通信协议**。通过一次 HTTP Upgrade 握手后，协议从 HTTP 切换为 WebSocket，两端可以随时主动发送数据帧。

---

## 二、核心差异对比

| 维度 | SSE | WebSocket（当前使用） |
|------|-----|---------------------|
| **通信方向** | 单向：Server → Client | 全双工：Client ↔ Server |
| **底层协议** | HTTP/1.1 或 HTTP/2 | 独立协议 (ws:// / wss://) |
| **数据格式** | 纯文本 (UTF-8) | 文本帧 + 二进制帧 |
| **自动重连** | EventSource API 原生支持 | 需手动实现 |
| **二进制支持** | ❌ 不支持 | ✅ 原生支持 Blob/ArrayBuffer |
| **Nginx 兼容** | 完全透明 | 需配置 Upgrade/Connection 头 |
| **HTTP/2 多路复用** | ✅ 可复用 | ❌ 独占连接 |
| **浏览器兼容** | IE 不支持 | 所有现代浏览器支持 |
| **每消息开销** | 较高（文本格式） | 较低（帧头仅 2-10 字节） |

---

## 三、为什么本项目迁移到 WebSocket

### 3.1 全双工能力
WebSocket 支持双向通信，为未来功能扩展预留空间：
- 用户在 AI 回复过程中打断、追问
- 实时协作菜谱编辑
- 语音对话功能（二进制数据支持）

### 3.2 更低的延迟和开销
WebSocket 握手后直接传输数据帧，避免了每次请求的 HTTP 头部开销，降低了延迟。

### 3.3 更好的错误处理
WebSocket 提供更丰富的连接状态管理：
- `onopen`：连接建立
- `onmessage`：收到消息
- `onclose`：连接关闭
- `onerror`：错误处理

### 3.4 项目现状

本项目已完成 WebSocket 迁移，具体改动：

**服务端（cooking-agent）**：
- 使用 `ws` 库创建 WebSocket 服务器
- 端点：`/api/chat/ws`
- 消息格式：`{ "type": "...", "content": "...", "sessionId": "..." }`

**客户端（cooking-app）**：
- 使用原生 WebSocket API
- 支持 `AbortController` 取消请求
- 完整的错误处理和连接管理

---

## 四、场景选型决策树

```
                        需要双向实时通信？
                       /                \
                     是                  否
                     │                   │
                     ▼                   ▼
            需要极低延迟？          只需要服务端推送？
           /          \             /             \
         是            否         是               否
         │             │          │                │
         ▼             ▼          ▼                ▼
      游戏        在线协作       SSE             普通 HTTP
      WebSocket   WebSocket    （单向推送）      （轮询/REST）
```

---

## 五、WebSocket 消息格式

### 客户端发送

```json
{
  "type": "chat",
  "message": "红烧肉怎么做？",
  "sessionId": "user_123_session_abc"
}
```

### 服务端发送

**Chunk（流式片段）**：
```json
{ "type": "chunk", "content": "好的" }
```

**Done（传输完成）**：
```json
{ "type": "done", "content": "好的，红烧肉的做法如下...", "sessionId": "user_123_session_abc" }
```

**Error（错误）**：
```json
{ "type": "error", "error": "服务端内部错误" }
```

---

## 六、总结

| | SSE | WebSocket（当前使用） |
|------|-----|---------------------|
| **一句话总结** | 一个永不结束的 HTTP 响应 | 一次 HTTP 握手后的独立双向通道 |
| **最适合** | 单向推送：通知、进度更新 | 双向实时：聊天、协作、游戏 |
| **本项目适用度** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐（为未来扩展预留空间） |
| **前端依赖** | 零（fetch） | 原生 WebSocket API |
| **后端改动** | 无（Express 原生支持） | 需引入 ws 库 |