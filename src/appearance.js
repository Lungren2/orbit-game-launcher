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

export function homeColumns(count, width = 1440) {
  if (count < 1) return 1;
  const maximum = width < 1100 ? 5 : width < 1800 ? 7 : 9;
  return Math.min(count, maximum, Math.max(2, Math.ceil(Math.sqrt(count * 1.35))));
}

export function homeTileSize(count, columns, width, height, gap = 16) {
  const rows = Math.max(1, Math.ceil(count / columns));
  const across = (width - gap * (columns - 1)) / columns;
  const down = (height - gap * (rows - 1)) / rows - 37;
  return Math.max(62, Math.floor(Math.min(280, across, down)));
}
