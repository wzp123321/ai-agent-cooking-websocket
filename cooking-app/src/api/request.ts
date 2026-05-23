/**
 * ============================================================
 * request.ts — Axios 实例封装（请求/响应拦截器）
 * ============================================================
 *
 * 功能概述：
 *   - 创建统一的 Axios 实例，配置 baseURL、超时、默认请求头
 *   - 请求拦截器：自动注入请求 ID、时间戳、日志记录
 *   - 响应拦截器：统一错误处理、响应数据解包、日志记录
 *
 * 设计原则：
 *   - 单一实例：整个应用共享一个 Axios 实例，避免重复配置
 *   - 错误归一化：所有 HTTP 错误统一为 { code, message, detail } 格式
 *   - 日志可追踪：每个请求带唯一 ID，方便前后端联调
 *
 * 使用方式：
 *   import request from '@/api/request'
 *   const data = await request.get('/sessions')
 *   const data = await request.post('/chat', { message: 'hello' })
 */

import axios, {
  type AxiosInstance,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ElMessage } from 'element-plus'
import { BASE_URL } from '@/constants'

// ─── 类型定义 ────────────────────────────────────────────

/** 统一的 API 错误结构 */
export interface ApiError {
  code: number
  message: string
  detail?: string
}

/** 扩展 Axios 请求配置，注入自定义元数据 */
interface RequestMeta {
  requestId: string
  startTime: number
}

// ─── 工具函数 ────────────────────────────────────────────

/** 生成唯一请求 ID（时间戳 + 随机串） */
const genRequestId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 计算请求耗时（毫秒） */
const calcDuration = (startTime: number): number => {
  return Date.now() - startTime
}

// ─── Axios 实例创建 ──────────────────────────────────────

const request: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ══════════════════════════════════════════════════════════
// 请求拦截器
// ══════════════════════════════════════════════════════════

request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const meta: RequestMeta = {
      requestId: genRequestId(),
      startTime: Date.now(),
    }

    config.headers['X-Request-Id'] = meta.requestId

    ;(config as any).__meta = meta

    const { method, url, data } = config
    const payload = data ? JSON.stringify(data).slice(0, 200) : '-'
    console.info(
      `[Request] 📤 ${method?.toUpperCase()} ${url} | id=${meta.requestId} | body=${payload}`,
    )

    return config
  },
  (error: AxiosError) => {
    console.error('[Request] ❌ 请求拦截器错误：', error.message)
    return Promise.reject(error)
  },
)

// ══════════════════════════════════════════════════════════
// 响应拦截器
// ══════════════════════════════════════════════════════════

request.interceptors.response.use(
  (response) => {
    const meta: RequestMeta | undefined = (response.config as any).__meta
    const duration = meta ? calcDuration(meta.startTime) : -1
    const { status, config } = response

    console.info(
      `[Response] ✅ ${config.method?.toUpperCase()} ${config.url} → ${status} (${duration}ms)`,
    )

    return response
  },
  (error: AxiosError) => {
    const meta: RequestMeta | undefined = (error.config as any)?.__meta
    const duration = meta ? calcDuration(meta.startTime) : -1

    const apiError: ApiError = {
      code: error.response?.status ?? 0,
      message: '请求失败',
      detail: error.message,
    }

    if (error.response) {
      const { status, data } = error.response
      const body = data as Record<string, unknown> | undefined

      apiError.code = status
      apiError.message = (body?.error as string) ?? `HTTP ${status}`
      apiError.detail = (body?.detail as string) ?? error.message

      console.error(
        `[Response] ❌ ${error.config?.method?.toUpperCase()} ${error.config?.url} → ${status} (${duration}ms) | ${apiError.message}`,
      )

      switch (status) {
        case 400:
          ElMessage.warning(`参数错误：${apiError.message}`)
          break
        case 429:
          ElMessage.warning('请求过于频繁，请稍后再试')
          break
        case 500:
          ElMessage.error('服务器内部错误，请稍后重试')
          break
        default:
          if (status >= 500) {
            ElMessage.error(`服务器错误 (${status})`)
          }
      }
    } else if (error.request) {
      apiError.message = '网络连接失败，请检查 Agent 服务是否已启动'
      apiError.detail = error.message

      console.error(
        `[Response] ❌ ${error.config?.method?.toUpperCase()} ${error.config?.url} → 网络不可达 (${duration}ms)`,
      )
    } else {
      console.error(
        `[Response] ❌ 请求配置错误：${error.message}`,
      )
    }

    return Promise.reject(apiError)
  },
)

export default request