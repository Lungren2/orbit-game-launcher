import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createThemeMusic } from '../src/theme-music.js';

function setup(saved) {
  const instances = [], timers = new Map();
  let stored = JSON.stringify(saved || {}), nextTimer = 0, clock = 0;
  class FakeAudio {
    constructor(src) { this.src = src; this.paused = true; this.volume = 1; instances.push(this); }
    play() { this.paused = false; return new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; }); }
    pause() { this.paused = true; }
    removeAttribute() { this.src = ''; }
    load() {}
    addEventListener(name, callback) { this[name] = callback; }
  }
  const player = createThemeMusic({ AudioClass: FakeAudio, storage: { getItem: () => stored, setItem: (_, value) => { stored = value; } }, setTimer: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimer: id => timers.delete(id), now: () => clock });
  const advance = ms => { for (let time=0;time<ms;time+=30) {clock+=30;for(const fn of [...timers.values()])fn();} };
  return { player, instances, timers, advance, saved: () => JSON.parse(stored) };
}
const game = (id, folder) => ({ id, folder: `D:\\Games\\${folder}` });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('selection plays the matching game track once and loops it', async () => {
  const { player, instances, advance } = setup();
  player.select(game('s', 'Stardew Valley'));
  assert.equal(instances[0].src, './music/stardew.mp3');
  assert.equal(instances[0].loop, true);
  player.select(game('s', 'Stardew Valley'));
  assert.equal(instances.length, 1);
  instances[0].resolve(); await flush();
  advance(600);
  assert.equal(instances[0].volume, 0.18);
  assert.equal(player.state().status, 'playing');
  player.dispose();
});

test('rapid selections stop old audio even when old play promises finish late', async () => {
  const { player, instances } = setup();
  player.select(game('s', 'Stardew Valley'));
  player.select(game('f', 'Fortnite'));
  player.select(game('w', 'Wanderburg'));
  instances.forEach(audio => audio.resolve()); await flush();
  assert.deepEqual(instances.map(audio => audio.paused), [true, true, false]);
  assert.equal(instances[2].src, './music/wanderburg.mp3');
  player.dispose();
});

test('mute and volume persist and muted startup does not play', () => {
  const { player, instances, saved } = setup({ muted: true, volume: 0.25 });
  player.select(game('d', 'Dimraeth'));
  assert.equal(instances.length, 0);
  player.setMuted(false);
  assert.equal(instances.length, 1);
  player.setVolume(0.4);
  assert.deepEqual(saved(), { muted: false, volume: 0.4 });
  player.setMuted(true);
  assert.equal(instances[0].paused, true);
  player.dispose();
});

test('launch suspension survives rerenders and ends on another selection', () => {
  const { player, instances } = setup();
  player.select(game('f', 'Fortnite'));
  player.suspend();
  player.select(game('f', 'Fortnite'));
  assert.equal(instances.length, 1);
  assert.equal(instances[0].paused, true);
  player.select(game('v', 'Vampire Survivors'));
  assert.equal(instances.length, 2);
  player.select(game('v', 'Vampire Survivors'), false);
  assert.equal(instances[1].paused, true);
  player.dispose();
});

test('unknown games stay silent and playback errors do not escape', async () => {
  const { player, instances } = setup();
  player.select(game('x', 'Unknown'));
  assert.equal(instances.length, 0);
  player.select(game('c', 'Cities Skylines II'));
  instances[0].reject(new Error('Missing track')); await flush();
  assert.equal(player.state().status, 'unavailable');
  assert.equal(instances[0].paused, true);
  player.dispose();
});

test('a configured track overrides bundled music and changes without restarting Orbit', () => {
  const {player,instances}=setup();
  const selected={...game('s','Stardew Valley'),hasMusic:true,musicTitle:'My game theme',musicUrl:'orbit-art://s/music?v=1'};
  player.select(selected);assert.equal(instances[0].src,selected.musicUrl);
  player.select({...selected,musicUrl:'orbit-art://s/music?v=2'});
  assert.equal(instances[0].paused,true);assert.equal(instances[1].src,'orbit-art://s/music?v=2');
  player.dispose();
});

test('resolved tracks crossfade, retire at silence, and never change the saved level', async () => {
  const {player,instances,advance,saved,timers}=setup({muted:false,volume:.2});
  player.select(game('s','Stardew Valley'));instances[0].resolve();await flush();advance(600);
  player.select(game('f','Fortnite'));instances[1].resolve();await flush();
  assert.equal(instances[0].paused,false);assert.equal(instances[1].volume,0);
  advance(300);assert.ok(instances[0].volume>0&&instances[0].volume<.2);assert.ok(instances[1].volume>0&&instances[1].volume<.2);
  assert.ok(instances[0].volume+instances[1].volume<=.200001);
  advance(300);assert.equal(instances[0].paused,true);assert.equal(instances[0].src,'');assert.equal(instances[1].volume,.2);
  player.select(game('f','Fortnite'),false);advance(300);assert.equal(instances[1].paused,false);assert.ok(instances[1].volume<.2);
  player.select(game('f','Fortnite'),false);advance(300);assert.equal(instances[1].paused,true);
  assert.deepEqual(saved(),{muted:false,volume:.2});assert.equal(timers.size,0);player.dispose();
});

test('mute, late failures, rapid selection and disposal cannot revive retired audio', async () => {
  const {player,instances,advance,timers}=setup();
  player.select(game('s','Stardew Valley'));instances[0].resolve();await flush();advance(600);
  player.select(game('f','Fortnite'));instances[1].resolve();await flush();advance(150);
  player.select(game('w','Wanderburg'));instances[2].resolve();await flush();advance(150);
  instances[0].error(new Error('Retired error'));assert.equal(player.state().status,'playing');
  player.setMuted(true);advance(600);assert.ok(instances.every(audio=>audio.paused));assert.equal(timers.size,0);
  player.setMuted(false);assert.equal(instances.length,4);player.dispose();instances[3].resolve();await flush();assert.ok(instances.every(audio=>audio.paused));assert.equal(timers.size,0);
});

test('pending downloads cannot borrow a bundled theme by matching title', () => {
  const {player,instances}=setup();player.select({...game('pending','Fortnite'),name:'Fortnite',download:{status:'downloading'}});assert.equal(instances.length,0);assert.equal(player.state().theme,null);player.dispose();
});
