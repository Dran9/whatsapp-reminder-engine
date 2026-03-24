const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'reminders.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS sent_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL,
        phone TEXT NOT NULL,
        sent_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(event_id, phone)
      )
    `);
  }
  return db;
}

function wasAlreadySent(eventId, phone) {
  const row = getDb().prepare(
    'SELECT 1 FROM sent_reminders WHERE event_id = ? AND phone = ?'
  ).get(eventId, phone);
  return !!row;
}

function markAsSent(eventId, phone) {
  getDb().prepare(
    'INSERT OR IGNORE INTO sent_reminders (event_id, phone) VALUES (?, ?)'
  ).run(eventId, phone);
}

function listSent(limit = 50) {
  return getDb().prepare(
    'SELECT * FROM sent_reminders ORDER BY sent_at DESC LIMIT ?'
  ).all(limit);
}

module.exports = { getDb, wasAlreadySent, markAsSent, listSent };
