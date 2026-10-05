'use strict';
/*
 * TiDB (平凯云) 连接池。
 * 凭据优先级：环境变量 > server/.env（gitignore） > 下方默认值（仅为本地/服务器快速跑通）。
 * 注意：密码只存在于服务端，绝不进浏览器。
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, 'utf8');
  txt.split('\n').forEach(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  });
}
loadEnv();

const CFG = {
  host: process.env.TIDB_HOST || 'gateway01.cn-shanghai.aliyun.pingkai.cn',
  port: Number(process.env.TIDB_PORT || 4000),
  user: process.env.TIDB_USER || 'BGsdfz1vS2Kwtue.root',
  password: process.env.TIDB_PASSWORD || '',
  database: process.env.TIDB_DB || 'sys',
};

const SSL = { rejectUnauthorized: false }; // 平凯 TiDB serverless 要求安全传输
const mysql = require('mysql2/promise');

let pool = null;
let dbName = CFG.database;
let ensured = false;

async function ensureSchema() {
  // 优先建独立库 tidb_fantasy；无权限则回退到 sys
  const sysConn = await mysql.createConnection({
    host: CFG.host, port: CFG.port, user: CFG.user, password: CFG.password,
    database: 'sys', ssl: SSL, connectTimeout: 8000,
  });
  try {
    await sysConn.query('CREATE DATABASE IF NOT EXISTS tidb_fantasy');
    dbName = 'tidb_fantasy';
  } catch (e) {
    dbName = 'sys';
  } finally {
    await sysConn.end();
  }

  pool = mysql.createPool({
    host: CFG.host, port: CFG.port, user: CFG.user, password: CFG.password,
    database: dbName, ssl: SSL, connectTimeout: 8000,
    waitForConnections: true, connectionLimit: 5, enableKeepAlive: true,
    dateStrings: true,
  });

  await pool.query(`CREATE TABLE IF NOT EXISTS lb_scores (
    id BIGINT AUTO_RANDOM PRIMARY KEY,
    player VARCHAR(40) NOT NULL,
    lvl INT NOT NULL,
    lvl_name VARCHAR(40),
    score INT NOT NULL,
    stars TINYINT NOT NULL DEFAULT 0,
    won TINYINT NOT NULL DEFAULT 0,
    duration_sec INT NOT NULL DEFAULT 0,
    peak_risk INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_lvl_score (lvl, score DESC),
    KEY idx_score (score DESC)
  ) ENGINE=InnoDB`);

  await pool.query(`CREATE TABLE IF NOT EXISTS lb_matches (
    id BIGINT AUTO_RANDOM PRIMARY KEY,
    player VARCHAR(40) NOT NULL,
    lvl INT NOT NULL,
    lvl_name VARCHAR(40),
    result VARCHAR(10) NOT NULL,
    stars TINYINT DEFAULT 0,
    duration_sec INT DEFAULT 0,
    peak_risk INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_created (created_at)
  ) ENGINE=InnoDB`);

  ensured = true;
}

async function getPool() {
  if (!pool) await ensureSchema();
  return pool;
}

module.exports = { getPool, ensureSchema, CFG, getDbName: () => dbName };
