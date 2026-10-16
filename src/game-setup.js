import { themes } from './theme-music.js';

export function createGameSetup({ modal, dialog, request, load, getGame, desktop, esc, icon, art, toast }) {
  let generation = 0;
  dialog.addEventListener('close', () => { generation++; });
  function open(game, message = '') {
    if (!desktop) { toast('Open desktop Orbit to configure artwork and music.'); return; }
    const token = ++generation;
    const bundled = themes[game.folder.split(/[\\/]/).pop()] || themes[game.name];
    modal('Artwork & music', `<div class="setup-game-name">${esc(game.name)}</div>
      <div class="setup-artwork"><button class="setup-cover" data-media="cover" aria-label="Choose cover image">${art(game,'cover') ? `<img src="${esc(art(game,'cover'))}" alt="Game cover">` : '<span>No cover yet</span>'}<span class="setup-image-action">Choose cover</span></button><button class="setup-wallpaper" data-media="hero" aria-label="Choose wallpaper image">${art(game,'hero') ? `<img src="${esc(art(game,'hero'))}" alt="Game wallpaper">` : '<span>No wallpaper yet</span>'}<span class="setup-image-action">Choose wallpaper</span></button></div>
      <div class="setup-section-heading"><h3>Game details</h3><button class="text-button" id="setup-auto">Auto-configure</button></div>
      <p class="setup-help">${game.metadataSource ? `Matched with ${esc(game.metadataSource)}. Search again to change the match.` : 'Find the matching game to get its cover, wallpaper, logo and details.'}</p>
      <form class="setup-search" id="setup-search"><input id="setup-query" aria-label="Game title to search" maxlength="200" value="${esc(game.name)}" required><button type="submit">Find game</button></form>
      <div class="setup-results" id="setup-matches"></div>
      ${game.description ? `<p class="setup-description">${esc(game.description)}</p>` : ''}
      ${game.developer ? `<p class="setup-help">${esc(game.developer)}${game.releaseDate ? ` · ${esc(game.releaseDate)}` : ''}</p>` : ''}
      <button class="setting-row setup-logo" data-media="logo">${icon('grid')}<span>${game.hasLogo ? 'Change logo' : 'Choose logo image'}</span>${icon('chevron')}</button>
      <div class="setup-section-heading"><h3>Theme music</h3><span class="setup-help">${game.hasMusic ? 'Saved locally' : bundled ? 'Included with Orbit' : 'Not configured'}</span></div>
      <div class="setup-track-name">${icon('play')}<span>${esc(game.hasMusic ? game.musicTitle : bundled?.title || 'Choose one track from this game')}</span></div>
      <div class="setup-music-actions"><button id="setup-find-music">Find in game files</button><button data-media="music">Choose audio file</button></div>
      <div class="setup-results" id="setup-tracks"></div>
      <p class="setup-help">MP3, OGG, WAV, M4A or FLAC. Music is copied locally and loops when you select this game.</p>
      <div class="setup-status" id="setup-status" role="status" aria-live="polite">${esc(message)}</div>`);
    dialog.classList.add('game-setup');
    const valid = () => generation === token && dialog.open && dialog.classList.contains('game-setup');
    const status = text => { if (valid()) dialog.querySelector('#setup-status').textContent = text; };
    let busy = false;
    async function action(fn, text, refresh = false) {
      if (busy) return;
      busy = true; status(text);
      dialog.querySelectorAll('button:not(#close-dialog),input').forEach(el => el.disabled = true);
      try {
        const result = await fn();
        if (result === null) status('No file selected.');
        if (refresh && result) { await load(); if (valid()) open(getGame(game.id), 'Saved. Artwork and music are available offline.'); }
        return result;
      } catch (e) { status(e.message); }
      finally { busy = false; if (valid()) dialog.querySelectorAll('button,input').forEach(el => el.disabled = false); }
    }
    dialog.querySelectorAll('[data-media]').forEach(button => button.onclick = () => action(() => request('chooseMedia', game.id, button.dataset.media), 'Choosing a file…', true));
    dialog.querySelector('#setup-search').onsubmit = async event => {
      event.preventDefault();
      const query = dialog.querySelector('#setup-query').value.trim();
      const results = await action(() => request('searchMetadata', game.id, query), 'Looking for matching games…');
      if (!results || !valid()) return;
      dialog.querySelector('#setup-matches').innerHTML = results.map((item,i) => `<button class="setup-match" data-match="${i}">${item.image ? `<img src="${esc(item.image)}" alt="">` : ''}<span>${esc(item.name)}</span><span class="setup-use">Use</span></button>`).join('');
      status(results.length ? 'Choose the matching game. Your own images and music will be kept.' : 'No matches found. Try a shorter title, or choose your own files.');
      dialog.querySelectorAll('[data-match]').forEach(button => button.onclick = () => action(() => request('applyMetadata', game.id, results[Number(button.dataset.match)].id), 'Saving artwork and game details…', true));
    };
    dialog.querySelector('#setup-auto').onclick = async () => {
      const result = await action(() => request('autoConfigure', game.id), 'Detecting game details and music…');
      if (!result || !valid()) return;
      await load();
      if (valid()) open(getGame(game.id), result.needsMatch ? 'Choose a game match below, or add images and audio from your files.' : 'Setup complete. Use Find in game files or Choose audio file to change the theme.');
    };
    dialog.querySelector('#setup-find-music').onclick = async () => {
      const tracks = await action(() => request('musicCandidates', game.id), 'Looking for theme music in the game folder…');
      if (!tracks || !valid()) return;
      dialog.querySelector('#setup-tracks').innerHTML = tracks.map((item,i) => `<button class="setup-match setup-track" data-track="${i}"><span>${esc(item.name)}<small>${esc(item.relative)}</small></span><span class="setup-use">Use</span></button>`).join('');
      status(tracks.length ? 'Choose one track to use as this game’s theme.' : 'No playable theme files found. Choose an audio file from this game’s soundtrack.');
      dialog.querySelectorAll('[data-track]').forEach(button => button.onclick = () => action(() => request('useMusic', game.id, tracks[Number(button.dataset.track)].file), 'Saving theme music…', true));
    };
  }
  return { open };
}
