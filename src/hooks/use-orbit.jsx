import { useCallback, useEffect, useRef, useState } from 'react';
import { request, readLibrary, desktop, artwork } from '@/lib/orbit';
import { downloadGames, installedDownload, sameDownload, catalogueId } from '../downloads.js';
import { createThemeMusic } from '../theme-music.js';
import { createAppearance, readAppearance } from '../appearance.js';
import { launchArtwork } from '../launch-artwork.js';

const emptyLibrary = { games: [], root: 'D:\\Games', favorites: [], recent: {}, executables: {} };

export function useOrbit() {
  const [library, setLibrary] = useState(emptyLibrary), [jobs, setJobs] = useState([]);
  const [selectedId, setSelectedId] = useState(null), [view, setView] = useState(() => location.hash==='#library' ? 'catalogue' : 'games');
  const [modal, setModal] = useState(null), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [loadError, setLoadError] = useState('');
  const [focusReturn,setFocusReturn] = useState(null);
  const [musicState, setMusicState] = useState({ theme:null, muted:false, volume:.18 });
  const [preferences, setPreferences] = useState(() => readAppearance(localStorage));
  const [music] = useState(() => createThemeMusic({onChange:setMusicState}));
  const appearance = useRef(null), clock = useRef({id:null,elapsed:0});
  const live = useRef({ library:emptyLibrary, jobs:[], selectedId:null, initial:true, musicEngaged:false, busy:false });
  const loadSequence = useRef(0), downloadRevision = useRef(0), token = useRef(null), opening = useRef(false);
  const lastFocus = useRef(null), toastTimer = useRef(null);
  const notify = useCallback(text => { setMessage(text); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setMessage(''),3500); }, []);
  const perform = useCallback(async fn => { try { return await fn(); } catch(error) { notify(error.message); return null; } }, [notify]);
  const allGames = (data = live.current) => [...data.library.games, ...downloadGames(data.jobs,data.library.games,data.library.root)];
  const select = useCallback((id, source = 'manual') => {
    live.current.selectedId = id; setSelectedId(id);
    if (source === 'manual') live.current.musicEngaged = true;
    if (source === 'wheel') live.current.musicEngaged = false;
    const game = allGames().find(game => game.id === id);
    music.select(game, live.current.musicEngaged && !document.hidden);
  },[music]);
  const reconcile = useCallback((previousJob, preferInstalled = false) => {
    const data = live.current, games = allGames();
    const installed = previousJob && installedDownload(previousJob,data.library.games);
    let id = installed?.id || data.selectedId;
    if (installed && clock.current.id === `download-${previousJob.id}`) clock.current.id = installed.id;
    if (!games.some(game => game.id === id) && previousJob) {
      const replacement = games.find(game => game.download && sameDownload(game.download,previousJob));
      if (replacement) { if (clock.current.id === data.selectedId) clock.current.id = replacement.id; id = replacement.id; }
    }
    if (preferInstalled || !games.some(game => game.id === id)) {
      id = [...(preferInstalled ? data.library.games : games)].sort((a,b) => new Date(data.library.recent[b.id] || 0)-new Date(data.library.recent[a.id] || 0))[0]?.id;
    }
    select(id,'initial');
  },[select]);
  const load = useCallback(async () => {
    const version = ++loadSequence.current;
    try {
      const data = await readLibrary(); if (version !== loadSequence.current) return;
      const old = live.current.jobs.find(job => `download-${job.id}` === live.current.selectedId);
      live.current.library = { ...emptyLibrary, ...data }; setLibrary(live.current.library); setLoadError('');
      const prefer = live.current.initial && data.games.length > 0;
      live.current.initial = false; reconcile(old,prefer);
    } catch(error) { if (version === loadSequence.current) { setLoadError(error.message); notify(error.message); } }
  },[notify,reconcile]);
  const acceptDownloads = useCallback(next => {
    downloadRevision.current++;
    const old = live.current.jobs.find(job => `download-${job.id}` === live.current.selectedId);
    live.current.jobs = next; setJobs(next); reconcile(old);
  },[reconcile]);
  useEffect(() => {
    appearance.current = createAppearance();
    const refresh = () => { music.select(allGames().find(game => game.id === live.current.selectedId),live.current.musicEngaged && !document.hidden); appearance.current?.refresh(); };
    const retry = () => music.retry();
    document.addEventListener('visibilitychange',refresh); document.addEventListener('pointerdown',retry);
    const unsubscribers = [];
    if (desktop) {
      for (const [name,fn] of [['onDownloads',acceptDownloads],['onLibraryUpdated',load],['onImported',load]]) {
        const unsubscribe = window.orbit[name]?.(fn); if (unsubscribe) unsubscribers.push(unsubscribe);
      }
      const revision = downloadRevision.current;
      request('downloads').then(next => { if (revision === downloadRevision.current) acceptDownloads(next); }).catch(error => notify(error.message));
    }
    load();
    return () => { unsubscribers.forEach(fn=>fn()); document.removeEventListener('visibilitychange',refresh); document.removeEventListener('pointerdown',retry); appearance.current?.dispose(); music.dispose(); clearTimeout(toastTimer.current); };
  },[load,acceptDownloads,music,notify]);
  const navigate = useCallback(next => { if (!live.current.busy) { setView(next); history.replaceState(null,'',next==='catalogue' ? '#library' : location.pathname+location.search); } },[]);
  const openModal = useCallback(next => { const focus=document.activeElement;setModal(previous=>{if(!previous)lastFocus.current=focus;return next;}); },[]);
  const closeModal = useCallback(() => {
    setModal(null);
    if(lastFocus.current?.closest('.game-carousel'))setFocusReturn({control:lastFocus.current.id || 'play',at:performance.now()});
    if (token.current) { const current = token.current; token.current = null; request('endDownloadContext',current).catch(()=>{}); }
  },[]);
  useEffect(() => () => { if (token.current) request('endDownloadContext',token.current).catch(()=>{}); },[]);
  const play = useCallback(async id => {
    if (live.current.busy) return;
    const game = live.current.library.games.find(game => game.id === id); if (!game) return;
    if (!desktop) { notify('Open Orbit on your desktop to play.'); return; }
    const focus = document.activeElement, homeLaunch = Boolean(document.querySelector('.home-view:not([hidden])'));
    const sourceRect = (homeLaunch ? document.querySelector('.selected .game-tile') : document.querySelector(`.catalogue-view:not([hidden]) [data-installed-id="${CSS.escape(id)}"] .catalogue-cover`))?.getBoundingClientRect();
    select(id,'manual'); live.current.busy = true; setBusy(true); music.suspend(); appearance.current?.suspend(true);
    let scene;
    try {
      scene = launchArtwork({game,art:artwork,sourceRect,enabled:appearance.current?.state().launchVortex});
      const result = await request('launch',id);
      live.current.library = {...live.current.library,recent:result.recent}; setLibrary(live.current.library); notify(`Starting ${game.name}`);
    } catch(error) { scene?.fail(); music.resume(); notify(error.message); }
    finally { await scene?.close(); live.current.busy = false; setBusy(false); appearance.current?.suspend(false); if(homeLaunch)setFocusReturn({control:'play',at:performance.now()});else requestAnimationFrame(()=>{if(focus?.isConnected)focus.focus({preventScroll:true});}); }
  },[music,select,notify]);
  const install = useCallback(async game => {
    if (opening.current || !/^https:\/\/playzip\.com\/game\/\d+$/.test(game?.url || '')) return;
    const installed = installedDownload({game},live.current.library.games); if (installed) return play(installed.id);
    opening.current = true;
    try { if (desktop) token.current = await request('prepareDownload',game); openModal({type:'install',game}); }
    catch(error) { notify(error.message); } finally { opening.current = false; }
  },[openModal,notify,play]);
  const details = useCallback(id => { select(id,'manual'); openModal({type:'details',gameId:id}); },[select,openModal]);
  const favorite = id => perform(async () => {
    const favorites = desktop ? await request('favorite',id) : library.favorites.includes(id) ? library.favorites.filter(value=>value!==id) : [...library.favorites,id];
    if (!desktop) localStorage.setItem('orbit-preview',JSON.stringify({favorites}));
    live.current.library = {...live.current.library,favorites}; setLibrary(live.current.library);
  });
  const addArchive = game => perform(() => request('addArchive',game));
  const controlDownload = (id,action) => perform(async () => {
    const job = live.current.jobs.find(job=>job.id===id);
    if (action === 'restart') return install(job.game);
    if (action === 'reimport') return addArchive(catalogueId(job.game.id) ? job.game : undefined);
    acceptDownloads(await request('downloadControl',id,action));
  });
  const uninstall = id => perform(async () => {
    const result = await request('uninstall',id);
    if (result.removed) { closeModal(); await load(); notify('Game uninstalled'); }
    else if (result.external) { closeModal(); notify('Finish uninstalling in its app, then rescan Library'); }
    return result;
  });
  const chooseRoot = () => perform(async () => { const next = await request('chooseRoot'); if (next) await load(); });
  const fullscreen = () => perform(async () => { if (desktop) await request('fullscreen'); else if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); });
  const setPreference = (key,value) => { appearance.current?.set(key,value); setPreferences(appearance.current.state()); };
  const toggleMusic = () => {
    if (musicState.muted || musicState.volume === 0 || !live.current.musicEngaged) {
      live.current.musicEngaged = true; music.select(allGames().find(game=>game.id===live.current.selectedId),true);
      if (!musicState.volume) music.setVolume(.18); music.setMuted(false);
    } else music.setMuted(true);
  };
  return { library,jobs,selectedId,view,modal,busy,message,loadError,musicState,preferences,clock,lastFocus,focusReturn, musicEngaged:live.current.musicEngaged,
    games:[...library.games,...downloadGames(jobs,library.games,library.root)], select,navigate,load,notify,perform,openModal,closeModal,play,install,details,favorite,addArchive,controlDownload,uninstall,chooseRoot,fullscreen,setPreference,toggleMusic };
}
