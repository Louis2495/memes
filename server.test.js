import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { openDatabase } from './db.js';
import { createApp } from './server.js';

test('likes are personal and only the admin can delete a meme for everyone', async (t) => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const origin = 'http://localhost:3000';
  const server = createApp({ db, baseUrl: origin, clientId: '', clientSecret: '' }).listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  function signIn(account, email, tokenCharacter) {
    const token = tokenCharacter.repeat(64);
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)')
      .run(createHash('sha256').update(token).digest('hex'), account, email, Date.now() + 60000);
    return `meme_session=${token}`;
  }

  const admin = signIn('admin', 'louisanderson477@gmail.com', 'a');
  const reader = signIn('reader', 'reader@example.com', 'b');
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFZkAAAAASUVORK5CYII=', 'base64');
  db.prepare('INSERT INTO memes (title, mime, image) VALUES (?, ?, ?)').run('Test image', 'image/png', image);

  const vote = (cookie, reaction, requestOrigin = origin) => fetch(base + '/api/memes/1/vote', {
    method: 'POST',
    headers: { cookie, origin: requestOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reaction }),
  });
  const good = async (cookie) => (await fetch(base + '/api/memes?view=good', { headers: { cookie } })).json();
  assert.match(await (await fetch(base)).text(), /Meme Room/);
  assert.match(await (await fetch(base + '/signin')).text(), /Continue with Google/);
  assert.equal((await vote('', 'dislike')).status, 401);
  assert.equal((await vote(admin, 'dislike', 'https://example.org')).status, 403);
  assert.deepEqual(await (await vote(reader, 'dislike')).json(), { deleted: false });
  const original = await fetch(base + '/api/memes/1/image');
  assert.equal(original.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), image);
  await vote(reader, 'like');
  assert.deepEqual(await good(reader), [{ id: 1, title: 'Test image' }]);
  assert.deepEqual(await good(admin), []);
  await vote(admin, 'like');
  assert.deepEqual(await good(admin), [{ id: 1, title: 'Test image' }]);
  assert.deepEqual(await (await vote(admin, 'dislike')).json(), { deleted: true });
  assert.deepEqual(await good(reader), []);
  assert.deepEqual(await good(admin), []);
  assert.deepEqual(await (await fetch(base + '/api/memes')).json(), []);
  assert.equal((await fetch(base + '/api/memes/1/image')).status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM votes').get().count, 0);
});
