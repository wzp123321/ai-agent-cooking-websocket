import { getPool } from './index'

const SCHEMAS = [
  `CREATE TABLE IF NOT EXISTS sessions (
    id         VARCHAR(36) PRIMARY KEY,
    title      VARCHAR(255) NOT NULL DEFAULT '新对话',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS messages (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    session_id   VARCHAR(36) NOT NULL,
    role         VARCHAR(20) NOT NULL,
    content      TEXT NOT NULL,
    tool_call_id VARCHAR(255) DEFAULT NULL,
    tool_calls   TEXT DEFAULT NULL,
    created_at   BIGINT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    INDEX idx_messages_session (session_id, created_at),
    CONSTRAINT chk_role CHECK (role IN ('system','user','assistant','tool'))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS user_profiles (
    id           VARCHAR(36) PRIMARY KEY DEFAULT 'default',
    allergies    TEXT,
    diet_type    VARCHAR(100) DEFAULT '',
    skill_level  VARCHAR(20) DEFAULT 'intermediate',
    disliked     TEXT,
    calorie_goal INT DEFAULT 0,
    created_at   BIGINT NOT NULL,
    updated_at   BIGINT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

export async function runMigrations(): Promise<void> {
  const pool = await getPool()

  for (const sql of SCHEMAS) {
    await pool.execute(sql)
  }

  const [cols] = await pool.execute('SHOW COLUMNS FROM messages') as [Array<{ Field: string }>, unknown]
  if (!cols.some((c) => c.Field === 'tool_calls')) {
    await pool.execute('ALTER TABLE messages ADD COLUMN tool_calls TEXT')
    console.info('[DB] ✅ 新增 messages.tool_calls 列')
  }

  console.info('[DB] ✅ 数据库迁移完成')
}
