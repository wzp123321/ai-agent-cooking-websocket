import { getPool } from './index'

export interface SessionRow {
  id: string
  title: string
  created_at: number
  updated_at: number
}

export class SessionRepository {
  async create(id: string, title: string, now: number): Promise<SessionRow> {
    const pool = await getPool()
    await pool.execute(
      `INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      [id, title, now, now],
    )
    return { id, title, created_at: now, updated_at: now }
  }

  async findById(id: string): Promise<SessionRow | undefined> {
    const pool = await getPool()
    const [rows] = await pool.execute(
      'SELECT * FROM sessions WHERE id = ?',
      [id],
    )
    const list = rows as SessionRow[]
    return list[0]
  }

  async findAll(): Promise<SessionRow[]> {
    const pool = await getPool()
    const [rows] = await pool.execute(
      'SELECT * FROM sessions ORDER BY updated_at DESC',
    )
    return rows as SessionRow[]
  }

  async updateTitle(id: string, title: string, now: number): Promise<void> {
    const pool = await getPool()
    await pool.execute(
      `UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?`,
      [title, now, id],
    )
  }

  async touch(id: string, now: number): Promise<void> {
    const pool = await getPool()
    await pool.execute(
      'UPDATE sessions SET updated_at = ? WHERE id = ?',
      [now, id],
    )
  }

  async deleteById(id: string): Promise<boolean> {
    const pool = await getPool()
    const [result] = await pool.execute('DELETE FROM sessions WHERE id = ?', [id])
    return (result as any).affectedRows > 0
  }
}

export const sessionRepo = new SessionRepository()
