import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const mimeByExtension = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const directory = new URL('./public/memes/', import.meta.url);

function removeRetiredFeedImages(db) {
  if (db.prepare('PRAGMA user_version').get().user_version >= 6) return;

  const hashes = new Set(JSON.parse(
    readFileSync(new URL('./retired-feed-image-hashes.json', import.meta.url), 'utf8')
  ));
  const deleteMeme = db.prepare('DELETE FROM memes WHERE id = ?');
  const nextImages = db.prepare(`
    SELECT id, image FROM memes
    WHERE id > ? AND mime IN ('image/webp', 'image/jpeg', 'image/png')
    ORDER BY id LIMIT 64
  `);
  let lastId = 0;
  for (let batch = nextImages.all(lastId); batch.length; batch = nextImages.all(lastId)) {
    for (const { id, image } of batch) {
      if (hashes.has(createHash('sha256').update(image).digest('hex'))) deleteMeme.run(id);
      lastId = id;
    }
  }
  db.exec('PRAGMA user_version = 6');
}

export function importStarterMemes(db) {
  const catalog = JSON.parse(readFileSync(new URL('catalog.json', directory), 'utf8'));
  db.exec('CREATE TABLE IF NOT EXISTS imported_memes (source_id TEXT PRIMARY KEY)');
  const markImported = db.prepare('INSERT OR IGNORE INTO imported_memes (source_id) VALUES (?)');
  const insertMeme = db.prepare('INSERT INTO memes (title, mime, image) VALUES (?, ?, ?)');
  db.exec('BEGIN IMMEDIATE');
  try {
    removeRetiredFeedImages(db);
    for (const entry of catalog) {
      if (markImported.run(entry.id).changes) {
        const mime = mimeByExtension[extname(entry.image)];
        if (!mime) throw new Error(`Unsupported meme image: ${entry.image}`);
        insertMeme.run(entry.title, mime, readFileSync(new URL(entry.image, directory)));
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
