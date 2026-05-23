import { getPool } from './index'
import type { Message } from '../types'

export interface MessageRow {
  id: number
  session_id: string
  role: string
  content: string
  tool_call_id: string | null
  tool_calls: string | null
  created_at: number
}

export class MessageRepository {
  async insert(sessionId: string, msg: Message, now: number): Promise<MessageRow> {
    const pool = await getPool()
    const toolCallsJson = msg.tool_calls ? JSON.stringify(msg.tool_calls) : null
    const [result] = await pool.execute(
      `INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, msg.role, msg.content, msg.tool_call_id ?? null, toolCallsJson, now],
    )
    return {
      id: (result as any).insertId as number,
      session_id: sessionId,
      role: msg.role,
      content: msg.content,
      tool_call_id: msg.tool_call_id ?? null,
      tool_calls: toolCallsJson,
      created_at: now,
    }
  }

  async findBySessionId(sessionId: string): Promise<MessageRow[]> {
    const pool = await getPool()
    const [rows] = await pool.execute(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId],
    )
    return rows as MessageRow[]
  }

  async findHistoryBySessionId(sessionId: string): Promise<Message[]> {
    const rows = await this.findBySessionId(sessionId)
    return rows
      .filter((r) => r.role !== 'system')
      .map((r) => ({
        role: r.role as Message['role'],
        content: r.content,
        tool_call_id: r.tool_call_id ?? undefined,
        tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
      }))
  }

  async deleteBySessionId(sessionId: string): Promise<number> {
    const pool = await getPool()
    const [result] = await pool.execute(
      'DELETE FROM messages WHERE session_id = ?',
      [sessionId],
    )
    return (result as any).affectedRows
  }

  async countBySessionId(sessionId: string): Promise<number> {
    const pool = await getPool()
    const [rows] = await pool.execute(
      'SELECT COUNT(*) as cnt FROM messages WHERE session_id = ? AND role != ?',
      [sessionId, 'system'],
    )
    const list = rows as Array<{ cnt: number }>
    return list[0].cnt
  }
}

export const messageRepo = new MessageRepository()
