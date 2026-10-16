import themes from '../electron/themes.json' with { type: 'json' };
export { themes };

export function createThemeMusic({ AudioClass = Audio, storage = localStorage, onChange = () => {}, setTimer = setInterval, clearTimer = clearInterval } = {}) {
  let saved = {};
  try { saved = JSON.parse(storage.getItem('orbit-theme-music') || '{}'); } catch {}
  let muted = saved.muted === true;
  let volume = Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : 0.18;
  let selected = null, active = false, suspended = null, audio = null, timer = null, generation = 0, status = 'idle';
  const persist = () => { try { storage.setItem('orbit-theme-music', JSON.stringify({ muted, volume })); } catch {} };
  const state = () => ({ theme: selected?.theme || null, muted, volume, status });
  const notify = () => onChange(state());
  const stop = () => {
    generation++;
    if (timer !== null) { clearTimer(timer); timer = null; }
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; }
    status = 'idle';
  };
  const start = () => {
    if (!selected?.theme || !active || muted || volume === 0 || suspended === selected.id) { stop(); notify(); return; }
    if (audio) return;
    const token = ++generation;
    const next = new AudioClass(selected.theme.src || `./music/${selected.theme.file}.mp3`);
    audio = next;
    next.loop = true;
    next.volume = 0;
    status = 'loading';
    notify();
    const failed = error => {
      if (token !== generation) return;
      stop();
      status = error?.name === 'NotAllowedError' ? 'ready' : 'unavailable';
      notify();
    };
    next.addEventListener('error', failed, { once: true });
    next.play().then(() => {
      if (token !== generation) { next.pause(); return; }
      status = 'playing';
      notify();
      timer = setTimer(() => {
        next.volume = Math.min(volume, next.volume + Math.max(volume / 15, 0.005));
        if (next.volume >= volume) { clearTimer(timer); timer = null; }
      }, 30);
    }).catch(failed);
  };
  return {
    state,
    select(game, enabled = true) {
      const folder = game?.folder?.split(/[\\/]/).pop();
      const theme = game?.hasMusic && game.musicUrl ? { src: game.musicUrl, title: game.musicTitle || 'Game theme' } : themes[folder] || themes[game?.name];
      const id = theme ? game.id : null;
      if (selected?.id !== id || selected?.theme.src !== theme?.src || selected?.theme.file !== theme?.file) { stop(); selected = id ? { id, theme } : null; suspended = null; }
      if (active !== enabled) { active = enabled; if (!active) stop(); }
      start(); notify();
    },
    setMuted(value) { muted = Boolean(value); persist(); if (muted) stop(); else suspended = null; start(); notify(); },
    setVolume(value) {
      const next = Number(value);
      if (!Number.isFinite(next)) return;
      volume = Math.min(1, Math.max(0, next)); persist();
      if (timer !== null) { clearTimer(timer); timer = null; }
      if (audio) audio.volume = volume;
      start(); notify();
    },
    suspend() { suspended = selected?.id; stop(); notify(); },
    resume() { suspended = null; start(); },
    retry() { if (status === 'ready') start(); },
    dispose() { stop(); },
  };
}
