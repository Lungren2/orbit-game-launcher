import themes from '../electron/themes.json' with { type: 'json' };
export { themes };

export function createThemeMusic({ AudioClass = Audio, storage = localStorage, onChange = () => {}, setTimer = setInterval, clearTimer = clearInterval, now = () => performance.now() } = {}) {
  let saved = {};
  try { saved = JSON.parse(storage.getItem('orbit-theme-music') || '{}'); } catch {}
  let muted = saved.muted === true;
  let volume = Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : 0.18;
  let selected = null, active = false, suspended = null, current = null, status = 'idle', disposed = false;
  const voices = new Set();
  const persist = () => { try { storage.setItem('orbit-theme-music', JSON.stringify({ muted, volume })); } catch {} };
  const state = () => ({ theme: selected?.theme || null, muted, volume, status });
  const notify = () => { if (!disposed) onChange(state()); };
  function release(voice) {
    if (voice.timer !== null) clearTimer(voice.timer);
    voice.timer = null; voice.released = true;
    voice.audio.pause(); voice.audio.removeAttribute('src'); voice.audio.load(); voices.delete(voice);
  }
  function fade(voice, destination, finished = () => {}) {
    if (voice.timer !== null) clearTimer(voice.timer);
    const from = voice.audio.volume, started = now();
    voice.timer = setTimer(() => {
      const progress = Math.min(1, Math.max(0, (now() - started) / 600));
      voice.audio.volume = from + (destination - from) * (1 - Math.cos(Math.PI * progress)) / 2;
      if (progress === 1) { clearTimer(voice.timer); voice.timer = null; finished(); }
    }, 30);
  }
  function retire() {
    if (!current) return;
    const voice = current; current = null;
    if (voice.audio.volume <= 0) release(voice);
    else fade(voice, 0, () => release(voice));
  }
  function start() {
    if (disposed) return;
    if (!selected?.theme || !active || muted || volume === 0 || suspended === selected.id) { retire(); status = 'idle'; notify(); return; }
    if (current) return;
    const audio = new AudioClass(selected.theme.src || `./music/${selected.theme.file}.mp3`);
    const voice = { audio, timer: null, released: false };
    voices.add(voice); current = voice;
    audio.loop = true; audio.volume = 0; status = 'loading'; notify();
    const failed = error => {
      if (voice.released) return;
      release(voice);
      if (current === voice) { current = null; status = error?.name === 'NotAllowedError' ? 'ready' : 'unavailable'; notify(); }
    };
    audio.addEventListener('error', failed, { once: true });
    audio.play().then(() => {
      if (disposed || current !== voice || voice.released) { release(voice); return; }
      status = 'playing'; fade(voice, volume); notify();
    }).catch(failed);
  }
  return {
    state,
    select(game, enabled = true) {
      const folder = game?.folder?.split(/[\\/]/).pop();
      const theme = game?.download ? null : game?.hasMusic && game.musicUrl ? { src: game.musicUrl, title: game.musicTitle || 'Game theme' } : themes[folder] || themes[game?.name];
      const id = theme ? game.id : null;
      if (selected?.id !== id || selected?.theme.src !== theme?.src || selected?.theme.file !== theme?.file) { retire(); selected = id ? { id, theme } : null; suspended = null; }
      active = enabled; start(); notify();
    },
    setMuted(value) { muted = Boolean(value); persist(); if (!muted) suspended = null; start(); notify(); },
    setVolume(value) {
      const next = Number(value); if (!Number.isFinite(next)) return;
      volume = Math.min(1, Math.max(0, next)); persist();
      if (current && volume > 0) fade(current, volume);
      start(); notify();
    },
    suspend() { suspended = selected?.id; retire(); status = 'idle'; notify(); },
    resume() { suspended = null; start(); },
    retry() { if (status === 'ready') start(); },
    dispose() { disposed = true; for (const voice of [...voices]) release(voice); current = null; },
  };
}
