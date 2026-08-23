const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'union.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS pledges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    alias       TEXT    NOT NULL,
    email       TEXT    NOT NULL,
    phone       TEXT,
    tier        INTEGER NOT NULL DEFAULT 1,
    ip_hash     TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_pledges_email ON pledges(email);
  CREATE INDEX IF NOT EXISTS idx_pledges_created ON pledges(created_at);
`);

function getCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM pledges').get().n;
}

function pledgeExists(email) {
  return !!db.prepare('SELECT 1 FROM pledges WHERE email = ?').get(email);
}

function insertPledge({ alias, email, phone, ip_hash }) {
  const stmt = db.prepare(
    'INSERT INTO pledges (alias, email, phone, ip_hash) VALUES (?, ?, ?, ?)'
  );
  const info = stmt.run(alias, email, phone || null, ip_hash || null);
  return info.lastInsertRowid;
}

module.exports = { db, getCount, pledgeExists, insertPledge };
