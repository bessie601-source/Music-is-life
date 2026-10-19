'use strict';

// Music comes from the Internet Archive (archive.org), whose public API needs
// no account or key. Every source below is free and legal to download:
// trade-friendly live tapes, Creative Commons netlabels, public-domain 78s.
const IA = 'https://archive.org';
const PAGE_SIZE = 24;
const SOURCES = {
  all: '(collection:etree OR collection:netlabels OR collection:georgeblood OR licenseurl:*creativecommons.org* OR licenseurl:*publicdomain*)',
  cc: 'licenseurl:*creativecommons.org*',
  live: 'collection:etree',
  netlabels: 'collection:netlabels',
  '78s': 'collection:georgeblood',
};
const SUGGESTIONS = ['jazz', 'blues', 'electronic', 'ambient', 'hip hop', 'rock', 'classical', 'folk', 'reggae', 'lo-fi'];
// Most preferred first: small, widely playable files before lossless ones.
const AUDIO_FORMATS = ['VBR MP3', 'MP3', '128Kbps MP3', '64Kbps MP3', 'Ogg Vorbis', 'Flac', '24bit Flac'];

const $ = (sel) => document.querySelector(sel);
const state = { query: '', source: 'all', page: 1, total: 0, queue: [], queueIndex: -1, objectUrl: null };

// Builds DOM nodes without innerHTML, since archive.org metadata is user-supplied.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

const first = (v) => (Array.isArray(v) ? v[0] : v) || '';
const thumb = (id) => `${IA}/services/img/${encodeURIComponent(id)}`;
const fileUrl = (id, name) => `${IA}/download/${encodeURIComponent(id)}/${name.split('/').map(encodeURIComponent).join('/')}`;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3500);
}

function formatLength(len) {
  if (!len) return '';
  if (String(len).includes(':')) return len;
  const s = Math.round(parseFloat(len));
  if (!Number.isFinite(s)) return '';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function safeFilename(s) {
  return s.replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 150) || 'track';
}

// ---------- Views ----------

function show(view) {
  for (const v of ['search', 'album', 'library', 'bandcamp']) $(`#view-${v}`).hidden = v !== view;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.view === (view === 'album' ? 'search' : view));
  });
  if (view === 'library') renderLibrary();
  if (view === 'bandcamp') renderBandcamp();
  window.scrollTo(0, 0);
}

// ---------- Search ----------

