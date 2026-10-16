import './style.css';
import { createCatalogue } from './catalogue.js';
import { createDownloads } from './downloads.js';
import { createThemeMusic } from './theme-music.js';
import { createGameSetup } from './game-setup.js';

const icons = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  settings: '<path d="m9 3-.6 2.1-2 .9-2-.5-2 3.5 1.5 1.6v2.8L2.4 15l2 3.5 2-.5 2 .9L9 21h4l.6-2.1 2-.9 2 .5 2-3.5-1.5-1.6v-2.8L19.6 9l-2-3.5-2 .5-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  folder: '<path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11H3Z"/>',
  refresh: '<path d="M20 10a8 8 0 1 0-1 8M20 3v7h-7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  full: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const desktop = Boolean(window.orbit);
document.documentElement.classList.toggle('desktop', desktop);
const hasArt = g => Boolean(g.art || g.hasCover || g.hasHero || g.coverUrl);
const art = (g, type = 'hero') => {
  const kind = ['hero','logo'].includes(type) ? type : 'cover';
  const key = `has${kind[0].toUpperCase()}${kind.slice(1)}`;
  if (g[key]) return desktop ? `orbit-art://${g.id}/${kind}?v=${g.mediaVersion || 0}` : `/api/art/${g.id}/${kind}?v=${g.mediaVersion || 0}`;
  if (g.art) return kind === 'logo' ? `./art/${g.art}-logo.png` : `./art/${g.art}-library_${kind === 'hero' ? 'hero' : '600x900'}.jpg`;
  if (kind === 'logo') return '';
  if (kind === 'hero' && g.hasCover) return desktop ? `orbit-art://${g.id}/cover?v=${g.mediaVersion || 0}` : `/api/art/${g.id}/cover?v=${g.mediaVersion || 0}`;
  return kind === 'hero' ? g.heroUrl || g.coverUrl || '' : g.coverUrl || '';
};
let library = { games: [], root: 'D:\\Games', favorites: [], recent: {}, executables: {} };
let selectedId, view = 'games', filter = 'all', query = '', busy = false, loadError = '';
let toastTimer, lastFocus;

document.querySelector('#app').innerHTML = `
  <div class="backdrop" aria-hidden="true"><div class="wallpaper"></div><div class="vignette"></div><div class="grain"></div></div>
  <div class="shell">
    <header>
      <a class="brand" href="#" aria-label="Orbit home"><img class="brand-mark" src="./brand/orbit-mark.svg" alt="" draggable="false"></a>
      <nav aria-label="Main"><button class="nav-item active" data-view="games">Games</button><button class="nav-item" data-view="library">Library</button><button class="nav-item" data-view="catalogue">Catalogue</button></nav>
      <div class="utilities"><button class="icon-button downloads-button" id="downloads-button" aria-label="Downloads" title="Downloads">${icon('download')}<span id="downloads-count" hidden></span></button><button class="icon-button" id="search-button" aria-label="Search" title="Search">${icon('search')}</button><button class="icon-button" id="settings-button" aria-label="Settings" title="Settings">${icon('settings')}</button></div>
    </header>
    <main id="main"></main>
  </div>
  <dialog id="dialog"></dialog><div class="toast" role="status" aria-live="polite"></div>
  <div class="theme-player" hidden><button class="icon-button" id="theme-mute" aria-label="Mute theme music"></button><div class="theme-track"><span class="theme-caption">Game theme</span><span id="theme-title"></span></div><input id="theme-volume" type="range" min="0" max="100" aria-label="Theme music volume"></div>`;

