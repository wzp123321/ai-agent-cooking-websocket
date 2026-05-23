/**
 * ============================================================
 * cooking-agent 入口文件 — Express HTTP + WebSocket 服务
 * ============================================================
 *
 * 功能概述：
 *   提供 HTTP REST API 和 WebSocket 流式接口，供前端应用调用做菜智能体。
 *
 * 接口清单：
 *   HTTP:
 *     GET  /health              - 健康检查（前端轮询判断 Agent 是否在线）
 *     POST /api/chat            - 普通对话（完整返回）
 *     POST /api/vision/chat     - 图片识别对话
 *     GET  /api/sessions        - 会话列表
 *     GET  /api/history/:id     - 获取对话历史
 *     DELETE /api/session/:id   - 清除指定会话
 *     GET  /api/profile         - 获取用户画像
 *     PUT  /api/profile         - 更新用户画像
 *   WebSocket:
 *     /api/chat/ws              - 流式对话（WebSocket）
 *
 * 技术选型：
 *   - Express：轻量 HTTP 框架，路由清晰，middleware 机制完善
 *   - CORS：允许前端跨域访问
 *   - WebSocket（ws）：双向通信协议，支持流式推送
 *
 * WebSocket 消息格式：
 *   客户端发送：
 *     { "type": "chat", "message": "用户消息", "sessionId": "会话ID", "messageId": "消息ID" }
 *   服务端发送：
 *     { "type": "chunk", "content": "部分文本" }
 *     { "type": "done", "content": "完整文本", "sessionId": "xxx" }
 *     { "type": "error", "error": "错误描述" }
 *     { "type": "ping" } - 心跳检测
 *     { "type": "pong" } - 心跳响应
 *     { "type": "ack", "messageId": "消息ID" } - 消息确认
 */

import express, { type Request, type Response } from 'express'
import http from 'http'
import cors from 'cors'
import WebSocket, { type WebSocket as WebSocketType } from 'ws'
import 'dotenv/config'
import { CookingAgent } from './agent'
import { runMigrations } from './db/migrate'
import { userProfileRepo } from './db/user-profile.repository'
import { analyzeImage } from './vision'
import type { ChatRequestBody } from './types'

// ─── Express 应用初始化 ────────────────────────────────────

const app = express()
const server = http.createServer(app)
const PORT = Number(process.env.PORT) || 9002

// WebSocket 配置常量
const WS_HEARTBEAT_INTERVAL = 30000 // 心跳间隔 30 秒
const WS_PING_TIMEOUT = 10000 // ping 超时 10 秒
const WS_MAX_IDLE_TIME = 600000 // 最大空闲时间 10 分钟

console.log('═══════════════════════════════════════════════')
console.log('   🍳 厨神小助 Agent 服务启动中…')
console.log('═══════════════════════════════════════════════')

// ─── 中间件配置 ────────────────────────────────────────────

// CORS：允许所有来源的跨域请求（开发环境）
// 生产环境建议配置为具体的前端域名，如：origin: 'http://localhost:5173'
app.use(cors())
console.info('[Middleware] ✅ CORS 已启用')

// JSON 请求体解析：限制 20MB 防止大请求攻击
app.use(express.json({ limit: '20mb' }))
console.info('[Middleware] ✅ JSON 解析中间件已启用（限制 20MB）')

// 请求日志中间件
app.use((req: Request, _res: Response, next: express.NextFunction) => {
  const start = Date.now()
  const { method, url } = req

  _res.on('finish', () => {
    const duration = Date.now() - start
    const { statusCode } = _res
    const level = statusCode >= 400 ? '⚠️' : '📥'
    console.info(`[HTTP] ${level} ${method} ${url} → ${statusCode} (${duration}ms)`)
  })

  next()
})

// 简易请求限流（基于 IP，每秒最多 10 个请求）
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 1000

app.use((req: Request, res: Response, next: express.NextFunction) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown'
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    next()
    return
  }

  entry.count++
  if (entry.count > RATE_LIMIT_MAX) {
    console.warn(`[RateLimit] ⚠️ IP ${ip} 超过限流阈值（${entry.count}/${RATE_LIMIT_WINDOW_MS}ms）`)
    res.status(429).json({ error: '请求过于频繁，请稍后再试' })
    return
  }

  next()
})

