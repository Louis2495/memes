const element = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const view = ['good', 'signin'].includes(params.get('view')) ? params.get('view') : 'feed';
const staticHost = document.documentElement.dataset.host === 'static';
const controls = ['previous', 'dislike', 'like', 'next'];
let session;
let memes = [];
let index = 0;
let busy = false;

const voteKey = (id) => `meme-room:vote:${id}`;

async function request(path, options) {
  const response = await fetch(path, options);
  if (response.status === 204) return;
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error ?? 'Something went wrong.'), { status: response.status });
  return result;
}

function render(message) {
  const current = memes[index];
  const good = view === 'good';
  const needsSignIn = good && !staticHost && !session?.email;
  element('position').textContent = current ? `${index + 1} / ${memes.length}` : '— / —';
  element('empty').hidden = Boolean(current);
  element('meme').hidden = !current;
  const caption = element('meme-caption');
  caption.hidden = !current;
  caption.textContent = current?.title ?? '';
  if (current) {
    const image = element('meme');
    image.alt = current.title;
    const source = staticHost ? new URL(`memes/${current.image}`, import.meta.url).href : `/api/memes/${current.id}/image`;
    if (image.getAttribute('src') !== source) image.src = source;
  } else {
    element('meme').removeAttribute('src');
    element('empty-title').textContent = needsSignIn ? 'Your likes live here' : good ? 'Nothing saved yet' : 'No memes yet';
    element('empty-description').textContent = message ?? (good
      ? needsSignIn ? 'Sign in to see the memes you’ve liked.' : 'Like a meme in the feed to save it here.'
      : 'Check back when the first memes drop.');
    element('empty-action').hidden = !needsSignIn;
  }
  controls.forEach((id) => { element(id).disabled = busy || !current; });
}

function move(offset) {
  if (busy || !memes.length) return;
  index = (index + offset + memes.length) % memes.length;
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
      localStorage.setItem(voteKey(current.id), reaction);
    } else {
      result = await request(`/api/memes/${current.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction }),
      });
    }
    if (result.deleted || (view === 'good' && reaction === 'dislike')) {
      memes.splice(index, 1);
      index %= memes.length || 1;
    } else {
      index = (index + 1) % memes.length;
    }
    element('status').textContent = result.deleted ? 'Meme permanently deleted.' : reaction === 'like' ? 'Saved to Good.' : 'Disliked.';
  } catch (error) {
    if (error.status === 401) location.assign('?view=signin');
    if (error.status === 404) {
      memes.splice(index, 1);
      index %= memes.length || 1;
    }
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
    if (view === 'signin') {
      element('signin-status').textContent = 'Google sign-in needs the Meme Room server. You can vote in the feed without signing in.';
      return;
    }

    const catalog = await request(new URL('memes/catalog.json?v=6', import.meta.url), { cache: 'no-cache' });
    memes = view === 'good' ? catalog.filter(({ id }) => localStorage.getItem(voteKey(id)) === 'like') : catalog;
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
    memes = await request('/api/memes');
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
