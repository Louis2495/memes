import { connectEmailAuth } from './email-auth.js?v=1';

const element = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const view = ['good', 'signin'].includes(params.get('view')) ? params.get('view') : 'feed';
const staticHost = document.documentElement.dataset.host === 'static';
const controls = ['previous', 'dislike', 'like', 'next'];
let session;
let hosted;
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

function seenAt(id) {
  try {
    return Number(localStorage.getItem(seenKey(id))) || 0;
  } catch {
    return 0;
  }
}
const wasRemoved = (id) => hasStoredFlag(removedKey(id));

function showFeedMeme(position) {
  while (memes[position] && !seenOnThisPage.has(memes[position].id) && seenAt(memes[position].id)) {
    memes.splice(position, 1);
    previouslySeen++;
  }
  index = position;
  const current = memes[index];
  if (!current || seenOnThisPage.has(current.id)) return;

  seenOnThisPage.add(current.id);
  try {
    localStorage.setItem(seenKey(current.id), String(Date.now()));
  } catch {
    // The current page still traverses the shuffled list without replacement.
  }
}

function startFeed(catalog) {
  feedTotal = catalog.length;
  const history = [];
  const unseen = [];
  for (const meme of catalog) {
    const timestamp = seenAt(meme.id);
    if (timestamp) {
      history.push({ meme, timestamp });
      seenOnThisPage.add(meme.id);
    } else {
      unseen.push(meme);
    }
  }
  history.sort((first, second) => first.timestamp - second.timestamp);
  for (let last = unseen.length - 1; last > 0; last--) {
    const other = Math.floor(Math.random() * (last + 1));
    [unseen[last], unseen[other]] = [unseen[other], unseen[last]];
  }
  memes = [...history.map(({ meme }) => meme), ...unseen];
  showFeedMeme(history.length);
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
    element(id).disabled = canGoBack ? index === 0 : !current;
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
  const button = element(reaction);
  button.setAttribute('aria-busy', 'true');
  const removing = reaction === 'dislike' && (session?.admin || (staticHost && !hosted));
  element('status').textContent = removing ? 'Removing meme…'
    : reaction === 'like' ? 'Saving like…' : 'Saving dislike…';
  try {
    let result = { deleted: false };
    if (hosted && session?.admin && reaction === 'dislike') {
      const { error } = await hosted.rpc('remove_meme', { meme_id: current.id });
      if (error) throw error;
      result.deleted = true;
    } else if (staticHost) {
      if ((!hosted && reaction === 'dislike') || wasRemoved(current.id)) {
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
    const removedMessage = staticHost && !hosted ? 'Meme removed from this browser.' : 'Meme permanently deleted.';
    element('status').textContent = result.deleted ? removedMessage : reaction === 'like' ? 'Saved to Good.' : 'Disliked.';
  } catch (error) {
    if (error.status === 401) location.assign('?view=signin');
    if (error.status === 404) removeCurrent();
    element('status').textContent = hosted ? 'Could not update this meme. Try again.' : staticHost ? 'Could not save your vote in this browser.' : error.message;
  } finally {
    button.removeAttribute('aria-busy');
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
    if (hosted) {
      const { error } = await hosted.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } else {
      await request('/auth/logout', { method: 'POST' });
    }
    location.assign('./');
  } catch {
    element(view === 'signin' ? 'signin-status' : 'status').textContent = 'Could not sign out. Try again.';
  }
};

function setLeftAction(label, description) {
  const button = element('dislike');
  button.setAttribute('aria-label', description);
  button.querySelector('span').textContent = label;
}

async function loadHostedAccount() {
  const { data, error } = await hosted.auth.getSession();
  if (error) throw error;
  if (!data.session) return;
  const { data: admin, error: adminError } = await hosted.rpc('is_meme_admin');
  if (adminError) throw adminError;
  session = { email: data.session.user.email, admin };
  element('sign-in').hidden = true;
  element('sign-out').hidden = false;
  if (admin) setLeftAction('Delete', 'Delete from the shared feed');
}

function showEmailSignIn() {
  const status = element('signin-status');
  if (!hosted) {
    status.textContent = 'Email sign-in is awaiting Supabase setup.';
    return;
  }
  if (session?.email) {
    status.textContent = `Signed in as ${session.email}${session.admin ? ' · Admin' : ''}`;
    return;
  }
  const form = element('email-signin');
  form.hidden = false;
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const { error } = await hosted.auth.signInWithOtp({
        email: element('signin-email').value.trim(),
        options: { emailRedirectTo: new URL('./', location.href).href },
      });
      if (error) throw error;
      status.textContent = 'Check your inbox and open the sign-in link in this browser.';
    } catch (error) {
      status.textContent = error.message || 'Could not send the link. Try again.';
    } finally {
      button.disabled = false;
    }
  };
}

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
    hosted = await connectEmailAuth();
    if (hosted) await loadHostedAccount();
    else setLeftAction('Remove', 'Remove in this browser');

    if (view === 'signin') {
      showEmailSignIn();
      return;
    }

    const catalogRequest = request(new URL('memes/catalog.json?v=36', import.meta.url), { cache: 'no-cache' });
    const deletionsRequest = hosted ? hosted.rpc('removed_meme_ids') : Promise.resolve({ data: [] });
    const [catalog, removals] = await Promise.all([catalogRequest, deletionsRequest]);
    if (removals.error) throw removals.error;
    const deleted = new Set(removals.data);
    const available = catalog.filter(({ id }) => !deleted.has(id) && !wasRemoved(id));
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