// 定期清理限流记录（每 60 秒）
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip)
  }
}, 60_000)
console.info('[Middleware] ✅ 请求限流已启用（每 IP 每秒最多 10 次）')

// ─── 数据库初始化 ──────────────────────────────────────────

// ─── Agent 初始化 ──────────────────────────────────────────

let agent: CookingAgent

async function start(): Promise<void> {
  await runMigrations()
  console.info('[DB] ✅ 迁移检查完成')

  try {
    agent = new CookingAgent()
    console.log('✅ 厨神小助 Agent 初始化成功')
  } catch (err) {
    console.error('❌ Agent 初始化失败：', (err as Error).message)
    console.error('💡 请检查 .env 文件中的 DEEPSEEK_API_KEY 是否正确配置')
    process.exit(1)
  }

// ─── WebSocket 服务器配置 ──────────────────────────────────

const wss = new WebSocket.Server({ 
  server, 
  path: '/api/chat/ws',
  maxPayload: 10485760, // 10MB 消息大小限制
})

// 存储活跃的 WebSocket 连接及元数据
interface ConnectionMetadata {
  ws: WebSocketType
  lastActivity: number
  pingTimeout?: ReturnType<typeof setTimeout>
}
const activeConnections = new Map<WebSocketType, ConnectionMetadata>()

/**
 * 发送 ping 心跳
 */
function sendPing(ws: WebSocketType): void {
  if (ws.readyState !== WebSocket.OPEN) return
  
  const metadata = activeConnections.get(ws)
  if (!metadata) return

  // 设置 ping 超时
  metadata.pingTimeout = setTimeout(() => {
    console.warn('[WebSocket] ⚠️ ping 超时，强制关闭连接')
    ws.terminate()
  }, WS_PING_TIMEOUT)

  ws.send(JSON.stringify({ type: 'ping' }))
}

/**
 * 清理连接资源
 */
function cleanupConnection(ws: WebSocketType): void {
  const metadata = activeConnections.get(ws)
  if (metadata) {
    if (metadata.pingTimeout) {
      clearTimeout(metadata.pingTimeout)
    }
    activeConnections.delete(ws)
  }
}

// 定期发送心跳（每 30 秒）
const heartbeatInterval = setInterval(() => {
  const now = Date.now()
  
  activeConnections.forEach((metadata, ws) => {
    // 检查空闲超时
    if (now - metadata.lastActivity > WS_MAX_IDLE_TIME) {
      console.info('[WebSocket] ⏰ 连接空闲超时，自动断开')
      ws.close(1000, 'Idle timeout')
      return
    }

    // 发送心跳
    sendPing(ws)
  })
}, WS_HEARTBEAT_INTERVAL)

wss.on('connection', (ws: WebSocketType) => {
  console.info('[WebSocket] 🔌 新连接建立')

  // 初始化连接元数据
  activeConnections.set(ws, {
    ws,
    lastActivity: Date.now(),
  })

  ws.on('message', async (data: WebSocket.Data) => {
    // 更新活动时间
    const metadata = activeConnections.get(ws)
    if (metadata) {
      metadata.lastActivity = Date.now()
    }

    let parsedData: { 
      type: string; 
      message?: string; 
      sessionId?: string;
      messageId?: string;
    }

    try {
      parsedData = JSON.parse(data.toString())
    } catch {
      console.warn('[WebSocket] ⚠️ 消息解析失败')
      ws.send(JSON.stringify({ type: 'error', error: '无效的消息格式' }))
      return
    }

    // 心跳响应
    if (parsedData.type === 'pong') {
      console.debug('[WebSocket] 🏓 收到 pong 响应')
      // 清除 ping 超时定时器
      if (metadata?.pingTimeout) {
        clearTimeout(metadata.pingTimeout)
        metadata.pingTimeout = undefined
      }
      return
    }

    if (parsedData.type !== 'chat') {
      console.warn('[WebSocket] ⚠️ 未知消息类型:', parsedData.type)
      ws.send(JSON.stringify({ type: 'error', error: '未知消息类型' }))
      return
    }

    const { message, sessionId = 'default', messageId } = parsedData

    if (!message || typeof message !== 'string' || !message.trim()) {
      console.warn('[WebSocket] ⚠️ 参数校验失败：message 为空或无效')
      ws.send(JSON.stringify({ type: 'error', error: '请提供有效的 message 字段' }))
      return
    }

    // 发送消息确认（ACK）
    if (messageId) {
      ws.send(JSON.stringify({ type: 'ack', messageId }))
    }

    console.info(`[WebSocket] 📥 收到消息 [${sessionId}]：${message.slice(0, 50)}…`)

    const abortController = new AbortController()
    let finished = false
    let hasStreamed = false

    // 监听连接关闭事件
    const handleClose = () => {
      if (!finished && hasStreamed) {
        console.info(`[WebSocket] 🛑 客户端断开连接，触发中止 [${sessionId}]`)
        abortController.abort()
      }
    }

    ws.once('close', handleClose)

    try {
      await agent.chatStream(
        message.trim(),
        sessionId,
        (chunk) => {
          hasStreamed = true
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'chunk', content: chunk }))
          }
        },
        (full) => {
          finished = true
          ws.removeListener('close', handleClose)
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'done', content: full, sessionId }))
            console.info(`[WebSocket] ✅ 传输完成 [${sessionId}]`)
          }
        },
        abortController.signal,
      )
    } catch (err) {
      finished = true
      ws.removeListener('close', handleClose)
      console.error(`[WebSocket] ❌ 出错 [${sessionId}]：${(err as Error).message}`)
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', error: (err as Error).message }))
      }
    }
  })

  ws.on('close', (code: number, reason: string) => {
    cleanupConnection(ws)
    console.info(`[WebSocket] 🔌 连接已关闭 (${code}): ${reason || '正常关闭'}`)
  })

  ws.on('error', (error) => {
    cleanupConnection(ws)
    console.error('[WebSocket] ❌ 连接错误：', error)
  })

  // 发送欢迎消息
  ws.send(JSON.stringify({ type: 'welcome', message: '连接成功，准备接收消息' }))
})