function buildQuery(text, source) {
  const cleaned = text.replace(/[:()[\]{}"\\]/g, ' ').trim();
  return [cleaned && `(${cleaned})`, 'mediatype:audio', SOURCES[source]].filter(Boolean).join(' AND ');
}

async function search(append = false) {
  const status = $('#status');
  const results = $('#results');
  const more = $('#more');
  if (!append) {
    state.page = 1;
    results.replaceChildren();
  }
  status.textContent = 'Searching…';
  $('#bc-search-link').href = bandcampSearchUrl(state.query);
  more.hidden = true;

  const params = new URLSearchParams({ q: buildQuery(state.query, state.source), rows: PAGE_SIZE, page: state.page, output: 'json' });
  for (const f of ['identifier', 'title', 'creator', 'year', 'date']) params.append('fl[]', f);
  params.append('sort[]', 'downloads desc');

  try {
    const res = await fetch(`${IA}/advancedsearch.php?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const docs = data.response.docs;
    state.total = data.response.numFound;
    for (const doc of docs) results.append(card(doc));
    const shown = results.children.length;
    status.textContent = shown ? `${state.total.toLocaleString()} free albums & recordings` : 'Nothing found. Try another search or source.';
    more.hidden = shown >= state.total || docs.length === 0;
  } catch (err) {
    status.textContent = `Couldn't reach the music library (${err.message}). Check your connection and try again.`;
  }
}

function card(doc) {
  const year = first(doc.year) || first(doc.date).slice(0, 4);
  return el('button', { class: 'card', onclick: () => openAlbum(doc.identifier) },
    el('img', { src: thumb(doc.identifier), alt: '', loading: 'lazy' }),
    el('div', { class: 'meta' },
      el('div', { class: 'title' }, first(doc.title) || doc.identifier),
      el('div', { class: 'sub' }, [first(doc.creator), year].filter(Boolean).join(' · '))));
}

// ---------- Album ----------

function pickTracks(files) {
  const audio = files.filter((f) => AUDIO_FORMATS.includes(f.format));
  const format = AUDIO_FORMATS.find((fmt) => audio.some((f) => f.format === fmt));
  return audio
    .filter((f) => f.format === format)
    .sort((a, b) => (parseInt(a.track, 10) || 1e9) - (parseInt(b.track, 10) || 1e9) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

async function openAlbum(id) {
  const box = $('#album');
  box.replaceChildren(el('p', { class: 'status' }, 'Loading…'));
  show('album');

  let data;
  try {
    const res = await fetch(`${IA}/metadata/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    box.replaceChildren(el('p', { class: 'status' }, `Couldn't load this album (${err.message}).`));
    return;
  }

  const meta = data.metadata || {};
  const album = first(meta.title) || id;
  const artist = first(meta.creator) || 'Unknown artist';
  const files = pickTracks(data.files || []);
  const tracks = files.map((f, i) => ({
    id: `${id}/${f.name}`,
    identifier: id,
    name: f.name,
    title: f.title || f.name.replace(/\.[^.]+$/, ''),
    artist: f.artist || f.creator || artist,
    album,
    albumArtist: artist,
    length: formatLength(f.length),
    ext: f.name.split('.').pop(),
    url: fileUrl(id, f.name),
    art: thumb(id),
    num: i + 1,
  }));

  const license = first(meta.licenseurl);
  const saved = await libraryIds();

  box.replaceChildren(
    el('div', { class: 'album-head' },
      el('img', { src: thumb(id), alt: '' }),
      el('div', { class: 'info' },
        el('h2', {}, album),
        el('div', { class: 'sub' }, [artist, first(meta.date) || first(meta.year)].filter(Boolean).join(' · ')),
        el('div', { class: 'license' },
          license ? el('a', { href: license, target: '_blank', rel: 'noopener' }, 'License') : 'Free to download from the Internet Archive',
          ' · ',
          el('a', { href: `${IA}/details/${encodeURIComponent(id)}`, target: '_blank', rel: 'noopener' }, 'Source page')),
        tracks.length > 0 && el('div', { class: 'album-actions' },
          el('button', { class: 'btn primary', onclick: () => playQueue(tracks, 0) }, '▶ Play all'),
          el('button', { class: 'btn', onclick: (e) => saveAll(tracks, e.currentTarget) }, '＋ Save all to library')))),
    tracks.length
      ? el('ol', { class: 'tracks' }, tracks.map((t, i) => trackRow(t, tracks, i, saved.has(t.id))))
      : el('p', { class: 'status' }, 'No playable audio files in this item.'));
  highlightPlaying();
}

function trackRow(track, list, index, isSaved) {
  return el('li', { class: 'track', 'data-id': track.id },
    el('span', { class: 't-num' }, track.num),
    el('span', { class: 't-name', title: track.title, onclick: () => playQueue(list, index) },
      track.title, track.artist !== track.albumArtist && el('small', {}, track.artist)),
    el('span', { class: 't-len' }, track.length),
    el('span', { class: 't-actions' },
      el('button', { class: 'icon-btn', title: 'Play', 'aria-label': 'Play', onclick: () => playQueue(list, index) }, '▶'),
      el('button', {
        class: `icon-btn${isSaved ? ' done' : ''}`,
        title: isSaved ? 'Saved in library' : 'Save to library (plays offline)',
        'aria-label': 'Save to library',
        onclick: (e) => saveToLibrary(track, e.currentTarget),
      }, isSaved ? '✓' : '＋'),
      el('button', { class: 'icon-btn', title: 'Download to device', 'aria-label': 'Download', onclick: (e) => downloadToDevice(track, e.currentTarget) }, '⬇')));
}

// ---------- Downloading ----------

async function fetchBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function downloadToDevice(track, btn) {
  const filename = safeFilename(`${track.artist} - ${track.title}`) + `.${track.ext}`;
  if (btn) btn.disabled = true;
  try {
    const blob = track.blob || (await getFromLibrary(track.id))?.blob || (await fetchBlob(track.url));
    saveBlob(blob, filename);
    toast(`Downloading "${track.title}"`);
  } catch {
    // Some browsers block the cross-origin fetch; fall back to the direct file link.
    window.open(track.url, '_blank', 'noopener');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------- Offline library (IndexedDB) ----------

let dbPromise;
function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('music-is-life', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('tracks', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const store = (await db()).transaction('tracks', mode).objectStore('tracks');
  return new Promise((resolve, reject) => {
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const getFromLibrary = (id) => tx('readonly', (s) => s.get(id)).catch(() => undefined);
const allLibrary = () => tx('readonly', (s) => s.getAll()).catch(() => []);
const libraryIds = async () => new Set((await tx('readonly', (s) => s.getAllKeys()).catch(() => [])));

async function updateLibraryCount() {
  const ids = await libraryIds();
  $('#lib-count').textContent = ids.size ? `(${ids.size})` : '';
}

async function saveToLibrary(track, btn) {
  if (await getFromLibrary(track.id)) return;
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const blob = await fetchBlob(track.url);
    await tx('readwrite', (s) => s.put({ ...track, blob, savedAt: Date.now() }));
    if (btn) { btn.textContent = '✓'; btn.classList.add('done'); btn.title = 'Saved in library'; }
    updateLibraryCount();
    return true;
  } catch (err) {
    if (btn) btn.textContent = '＋';
    toast(`Couldn't save "${track.title}" (${err.message})`);
    return false;
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveAll(tracks, btn) {
  btn.disabled = true;
  let done = 0;
  for (const t of tracks) {
    btn.textContent = `Saving ${++done}/${tracks.length}…`;
    const rowBtn = document.querySelector(`.track[data-id="${CSS.escape(t.id)}"] .icon-btn[aria-label="Save to library"]`);
    await saveToLibrary(t, rowBtn);
  }
  btn.textContent = '✓ Saved to library';
}

async function removeFromLibrary(id) {
  await tx('readwrite', (s) => s.delete(id));
  updateLibraryCount();
  renderLibrary();
}

async function renderLibrary() {
  const box = $('#library');
  const items = (await allLibrary()).sort((a, b) => b.savedAt - a.savedAt);
  if (!items.length) {
    box.replaceChildren(el('p', { class: 'status' }, 'Your library is empty. Tap ＋ on any track to save it here.'));
    return;
  }
  box.replaceChildren(el('ol', { class: 'tracks' }, items.map((t, i) =>
    el('li', { class: 'track', 'data-id': t.id },
      el('span', { class: 't-num' }, i + 1),
      el('span', { class: 't-name', title: t.title, onclick: () => playQueue(items, i) }, t.title, el('small', {}, `${t.artist} · ${t.album}`)),
      el('span', { class: 't-len' }, t.length),
      el('span', { class: 't-actions' },
        el('button', { class: 'icon-btn', title: 'Play', 'aria-label': 'Play', onclick: () => playQueue(items, i) }, '▶'),
        el('button', { class: 'icon-btn', title: 'Download to device', 'aria-label': 'Download', onclick: () => downloadToDevice(t) }, '⬇'),
        el('button', { class: 'icon-btn', title: 'Remove from library', 'aria-label': 'Remove', onclick: () => removeFromLibrary(t.id) }, '✕'))))));
  highlightPlaying();
}

// ---------- Player ----------

function playQueue(list, index) {
  state.queue = list;
  state.queueIndex = index;
  playCurrent();
}

async function playCurrent() {
  const track = state.queue[state.queueIndex];
  if (!track) return;
  const audio = $('#audio');
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = null;

  // Prefer the saved copy so library tracks play offline.
  const blob = track.blob || (await getFromLibrary(track.id))?.blob;
  if (blob) state.objectUrl = URL.createObjectURL(blob);
  audio.src = state.objectUrl || track.url;
  audio.play().catch(() => {});

  $('#player').hidden = false;
  $('#now-title').textContent = track.title;
  $('#now-artist').textContent = `${track.artist} · ${track.album}`;
  $('#now-art').src = track.art;
  highlightPlaying();

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: track.album, artwork: [{ src: track.art }] });
  }
}

function step(delta) {
  const next = state.queueIndex + delta;
  if (next >= 0 && next < state.queue.length) {
    state.queueIndex = next;
    playCurrent();
  }
}

function highlightPlaying() {
  const id = state.queue[state.queueIndex]?.id;
  document.querySelectorAll('.track').forEach((row) => row.classList.toggle('playing', row.dataset.id === id));
}

// ---------- Bandcamp ----------
// Bandcamp has no public search API and doesn't allow downloading outside its
// site, so search opens on Bandcamp and saved albums use its official player.

const BC_KEY = 'bandcamp-albums';

function bandcampSearchUrl(q) {
  const params = new URLSearchParams({ item_type: 'a' });
  if (q.trim()) params.set('q', q.trim());
  return `https://bandcamp.com/search?${params}`;
}

function loadBandcamp() {
  try { return JSON.parse(localStorage.getItem(BC_KEY)) || []; } catch { return []; }
}

function storeBandcamp(items) {
  try { localStorage.setItem(BC_KEY, JSON.stringify(items)); } catch { toast("Couldn't save. Your browser may be blocking storage."); }
}

function isBandcampUrl(href) {
  try {
    const u = new URL(href);
    return u.protocol === 'https:' && (u.hostname === 'bandcamp.com' || u.hostname.endsWith('.bandcamp.com'));
  } catch { return false; }
}

// Reads the album/track ID, page link and title out of Bandcamp's embed code.
// DOMParser never runs scripts, and only the numeric ID reaches the iframe.
function parseBandcampEmbed(code) {
  const doc = new DOMParser().parseFromString(code, 'text/html');
  const iframe = doc.querySelector('iframe');
  const src = iframe?.getAttribute('src') || code;
  const match = src.match(/bandcamp\.com\/EmbeddedPlayer\/(?:v=2\/)?(album|track)=(\d+)/);
  if (!match) return null;
  // Bandcamp puts its <a> link inside the <iframe>, where HTML parses it as text.
  const inner = iframe ? new DOMParser().parseFromString(iframe.textContent, 'text/html') : doc;
  const link = inner.querySelector('a[href]') || doc.querySelector('a[href]');
  const href = link && isBandcampUrl(link.href) ? link.href : '';
  return { type: match[1], id: match[2], url: href, title: link?.textContent.trim() || 'Bandcamp album' };
}

function embedSrc(item) {
  // Bandcamp picks its text colour from bgcol, so match the app's theme.
  const dark = !matchMedia('(prefers-color-scheme: light)').matches;
  const colors = dark ? 'bgcol=221c2b/linkcol=dab080' : 'bgcol=fffaf2/linkcol=9e4479';
  return `https://bandcamp.com/EmbeddedPlayer/${item.type}=${item.id}/size=large/${colors}/artwork=small/`;
}

function renderBandcamp() {
  const items = loadBandcamp();
  const box = $('#bc-list');
  if (!items.length) {
    box.replaceChildren(el('p', { class: 'status' }, 'No Bandcamp albums yet. Add one with the steps above.'));
    $('.bc-add').open = true;
    return;
  }
  box.replaceChildren(...items.map((item) =>
    el('div', { class: 'bc-item' },
      el('div', { class: 'title' }, item.title),
      el('iframe', { src: embedSrc(item), title: item.title, loading: 'lazy', seamless: true }),
      el('div', { class: 'album-actions' },
        item.url && el('a', { class: 'btn primary', href: item.url, target: '_blank', rel: 'noopener' }, 'Get it on Bandcamp ↗'),
        el('button', { class: 'btn', onclick: () => { storeBandcamp(loadBandcamp().filter((i) => i.id !== item.id)); renderBandcamp(); } }, 'Remove')))));
}

$('#bc-search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  window.open(bandcampSearchUrl($('#bc-q').value), '_blank', 'noopener');
});

$('#bc-add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('#bc-code').value;
  const item = parseBandcampEmbed(code);
  if (!item) {
    toast(isBandcampUrl(code.trim())
      ? 'That is a page link. Paste the embed code from Share / Embed instead.'
      : "That doesn't look like Bandcamp embed code.");
    return;
  }
  const items = loadBandcamp();
  if (items.some((i) => i.id === item.id)) {
    toast('That album is already in your list.');
  } else {
    storeBandcamp([item, ...items]);
    toast(`Added "${item.title}"`);
  }
  $('#bc-code').value = '';
  renderBandcamp();
});

// ---------- Wiring ----------

$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  state.query = $('#q').value;
  state.source = $('#source').value;
  search();
});
$('#source').addEventListener('change', () => $('#search-form').requestSubmit());
$('#more').addEventListener('click', () => { state.page += 1; search(true); });
$('#back').addEventListener('click', () => show('search'));
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));
$('#audio').addEventListener('ended', () => step(1));

$('#chips').append(...SUGGESTIONS.map((s) =>
  el('button', { class: 'chip', type: 'button', onclick: () => { $('#q').value = s; $('#search-form').requestSubmit(); } }, s)));

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
  navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

updateLibraryCount();
search();