const music = createThemeMusic({ onChange: state => {
  document.querySelector('.theme-player').hidden = !state.theme || view !== 'games';
  const button = document.querySelector('#theme-mute');
  const off = state.muted || state.volume === 0;
  button.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/>${off ? '<path d="m16 9 6 6m0-6-6 6"/>' : '<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'}</svg>`;
  button.setAttribute('aria-label', off ? 'Unmute theme music' : 'Mute theme music');
  button.setAttribute('aria-pressed', String(off));
  document.querySelector('#theme-title').textContent = state.theme?.title || '';
  document.querySelector('.theme-caption').textContent = state.status === 'unavailable' ? 'Theme unavailable' : off ? 'Theme muted' : 'Game theme';
  document.querySelector('#theme-volume').value = String(Math.round(state.volume * 100));
} });
document.querySelector('#theme-mute').onclick = () => {
  const state = music.state();
  if (state.volume === 0) music.setVolume(0.18);
  music.setMuted(state.volume === 0 ? false : !state.muted);
};
document.querySelector('#theme-volume').oninput = event => music.setVolume(Number(event.target.value) / 100);
document.addEventListener('pointerdown', () => music.retry());
document.addEventListener('visibilitychange', () => music.select(current(), view === 'games' && !document.hidden));
window.addEventListener('pagehide', () => music.dispose());

async function request(name, ...args) {
  const result = await window.orbit[name](...args);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
function toast(message) {
  const el = document.querySelector('.toast');
  el.textContent = message; el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 3500);
}
function current() { return library.games.find(g => g.id === selectedId); }
function filtered() {
  return library.games.filter(g => (!query || g.name.toLowerCase().includes(query.toLowerCase())) && (filter !== 'favorites' || library.favorites.includes(g.id)) && (filter !== 'recent' || library.recent[g.id])).sort((a, b) => filter === 'recent' ? new Date(library.recent[b.id]) - new Date(library.recent[a.id]) : 0);
}
function select(id, focus = false) {
  selectedId = id;
  render();
  if (focus) document.querySelector(`.game-tile[data-id="${id}"]`)?.focus({ preventScroll: true });
}
function imageFallback(event) {
  const img = event.target;
  if (img instanceof HTMLImageElement) { img.hidden = true; img.parentElement.classList.add('no-art'); }
}
document.addEventListener('error', imageFallback, true);

function render() {
  const main = document.querySelector('main');
  const game = current();
  music.select(game, view === 'games' && !document.hidden);
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  document.querySelector('.wallpaper').style.backgroundImage = game && hasArt(game) ? `url("${art(game)}")` : 'none';
  document.body.dataset.art = game?.art || 'default';
  document.body.dataset.view = view;
  document.querySelector('#search-button').hidden = view !== 'games';
  if (view === 'catalogue') { catalogue.mount(main); return; }
  if (view === 'downloads') { downloadsView.mount(main); return; }
  if (!library.games.length) {
    main.innerHTML = `<div class="empty-state">${icon('grid')}<h1>${loadError ? 'Library unavailable' : 'No games yet'}</h1><p>${esc(loadError || library.root)}</p><button class="pill" id="empty-refresh">${icon('refresh')} Refresh</button>${desktop ? '<button class="text-button" id="empty-folder">Choose folder</button>' : ''}</div>`;
    document.querySelector('#empty-refresh').onclick = load;
    document.querySelector('#empty-folder')?.addEventListener('click', chooseRoot);
    return;
  }
  if (view === 'games') {
    main.innerHTML = `
      <section class="game-rail" aria-label="Games">${library.games.map(g => `
        <button class="game-tile ${g.id === selectedId ? 'selected' : ''}" data-id="${g.id}" aria-label="${esc(g.name)}" aria-pressed="${g.id === selectedId}" title="${esc(g.name)}">
          <div class="tile-art" data-art="${esc(g.art || 'default')}">${hasArt(g) ? `<img src="${art(g, 'cover')}" alt="" draggable="false">` : ''}<span class="fallback-name">${esc(g.name)}</span></div>
        </button>`).join('')}
      </section>
      <section class="game-hero" aria-label="Selected game">
        <div class="hero-copy" key="${game.id}">
          ${game.hasLogo || game.art && game.art !== 'scritchy' && game.art !== 'cities' ? `<img class="game-logo" src="${art(game,'logo')}" alt="${esc(game.name)}"><h1 class="game-title logo-fallback ${esc(game.art || '')}">${esc(game.name)}</h1>` : `<h1 class="game-title ${esc(game.art || '')}">${game.art === 'cities' ? 'CITIES<span class="city-subtitle">SKYLINES II</span>' : esc(game.name)}</h1>`}
          <div class="hero-actions"><button class="play-button" id="play" ${busy || !game.executable && !library.executables[game.id] ? 'disabled' : ''}>${icon('play')}<span>${busy ? 'Starting' : 'Play'}</span></button><button class="icon-button game-menu" id="details" aria-label="Game details" title="Game details">${icon('more')}</button></div>
        </div>
      </section>`;
    main.querySelectorAll('.game-tile').forEach(el => el.onclick = () => select(el.dataset.id));
    main.querySelector('#play').onclick = play;
    main.querySelector('#details').onclick = details;
    // Logos are optional. Hide the fallback title only after the actual image has loaded.
    const logo = main.querySelector('.game-logo');
    if (logo) { logo.onload = () => { logo.classList.add('loaded'); main.querySelector('.logo-fallback').hidden = true; }; }
  } else {
    const games = filtered();
    main.innerHTML = `<section class="library-view"><div class="library-toolbar"><div class="filters" aria-label="Library filter">${[['all','All'],['favorites','Favorites'],['recent','Recent']].map(([id,label]) => `<button class="filter ${filter === id ? 'active' : ''}" data-filter="${id}" aria-pressed="${filter === id}">${label}</button>`).join('')}</div><label class="search-field">${icon('search')}<input id="search" type="search" placeholder="Search" aria-label="Search games" value="${esc(query)}"></label></div><div class="library-grid">${games.map(g => `<button class="library-card" data-id="${g.id}" aria-label="${esc(g.name)}"><div class="cover" data-art="${g.art || 'default'}">${hasArt(g) ? `<img src="${art(g)}" alt="" loading="lazy">` : ''}${library.favorites.includes(g.id) ? `<span class="tile-star">${icon('star')}</span>` : ''}<span class="card-name">${esc(g.name)}</span><span class="cover-open">${icon('chevron')}</span></div></button>`).join('')}</div>${!games.length ? '<div class="empty-filter">No games</div>' : ''}</section>`;
    main.querySelectorAll('[data-filter]').forEach(el => el.onclick = () => { filter = el.dataset.filter; render(); });
    main.querySelectorAll('.library-card').forEach(el => el.onclick = () => { selectedId = el.dataset.id; setView('games'); });
    main.querySelector('#search').oninput = e => {
      const pos = e.target.selectionStart; query = e.target.value; render();
      const input = main.querySelector('#search'); input.focus();
      try { input.setSelectionRange(pos, pos); } catch {}
    };
  }
}
function setView(next) { view = next; render(); }
async function load() {
  try {
    let data;
    if (desktop) data = await request('library');
    else {
      const response = await fetch('/api/library'); data = await response.json();
      if (!response.ok) throw new Error(data.error);
      let saved = {}; try { saved = JSON.parse(localStorage.getItem('orbit-preview') || '{}'); } catch {}
      data = { ...data, ...saved };
    }
    library = { favorites: [], recent: {}, executables: {}, ...data }; loadError = '';
    if (!current()) selectedId = [...library.games].sort((a,b) => new Date(library.recent[b.id] || 0) - new Date(library.recent[a.id] || 0))[0]?.id;
  } catch (error) { loadError = error.message; toast(error.message); }
  render();
}
async function play() {
  if (!desktop) return toast('Open Orbit on your desktop to play.');
  const game = current(); if (!game || busy) return;
  music.suspend();
  busy = true; render();
  try { const result = await request('launch', game.id); library.recent = result.recent; toast(`Starting ${game.name}`); }
  catch (error) { music.resume(); toast(error.message); }
  finally { busy = false; render(); }
}
async function favorite() {
  const id = selectedId;
  try {
    if (desktop) library.favorites = await request('favorite', id);
    else {
      library.favorites = library.favorites.includes(id) ? library.favorites.filter(x => x !== id) : [...library.favorites, id];
      localStorage.setItem('orbit-preview', JSON.stringify({ favorites: library.favorites }));
    }
    render();
    if (dialog.open) details();
  } catch (error) { toast(error.message); }
}
const dialog = document.querySelector('dialog');
const gameSetup = createGameSetup({ modal, dialog, request, load, getGame: id => library.games.find(g => g.id === id), desktop, esc, icon, art, toast });
let downloadToken = null;
let openingCatalogueGame = false;
const downloadsView = createDownloads({ desktop, request, esc, icon, toast, viewLibrary: async () => { await load(); setView('library'); } });
const catalogue = createCatalogue({
  icon, esc,
  request: async options => {
    if (desktop) return request('catalogue', options);
    const response = await fetch(`/api/catalogue?${new URLSearchParams(options)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Catalogue unavailable.');
    return data;
  },
  openGame: async game => {
    if (openingCatalogueGame || !game || !/^https:\/\/playzip\.com\/game\/\d+$/.test(game.url)) return;
    openingCatalogueGame = true;
    if (desktop) { try { downloadToken = await request('prepareDownload', game); } catch (error) { openingCatalogueGame = false; toast(error.message); return; } }
    modal(game.name, `<div class="playzip-frame-wrap"><iframe class="playzip-frame" src="${esc(game.url)}" title="${esc(game.name)} on PlayZip" sandbox="allow-scripts allow-same-origin allow-forms${desktop ? ' allow-downloads allow-popups' : ''}" referrerpolicy="no-referrer"></iframe></div>`);
    dialog.classList.add('catalogue-modal');
    if (desktop) { const button = document.createElement('button'); button.className = 'frame-import text-button'; button.textContent = 'Import archive'; button.onclick = () => downloadsView.addArchive(game); dialog.querySelector('.dialog-header').insertBefore(button, dialog.querySelector('#close-dialog')); }
    openingCatalogueGame = false;
  },
});
function modal(title, body) {
  lastFocus = document.activeElement;
  dialog.className = '';
  dialog.innerHTML = `<div class="dialog-header"><h2>${esc(title)}</h2><button class="icon-button" id="close-dialog" aria-label="Close">${icon('close')}</button></div>${body}`;
  dialog.querySelector('#close-dialog').onclick = () => dialog.close();
  if (!dialog.open) dialog.showModal();
}
dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
dialog.addEventListener('close', () => {
  if (dialog.classList.contains('catalogue-modal')) { dialog.replaceChildren(); dialog.className = ''; }
  if (downloadToken) { const token = downloadToken; downloadToken = null; request('endDownloadContext', token).catch(() => {}); }
  if (lastFocus?.isConnected) lastFocus.focus();
});
function details() {
  const game = current();
  modal(game.name, `<div class="detail-meta"><span class="platform-badge">PC</span>${esc(game.genre)}</div>${game.description ? `<p class="setup-description">${esc(game.description)}</p>` : ''}${game.developer ? `<p class="setup-help">${esc(game.developer)}</p>` : ''}<div class="path-label">Executable</div><div class="path-value">${esc(library.executables[game.id] || game.executable || 'None found')}</div><div class="dialog-actions"><button class="setting-row" id="game-setup">${icon('grid')}<span>Artwork & music</span>${icon('chevron')}</button><button class="setting-row" id="favorite">${icon('star')}<span>${library.favorites.includes(game.id) ? 'Remove from favorites' : 'Add to favorites'}</span></button><button class="setting-row" id="open-game-folder">${icon('folder')}<span>Open folder</span>${icon('chevron')}</button><button class="setting-row" id="choose-exe">${icon('grid')}<span>Choose executable</span>${icon('chevron')}</button></div>`);
  document.querySelector('#game-setup').onclick = () => gameSetup.open(game);
  document.querySelector('#favorite').onclick = favorite;
  document.querySelector('#open-game-folder').onclick = () => desktopAction(() => request('openFolder', game.id));
  document.querySelector('#choose-exe').onclick = () => desktopAction(async () => {
    const exe = await request('chooseExecutable', game.id);
    if (exe) { library.executables[game.id] = exe; render(); details(); }
  });
}
async function desktopAction(action) {
  if (!desktop) return toast('Available in the desktop app.');
  try { await action(); } catch (error) { toast(error.message); }
}
async function chooseRoot() {
  await desktopAction(async () => {
    const next = await request('chooseRoot');
    if (next) { library = next; selectedId = next.games[0]?.id; render(); if (dialog.open) settings(); }
  });
}
function settings() {
  modal('Settings', `<div class="path-label">Game folder</div><div class="path-value">${esc(library.root)}</div><div class="dialog-actions"><button class="setting-row" id="change-folder">${icon('folder')}<span>Change folder</span>${icon('chevron')}</button><button class="setting-row" id="rescan">${icon('refresh')}<span>Rescan library</span>${icon('chevron')}</button><button class="setting-row" id="settings-full">${icon('full')}<span>Fullscreen</span><kbd>F11</kbd></button><button class="setting-row" id="shortcuts">${icon('keyboard')}<span>Controls</span>${icon('chevron')}</button></div>`);
  document.querySelector('#change-folder').onclick = chooseRoot;
  document.querySelector('#rescan').onclick = async () => { await load(); dialog.close(); if (!loadError) toast('Library refreshed'); };
  document.querySelector('#settings-full').onclick = fullscreen;
  document.querySelector('#shortcuts').onclick = shortcuts;
  const auto = document.createElement('label'); auto.className = 'setting-row';
  auto.innerHTML = `<input type="checkbox" id="auto-game-setup" ${library.autoMetadata !== false ? 'checked' : ''}><span>Automatically fill missing artwork and game details</span>`;
  dialog.querySelector('.dialog-actions').prepend(auto);
  auto.querySelector('input').onchange = event => desktopAction(async () => { library.autoMetadata = await request('setAutoMetadata', event.target.checked); });
}
async function fullscreen() {
  try {
    if (desktop) await request('fullscreen');
    else if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) { toast(error.message); }
}
document.querySelectorAll('[data-view]').forEach(el => el.onclick = () => setView(el.dataset.view));
document.querySelector('.brand').onclick = e => { e.preventDefault(); setView('games'); };
document.querySelector('#settings-button').onclick = settings;
document.querySelector('#downloads-button').onclick = () => setView('downloads');
document.querySelector('#search-button').onclick = () => { filter = 'all'; setView('library'); document.querySelector('#search')?.focus(); };
function shortcuts() { modal('Controls', '<div class="shortcut-row"><span>Select game</span><span><kbd>←</kbd> <kbd>→</kbd></span></div><div class="shortcut-row"><span>Play selected</span><kbd>Enter</kbd></div><div class="shortcut-row"><span>Search</span><kbd>/</kbd></div><div class="shortcut-row"><span>Fullscreen</span><kbd>F11</kbd></div><div class="shortcut-row"><span>Back</span><kbd>Esc</kbd></div>'); }
document.addEventListener('keydown', e => {
  if (e.key === 'F11') { e.preventDefault(); fullscreen(); return; }
  if (dialog.open) return;
  if (e.key === 'Escape' && view !== 'games') { e.preventDefault(); query = ''; setView('games'); return; }
  if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === '/') { e.preventDefault(); if (view === 'catalogue') catalogue.focusSearch(); else document.querySelector('#search-button').click(); }
  if (view === 'games' && ['ArrowLeft','ArrowRight'].includes(e.key) && library.games.length) {
    e.preventDefault();
    const index = library.games.findIndex(g => g.id === selectedId);
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + library.games.length) % library.games.length;
    select(library.games[next].id, true);
    document.querySelector('.game-tile.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
  if (e.key === 'Enter' && view === 'games' && (e.target === document.body || e.target.classList.contains('game-tile'))) { e.preventDefault(); play(); }
});
if (desktop && window.orbit.onDownloads) {
  window.orbit.onLibraryUpdated?.(() => load());
  window.orbit.onDownloads(jobs => downloadsView.update(jobs));
  window.orbit.onImported(() => { load(); toast('Game added to library'); });
  request('downloads').then(jobs => downloadsView.update(jobs)).catch(error => toast(error.message));
}
load();