// 服务器关闭时清理
process.on('SIGINT', () => {
  clearInterval(heartbeatInterval)
  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down')
  })
  server.close(() => {
    console.info('[Server] 🛑 服务已关闭')
    process.exit(0)
  })
})

console.info('[WebSocket] ✅ WebSocket 服务器已启用（路径：/api/chat/ws）')
console.info('[WebSocket] ⚡ 心跳检测已启用（间隔：30s，超时：10s）')
console.info('[WebSocket] ⏰ 空闲超时已启用（10分钟）')

// ─── 路由定义 ──────────────────────────────────────────────

/**
 * GET /health
 * ────────────────────────────────────────────────────────────
 * 健康检查接口。
 */
app.get('/health', (_req: Request, res: Response) => {
  console.debug('[Route] GET /health 被调用')
  res.json({
    status: 'ok',
    agent: '厨神小助',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    wsConnections: activeConnections.size,
  })
})

/**
 * POST /api/chat
 * ────────────────────────────────────────────────────────────
 * 普通对话接口（非流式，一次性返回完整结果）。
 */
app.post(
  '/api/chat',
  async (req: Request<object, object, ChatRequestBody>, res: Response) => {
    const { message, sessionId = 'default' } = req.body

    console.info(`[Route] POST /api/chat [${sessionId}] 收到请求`)

    if (!message || typeof message !== 'string' || !message.trim()) {
      console.warn(`[Route] ⚠️  参数校验失败：message 为空或无效`)
      res.status(400).json({ error: '请提供有效的 message 字段' })
      return
    }

    try {
      const result = await agent.chat(message.trim(), sessionId)

      console.info(`[Route] ✅ /api/chat [${sessionId}] 返回成功`)
      res.json(result)
    } catch (err) {
      console.error(`[Route] ❌ /api/chat [${sessionId}] 调用出错：`, err)
      res.status(500).json({
        error: '调用 DeepSeek API 失败',
        detail: (err as Error).message,
      })
    }
  },
)

