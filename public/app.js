const element = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const view = ['good', 'signin'].includes(params.get('view')) ? params.get('view') : 'feed';
const staticHost = document.documentElement.dataset.host === 'static';
const controls = ['previous', 'dislike', 'like', 'next'];
let session;
let memes = [];
let index = 0;
let busy = false;
let feedTotal = 0;
let previouslySeen = 0;
const seenOnThisPage = new Set();

const voteKey = (id) => `meme-room:vote:${id}`;
const removedKey = (id) => `meme-room:removed:${id}`;

async function request(path, options) {
  const response = await fetch(path, options);
  if (response.status === 204) return;
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error ?? 'Something went wrong.'), { status: response.status });
  return result;
}

const seenKey = (id) => `meme-room:seen:${id}`;

function hasStoredFlag(key) {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

const wasSeen = (id) => hasStoredFlag(seenKey(id));
const wasRemoved = (id) => hasStoredFlag(removedKey(id));

function showFeedMeme(position) {
  while (memes[position] && !seenOnThisPage.has(memes[position].id) && wasSeen(memes[position].id)) {
    memes.splice(position, 1);
    previouslySeen++;
  }
  index = position;
  const current = memes[index];
  if (!current || seenOnThisPage.has(current.id)) return;

  seenOnThisPage.add(current.id);
  try {
    localStorage.setItem(seenKey(current.id), '1');
  } catch {
    // The current page still traverses the shuffled list without replacement.
  }
}

function startFeed(catalog) {
  feedTotal = catalog.length;
  memes = catalog.filter(({ id }) => !wasSeen(id));
  previouslySeen = feedTotal - memes.length;
  for (let last = memes.length - 1; last > 0; last--) {
    const other = Math.floor(Math.random() * (last + 1));
    [memes[last], memes[other]] = [memes[other], memes[last]];
  }
  showFeedMeme(0);
}

function advance() {
  if (view === 'feed') showFeedMeme(index + 1);
  else index = (index + 1) % memes.length;
}

function removeCurrent() {
  memes.splice(index, 1);
  if (view === 'feed') {
    feedTotal--;
    showFeedMeme(index);
  } else {
    index %= memes.length || 1;
  }
}

function render(message) {
  const current = memes[index];
  const good = view === 'good';
  const caughtUp = view === 'feed' && !current && feedTotal > 0;
  const needsSignIn = good && !staticHost && !session?.email;
  const position = good ? index + 1 : previouslySeen + index + 1;
  const total = good ? memes.length : feedTotal;
  element('position').textContent = current ? `${position} / ${total}` : caughtUp ? `${total} / ${total}` : '— / —';
  element('empty').hidden = Boolean(current);
  element('meme').hidden = !current;
  const caption = element('meme-caption');
  caption.hidden = !current;
  caption.textContent = current?.title ?? '';
  if (current) {
    const image = element('meme');
    image.alt = current.alt ?? current.title;
    const source = staticHost ? new URL(`memes/${current.image}`, import.meta.url).href : `/api/memes/${current.id}/image`;
    if (image.getAttribute('src') !== source) image.src = source;
  } else {
    element('meme').removeAttribute('src');
    element('empty-title').textContent = caughtUp ? 'You’re caught up'
      : needsSignIn ? 'Your likes live here' : good ? 'Nothing saved yet' : 'No memes yet';
    element('empty-description').textContent = message ?? (caughtUp ? 'New memes will appear here when they’re added.'
      : needsSignIn ? 'Sign in to see the memes you’ve liked.'
      : good ? 'Like a meme in the feed to save it here.' : 'Check back when the first memes drop.');
    element('empty-action').hidden = !needsSignIn;
  }
  controls.forEach((id) => {
    const canGoBack = id === 'previous' && !good;
    element(id).disabled = busy || (canGoBack ? index === 0 : !current);
  });
}

function move(offset) {
  if (busy || !memes.length) return;
  if (view === 'good') index = (index + offset + memes.length) % memes.length;
  else if (offset < 0) index = Math.max(0, index - 1);
  else if (index < memes.length) advance();
  element('status').textContent = '';
  render();
}

async function vote(reaction) {
  const current = memes[index];
  if (!current || busy) return;
  if (!staticHost && !session) {
    element('status').textContent = 'Checking sign-in. Try again in a moment.';
    return;
  }
  if (!staticHost && !session.email) {
    location.assign('?view=signin');
    return;
  }

  busy = true;
  render();
  try {
    let result = { deleted: false };
    if (staticHost) {
      if (reaction === 'dislike' || wasRemoved(current.id)) {
        localStorage.setItem(removedKey(current.id), '1');
        result.deleted = true;
      } else {
        localStorage.setItem(voteKey(current.id), reaction);
      }
    } else {
      result = await request(`/api/memes/${current.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction }),
      });
    }
    if (result.deleted || (view === 'good' && reaction === 'dislike')) {
      removeCurrent();
    } else {
      advance();
    }
    const removedMessage = staticHost ? 'Meme removed from this browser.' : 'Meme permanently deleted.';
    element('status').textContent = result.deleted ? removedMessage : reaction === 'like' ? 'Saved to Good.' : 'Disliked.';
  } catch (error) {
    if (error.status === 401) location.assign('?view=signin');
    if (error.status === 404) removeCurrent();
    element('status').textContent = staticHost ? 'Could not save your vote in this browser.' : error.message;
  } finally {
    busy = false;
    render();
  }
}

element('previous').onclick = () => move(-1);
element('next').onclick = () => move(1);
element('dislike').onclick = () => vote('dislike');
element('like').onclick = () => vote('like');

const keys = { ArrowUp: 'previous', ArrowDown: 'next', ArrowLeft: 'dislike', ArrowRight: 'like' };
document.addEventListener('keydown', (event) => {
  if (view === 'signin' || !keys[event.key] || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.matches('input, textarea, select'))) return;
  if (!memes.length) return;
  event.preventDefault();
  if (!event.repeat) element(keys[event.key]).click();
});

element('sign-out').onclick = async () => {
  try {
    await request('/auth/logout', { method: 'POST' });
    location.assign('/');
  } catch {
    element(view === 'signin' ? 'signin-status' : 'status').textContent = 'Could not sign out. Try again.';
  }
};

async function init() {
  element('browse').hidden = view === 'signin';
  element('signin').hidden = view !== 'signin';
  document.querySelector(`[data-view="${view}"]`)?.setAttribute('aria-current', 'page');
  if (view === 'good') {
    element('heading').firstChild.textContent = 'Good';
    element('subtitle').textContent = staticHost ? 'Memes liked in this browser.' : 'All the memes you’ve liked.';
    element('card-label').textContent = 'YOUR LIKES';
  }

  if (staticHost) {
    const remove = element('dislike');
    remove.setAttribute('aria-label', 'Remove meme');
    remove.title = 'Remove in this browser (left arrow)';
    remove.querySelector('span').textContent = 'Remove';
    element('left-shortcut').textContent = 'Remove';

    if (view === 'signin') {
      element('signin-status').textContent = 'Google sign-in needs the Meme Room server. You can vote in the feed without signing in.';
      return;
    }

    const catalog = await request(new URL('memes/catalog.json?v=10', import.meta.url), { cache: 'no-cache' });
    const available = catalog.filter(({ id }) => !wasRemoved(id));
    if (view === 'good') memes = available.filter(({ id }) => localStorage.getItem(voteKey(id)) === 'like');
    else startFeed(available);
    render();
    return;
  }

  const loadSession = request('/api/session').then((account) => {
    session = account;
    element('sign-in').hidden = Boolean(account.email);
    element('sign-out').hidden = !account.email;
  });

  if (view === 'feed') {
    loadSession.catch(() => {
      element('status').textContent = 'Could not check sign-in. Refresh to retry.';
    });
    startFeed(await request('/api/memes'));
    render();
    return;
  }

  await loadSession;
  if (view === 'signin') {
    element('google').hidden = !session.google;
    element('signin-status').textContent = !session.google ? 'Google sign-in hasn’t been configured yet.'
      : params.get('error') ? 'Sign-in didn’t finish. Please try again.' : '';
    return;
  }
  if (session.email) memes = await request('/api/memes?view=good');
  render();
}

init().catch(() => {
  const error = 'Could not load the site. Refresh to retry.';
  if (view === 'signin') element('signin-status').textContent = error;
  else render(error);
});
