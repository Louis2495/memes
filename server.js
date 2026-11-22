import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { openDatabase } from './db.js';

const adminEmail = 'louisanderson477@gmail.com';
const token = () => randomBytes(32).toString('hex');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const homepage = readFileSync(new URL('./index.html', import.meta.url), 'utf8')
  .replace('data-host="static"', 'data-host="server"');
const sessionAge = 7 * 24 * 60 * 60 * 1000;

export function createApp({
  db = openDatabase(),
  baseUrl = process.env.BASE_URL ?? 'http://localhost:3000',
  clientId = process.env.GOOGLE_CLIENT_ID,
  clientSecret = process.env.GOOGLE_CLIENT_SECRET,
} = {}) {
  const app = express();
  const origin = new URL(baseUrl).origin;
  const google = clientId && clientSecret
    ? new OAuth2Client(clientId, clientSecret, origin + '/auth/google/callback')
    : null;
  const cookie = { httpOnly: true, sameSite: 'lax', secure: origin.startsWith('https:') };

  app.disable('x-powered-by');
  app.use(express.json({ limit: '4kb' }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    const cookies = req.headers.cookie ?? '';
    req.sessionToken = cookies.match(/(?:^|;\s*)meme_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    req.user = req.sessionToken && db.prepare(
      'SELECT account, email FROM sessions WHERE token = ? AND expires > ?'
    ).get(hash(req.sessionToken), Date.now());
    if (req.method === 'POST' && req.get('origin') !== origin) {
      return res.status(403).json({ error: 'Request origin is invalid.' });
    }
    next();
  });

  app.get('/auth/google', (req, res) => {
    if (!google) return res.redirect('/signin?error=unconfigured');
    const state = token();
    res.cookie('meme_oauth', state, { ...cookie, maxAge: 600000 });
    res.redirect(google.generateAuthUrl({ scope: ['openid', 'email'], state, prompt: 'select_account' }));
  });

  app.get('/auth/google/callback', async (req, res) => {
    const state = req.headers.cookie?.match(/(?:^|;\s*)meme_oauth=([a-f0-9]{64})(?:;|$)/)?.[1];
    res.clearCookie('meme_oauth', cookie);
    if (!google || !state || req.query.state !== state || typeof req.query.code !== 'string') {
      return res.redirect('/signin?error=failed');
    }

    try {
      const { tokens } = await google.getToken(req.query.code);
      const ticket = await google.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
      const profile = ticket.getPayload();
      if (!profile?.email_verified || !profile.email || !profile.sub) {
        return res.redirect('/signin?error=failed');
      }
      const session = token();
      db.prepare('DELETE FROM sessions WHERE expires <= ? OR token = ?')
        .run(Date.now(), hash(req.sessionToken ?? ''));
      db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)')
        .run(hash(session), profile.sub, profile.email.toLowerCase(), Date.now() + sessionAge);
      res.cookie('meme_session', session, { ...cookie, maxAge: sessionAge });
      res.redirect('/');
    } catch {
      res.redirect('/signin?error=failed');
    }
  });

  app.post('/auth/logout', (req, res) => {
    if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE token = ?').run(hash(req.sessionToken));
    res.clearCookie('meme_session', cookie).sendStatus(204);
  });

  app.get('/api/session', (req, res) => {
    res.json({ email: req.user?.email ?? null, admin: req.user?.email === adminEmail, google: Boolean(google) });
  });

  app.get('/api/memes', (req, res) => {
    const good = req.query.view === 'good';
    if (good && !req.user) return res.status(401).json({ error: 'Sign in to see your Good section.' });
    const memes = good
      ? db.prepare(`SELECT memes.id, memes.title FROM memes JOIN votes ON votes.meme = memes.id
          WHERE votes.account = ? AND votes.reaction = 'like' ORDER BY memes.id`).all(req.user.account)
      : db.prepare('SELECT id, title FROM memes ORDER BY id').all();
    res.json(memes);
  });

  app.get('/api/memes/:id/image', (req, res) => {
    const meme = db.prepare('SELECT mime, image FROM memes WHERE id = ?').get(req.params.id);
    if (!meme) return res.sendStatus(404);
    res.set('Content-Type', meme.mime).send(Buffer.from(meme.image));
  });

  app.post('/api/memes/:id/vote', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Sign in to vote.' });
    const reaction = req.body?.reaction;
    if (reaction !== 'like' && reaction !== 'dislike') {
      return res.status(400).json({ error: 'Choose like or dislike.' });
    }
    if (reaction === 'dislike' && req.user.email === adminEmail) {
      const result = db.prepare('DELETE FROM memes WHERE id = ?').run(req.params.id);
      if (!result.changes) return res.status(404).json({ error: 'This meme is gone.' });
      return res.json({ deleted: true });
    }

    const result = db.prepare(`
      INSERT INTO votes (account, meme, reaction)
      SELECT ?, id, ? FROM memes WHERE id = ?
      ON CONFLICT(account, meme) DO UPDATE SET reaction = excluded.reaction
    `).run(req.user.account, reaction, req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'This meme is gone.' });
    res.json({ deleted: false });
  });

  app.get('/signin', (req, res) => res.redirect('/?view=signin' + (
    ['failed', 'unconfigured'].includes(req.query.error) ? '&error=' + req.query.error : ''
  )));
  app.get('/', (_req, res) => res.type('html').send(homepage));
  app.use('/public', express.static(fileURLToPath(new URL('./public/', import.meta.url)), {
    etag: false,
    lastModified: false,
  }));
  return app;
}
