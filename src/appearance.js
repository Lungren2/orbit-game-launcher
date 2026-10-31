export function readAppearance(storage) {
  let saved = {};
  try { saved = JSON.parse(storage.getItem('orbit-appearance') || '{}'); } catch {}
  return { jungle: saved.jungle !== false, launchVortex: saved.launchVortex !== false };
}

export function createAppearance({ storage = localStorage, page = document, reduced = matchMedia('(prefers-reduced-motion: reduce)') } = {}) {
  const preferences = readAppearance(storage);
  const video = page.querySelector('.jungle-video');
  let suspended = false;
  function refresh() {
    page.body.dataset.jungle = String(preferences.jungle);
    const scene = page.querySelector('.jungle-scene');
    scene.hidden = !preferences.jungle;
    if (!preferences.jungle) {
      video.pause();
      if (video.hasAttribute('src')) { video.removeAttribute('src'); video.load(); }
      return;
    }
    if (reduced.matches || page.hidden || suspended) { video.pause(); return; }
    if (!video.hasAttribute('src')) video.src = './themes/jungle-4k.mp4';
    video.muted = true;
    video.play().catch(() => {});
  }
  reduced.addEventListener?.('change', refresh);
  refresh();
  return {
    state: () => ({ ...preferences }),
    set(key, value) {
      if (!['jungle','launchVortex'].includes(key) || typeof value !== 'boolean') return;
      preferences[key] = value;
      try { storage.setItem('orbit-appearance', JSON.stringify(preferences)); } catch {}
      refresh();
    },
    refresh,
    suspend(value) { suspended = Boolean(value); refresh(); },
    dispose() { video.pause(); reduced.removeEventListener?.('change', refresh); },
  };
}
