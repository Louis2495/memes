import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path = process.env.DB_PATH ?? 'data/memes.sqlite') {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS memes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
      mime TEXT NOT NULL, image BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS votes (
      account TEXT NOT NULL, meme INTEGER NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
      reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
      PRIMARY KEY (account, meme)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, account TEXT NOT NULL, email TEXT NOT NULL, expires INTEGER NOT NULL
    );
  `);
  return db;
}
