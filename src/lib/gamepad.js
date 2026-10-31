// Controller input for the standard gamepad mapping (Xbox, PlayStation and
// most XInput pads). Pure helpers: the hook in hooks/use-gamepad.js turns the
// intents into focus moves and key presses.

export const BUTTON_INTENTS = { 0:'confirm', 1:'back', 4:'previousTab', 5:'nextTab', 9:'menu', 12:'up', 13:'down', 14:'left', 15:'right' };
export const DIRECTIONS = ['up','down','left','right'];

export function readIntents(pad, deadzone = .5) {
  const held = new Set();
  pad?.buttons?.forEach((button, index) => { if (BUTTON_INTENTS[index] && (button.pressed || button.value > .5)) held.add(BUTTON_INTENTS[index]); });
  const [x = 0, y = 0] = pad?.axes || [];
  if (Math.abs(x) >= deadzone && Math.abs(x) >= Math.abs(y)) held.add(x < 0 ? 'left' : 'right');
  else if (Math.abs(y) >= deadzone) held.add(y < 0 ? 'up' : 'down');
  return held;
}

// Fires each intent once when pressed; held directions repeat like a key.
export function createRepeater({ delay = 400, interval = 120 } = {}) {
  const since = new Map();
  return (held, now) => {
    const fired = [];
    for (const intent of since.keys()) if (!held.has(intent)) since.delete(intent);
    for (const intent of held) {
      const state = since.get(intent);
      if (!state) { since.set(intent, { next: now + delay }); fired.push(intent); }
      else if (DIRECTIONS.includes(intent) && now >= state.next) { state.next = now + interval; fired.push(intent); }
    }
    return fired;
  };
}

const centre = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

// Nearest candidate whose centre lies in the direction of travel, preferring
// ones aligned with the origin over ones that are merely close.
export function pickTarget(origin, candidates, direction) {
  const from = centre(origin), horizontal = direction === 'left' || direction === 'right', sign = direction === 'left' || direction === 'up' ? -1 : 1;
  let best = null, bestScore = Infinity;
  for (const candidate of candidates) {
    const to = centre(candidate.rect);
    const along = ((horizontal ? to.x - from.x : to.y - from.y) * sign), across = Math.abs(horizontal ? to.y - from.y : to.x - from.x);
    if (along <= 1 || across > along * 3) continue;
    const score = along + across * 2;
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}
