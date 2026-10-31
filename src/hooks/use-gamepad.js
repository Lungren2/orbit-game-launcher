import { useEffect, useRef } from 'react';
import { createRepeater, pickTarget, readIntents } from '@/lib/gamepad';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
const LAYERS = '[role="dialog"], [role="menu"], [role="listbox"]';
const ARROWS = { up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight' };

const shown = element => element.getClientRects().length > 0 && !element.closest('[inert], [hidden], [aria-hidden="true"]') && getComputedStyle(element).visibility !== 'hidden';
// Radix hides the page behind dialogs and menus with aria-hidden rather than
// inert, so navigation stays inside the topmost open layer.
const scope = () => [...document.querySelectorAll(LAYERS)].filter(shown).at(-1) || document.querySelector('.orbit-app') || document.body;
const focusables = root => [...root.querySelectorAll(FOCUSABLE)].filter(shown);
const focus = element => { element?.focus({ focusVisible: true }); element?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); };

function press(key, target) {
  const init = { key, code: key, bubbles: true, cancelable: true };
  const down = new KeyboardEvent('keydown', init);
  target.dispatchEvent(down);
  target.dispatchEvent(new KeyboardEvent('keyup', init));
  return down.defaultPrevented;
}

// Focus target when nothing usable has focus yet: the selected game on Home,
// otherwise the first control of the open layer or view.
function entryPoint(root) {
  const home = root.querySelector('.home-view:not([hidden]) .selected .game-tile');
  if (home && shown(home)) return home;
  const view = root.querySelector('main [role="tabpanel"]:not([hidden]), main .catalogue-view:not([hidden])');
  return (view && focusables(view).find(element => !element.matches('input'))) || focusables(root)[0];
}

function current(root) {
  const active = document.activeElement;
  return active && active !== document.body && root.contains(active) && shown(active) ? active : null;
}

function move(direction) {
  const root = scope(), active = current(root);
  if (!active) return focus(entryPoint(root));
  // Let components with their own arrow handling (carousel, tabs, menus) go
  // first; fall back to spatial movement when focus didn't change.
  // A closed dropdown opens with A, not by passing over it with the D-pad.
  if (!active.matches('[role="combobox"][aria-expanded="false"]') && press(ARROWS[direction], active) && document.activeElement !== active) return;
  if (document.activeElement !== active) return;
  const origin = active.getBoundingClientRect();
  const target = pickTarget(origin, focusables(root).filter(element => element !== active && !active.contains(element)).map(element => ({ element, rect: element.getBoundingClientRect() })), direction);
  if (target) focus(target.element);
}

function confirm() {
  const root = scope(), active = current(root);
  if (!active) return focus(entryPoint(root));
  // A on the home carousel launches the selected game, like a console shelf.
  if (active.matches('.game-tile[aria-pressed="true"]')) {
    const play = active.closest('.carousel-slide')?.querySelector('.hero-play');
    if (play && !play.disabled) return play.click();
  }
  if (press('Enter', active) || active.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, iframe')) return;
  active.click();
}

export function useGamepad({ blocked, onTab, onMenu }) {
  const handlers = useRef();
  handlers.current = { blocked, onTab, onMenu };
  useEffect(() => {
    if (!navigator.getGamepads) return;
    const repeat = createRepeater();
    let frame = 0, focused = false;
    const tick = now => {
      frame = requestAnimationFrame(tick);
      // Ignore the controller while a launched game (or anything else) has
      // focus, so input meant for the game never triggers Orbit.
      const held = new Set(), wasFocused = focused;
      focused = document.hasFocus();
      if (focused) for (const pad of navigator.getGamepads()) if (pad?.connected) for (const intent of readIntents(pad)) held.add(intent);
      const fired = repeat(held, now);
      // Buttons still held from the game when Orbit regains focus are not new presses.
      if (!wasFocused) return;
      for (const intent of fired) {
        const { blocked, onTab, onMenu } = handlers.current;
        if (intent in ARROWS) move(intent);
        else if (blocked) continue;
        else if (intent === 'confirm') confirm();
        else if (intent === 'back') { const root = scope(); press('Escape', current(root) || root); }
        else if (intent === 'previousTab' || intent === 'nextTab') onTab?.(intent === 'nextTab' ? 1 : -1);
        else if (intent === 'menu') onMenu?.();
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
}