/**
 * POST /api/vision/chat
 * ────────────────────────────────────────────────────────────
 * 图片识别对话接口。
 */
app.post(
  '/api/vision/chat',
  async (req: Request, res: Response) => {
    const { image, message } = req.body

    if (!image || typeof image !== 'string') {
      res.status(400).json({ error: '请提供有效的 image 字段（base64 编码）' })
      return
    }

    console.info(`[Route] POST /api/vision/chat 收到图片请求`)

    const result = await analyzeImage({
      imageBase64: image,
      message: message?.trim() || undefined,
    })

    if (!result.success) {
      res.status(500).json({ error: result.error })
      return
    }

    console.info(`[Route] ✅ /api/vision/chat 返回成功，${result.content.length} 字符`)
    res.json(result)
  },
)

/**
 * GET /api/sessions
 * ────────────────────────────────────────────────────────────
 * 获取所有会话列表。
 */
app.get('/api/sessions', async (_req: Request, res: Response) => {
  console.debug('[Route] GET /api/sessions')
  const sessions = await agent.listSessions()
  res.json(sessions)
})

/**
 * GET /api/history/:sessionId
 * ────────────────────────────────────────────────────────────
 * 获取指定会话的对话历史。
 */
app.get(
  '/api/history/:sessionId',
  async (req: Request<{ sessionId: string }>, res: Response) => {
    const { sessionId } = req.params

    console.info(`[Route] GET /api/history/${sessionId}`)

    const history = await agent.getHistory(sessionId)
    res.json({ sessionId, history })
  },
)

/**
 * DELETE /api/session/:sessionId
 * ────────────────────────────────────────────────────────────
 * 清除指定会话。
 */
app.delete(
  '/api/session/:sessionId',
  async (req: Request<{ sessionId: string }>, res: Response) => {
    const { sessionId } = req.params

    console.info(`[Route] DELETE /api/session/${sessionId}`)

    await agent.clearSession(sessionId)
    res.json({ success: true, message: `会话 ${sessionId} 已清除` })
  },
)

// ─── 用户画像接口 ──────────────────────────────────────────

app.get('/api/profile', async (_req: Request, res: Response) => {
  console.debug('[Route] GET /api/profile')
  const profile = await userProfileRepo.getOrCreate()
  res.json(profile)
})

app.put('/api/profile', async (req: Request, res: Response) => {
  console.info('[Route] PUT /api/profile')
  const { allergies, diet_type, skill_level, disliked, calorie_goal } = req.body

  const profile = await userProfileRepo.update('default', {
    allergies,
    diet_type,
    skill_level,
    disliked,
    calorie_goal,
  })

  res.json(profile)
})

// ─── 全局错误处理 ──────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: '接口不存在' })
})

app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error('[GlobalError] 未捕获的错误：', err)
  res.status(500).json({ error: '服务器内部错误', detail: err.message })
})

// ─── 服务启动 ──────────────────────────────────────────────

  server.listen(PORT, () => {
    console.log('')
    console.log('═══════════════════════════════════════════════')
    console.log(`   🍳 厨神小助 Agent 服务已启动！`)
    console.log(`   🌐 访问地址：http://localhost:${PORT}`)
    console.log('═══════════════════════════════════════════════')
    console.log('📋 可用接口：')
    console.log(`   GET    /health               健康检查`)
    console.log(`   POST   /api/chat             普通对话`)
    console.log(`   WS     /api/chat/ws          流式对话（WebSocket）`)
    console.log(`   POST   /api/vision/chat      图片识别对话`)
    console.log(`   GET    /api/sessions         会话列表`)
    console.log(`   GET    /api/history/:id      获取对话历史`)
    console.log(`   DELETE /api/session/:id      清除会话`)
    console.log(`   GET    /api/profile          获取用户画像`)
    console.log(`   PUT    /api/profile          更新用户画像`)
    console.log('')
    console.info('[Server] 🚀 服务就绪，等待请求…')
  })
}

start().catch((err) => {
  console.error('❌ 服务启动失败：', (err as Error).message)
  process.exit(1)
})