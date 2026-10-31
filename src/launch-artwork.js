// The user's cinematic handoff intentionally outlasts ordinary control springs.
export const launchTiming = Object.freeze({ zoom:1600, hold:4800, reducedHold:700, fade:500, failureFade:160 });

export function launchArtwork({ game, art, sourceRect, enabled = true, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, page = document } = {}) {
  if (!enabled) return { fail() {}, async close() {} };
  const overlay = page.createElement('div');
  overlay.className = 'launch-artwork';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-label', `Starting ${game.name}`);
  const source = art(game, 'hero');
  const image = page.createElement(source ? 'img' : 'div');
  image.className = source ? 'launch-artwork-image' : 'launch-artwork-fallback';
  if (source) {
    image.src = source; image.alt = '';
    image.addEventListener('error', () => {
      const fallback = page.createElement('div'); fallback.className = 'launch-artwork-fallback'; fallback.textContent = game.name;
      image.replaceWith(fallback);
    }, { once:true });
  } else image.textContent = game.name;
  overlay.append(image);
  page.body.append(overlay); page.body.classList.add('launching');
  const started = performance.now();
  let failed = false, closing;
  const animations = [];
  if (!reduced && sourceRect?.width && sourceRect?.height) {
    const viewport = overlay.getBoundingClientRect();
    animations.push(image.animate([
      { transform:`translate(${sourceRect.left}px,${sourceRect.top}px) scale(${sourceRect.width/viewport.width},${sourceRect.height/viewport.height})`, borderRadius:'12px' },
      { transform:'none', borderRadius:'0px' },
    ], { duration:launchTiming.zoom, easing:'cubic-bezier(.22,.65,.25,1)', fill:'both' }));
    animations.push(overlay.animate([{backgroundColor:'#05081200'},{backgroundColor:'#050812'}], {duration:launchTiming.zoom,fill:'both'}));
  }
  return {
    fail() { failed = true; },
    close() {
      if (closing) return closing;
      closing = (async () => {
        try {
          // Launch IPC runs immediately; artwork covers the handoff without delaying it.
          const remaining = (failed ? 0 : reduced ? launchTiming.reducedHold : launchTiming.hold) - (performance.now() - started);
          if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
          if (!reduced) await overlay.animate([{opacity:1},{opacity:0}], {duration:failed?launchTiming.failureFade:launchTiming.fade,fill:'forwards'}).finished;
        } catch { /* Interrupted visual effects must not prevent cleanup. */ }
        finally { animations.forEach(animation => animation.cancel()); overlay.remove(); page.body.classList.remove('launching'); }
      })();
      return closing;
    },
  };
}
