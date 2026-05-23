import mysql from 'mysql2/promise'

const MYSQL_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '123456',
  database: 'cooking',
}

let pool: mysql.Pool | null = null

async function ensureDatabase(): Promise<void> {
  const conn = await mysql.createConnection({
    host: MYSQL_CONFIG.host,
    port: MYSQL_CONFIG.port,
    user: MYSQL_CONFIG.user,
    password: MYSQL_CONFIG.password,
  })
  await conn.execute(
    `CREATE DATABASE IF NOT EXISTS \`${MYSQL_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  )
  await conn.end()
}

export async function getPool(): Promise<mysql.Pool> {
  if (!pool) {
    await ensureDatabase()
    pool = mysql.createPool({
      ...MYSQL_CONFIG,
      waitForConnections: true,
      connectionLimit: 10,
    })
    console.info(
      `[DB] 📂 MySQL 数据库已连接：${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}`,
    )
  }
  return pool
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    console.info('[DB] 🔒 数据库已关闭')
  }
}
