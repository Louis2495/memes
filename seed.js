import { readFileSync } from 'node:fs';

const directory = new URL('./public/memes/', import.meta.url);

export function importStarterMemes(db) {
  const catalog = JSON.parse(readFileSync(new URL('catalog.json', directory), 'utf8'));
  db.exec('CREATE TABLE IF NOT EXISTS imported_memes (source_id TEXT PRIMARY KEY)');
  const markImported = db.prepare('INSERT OR IGNORE INTO imported_memes (source_id) VALUES (?)');
  const insertMeme = db.prepare('INSERT INTO memes (title, mime, image) VALUES (?, ?, ?)');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const entry of catalog) {
      if (markImported.run(entry.id).changes) {
        insertMeme.run(entry.title, 'image/webp', readFileSync(new URL(entry.image, directory)));
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
