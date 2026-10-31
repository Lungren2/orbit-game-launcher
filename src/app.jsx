import { useEffect, useLayoutEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RefreshCw, Search, Settings2 } from 'lucide-react';
import { FluidProvider } from '@/lib/fluid-provider';
import { fontWeights } from '@/lib/font-weight';
import { spring } from '@/lib/springs';
import { useOrbit } from '@/hooks/use-orbit';
import { useGamepad } from '@/hooks/use-gamepad';
import { Button } from '@/components/ui/button';
import { TabsSubtle, TabsSubtleItem } from '@/components/ui/tabs-subtle';
import { TooltipProvider } from '@/components/ui/tooltip';
import { HoverStrip, IconButton, ThemePlayer } from '@/components/orbit-controls';
import { HomeCarousel } from '@/components/home-carousel';
import { GameLibrary } from '@/components/game-library';
import { OrbitOverlays } from '@/components/orbit-overlays';
import { artwork, request, desktop } from '@/lib/orbit';

export default function App() {
  const app = useOrbit(), [libraryOpened,setLibraryOpened] = useState(false), update = useUpdateStatus();
  const game = app.games.find(game=>game.id===app.selectedId);
  useLayoutEffect(()=>{document.body.dataset.view=app.view;document.body.dataset.art=game?.art || 'default';},[app.view,game?.art]);
  useEffect(()=>{if(app.view==='catalogue')setLibraryOpened(true);},[app.view]);
  const search = () => { app.navigate('catalogue'); requestAnimationFrame(()=>document.querySelector('#catalogue-search')?.focus()); };
  useGamepad({
    blocked:app.busy,
    onTab:direction=>{if(!app.modal)app.navigate(direction>0 ? 'catalogue' : 'games');},
    onMenu:()=>{if(app.modal?.type==='settings')app.closeModal();else if(!app.modal)app.openModal({type:'settings'});},
  });
  useEffect(()=>{
    const key = event => {
      if(event.key==='F11'){event.preventDefault();app.fullscreen();return;}
      if(app.modal || event.defaultPrevented)return;
      if(event.key==='Escape' && app.view!=='games'){event.preventDefault();app.navigate('games');return;}
      if(!/INPUT|TEXTAREA/.test(event.target.tagName) && event.key==='/'){event.preventDefault();search();}
    };
    document.addEventListener('keydown',key); return ()=>document.removeEventListener('keydown',key);
  });
  return <div className="orbit-app" style={{'--weight-normal':fontWeights.normal,'--weight-heading':fontWeights.semibold,'--weight-display':fontWeights.bold}}>
    <div className="window-drag" aria-hidden="true"/>
    <div className="backdrop" aria-hidden="true"><div className="wallpaper" style={{backgroundImage:artwork(game) ? `url("${artwork(game)}")` : undefined}}/><div className="jungle-scene"><video className="jungle-video" muted loop playsInline preload="none" poster="./themes/jungle-source.png"/></div><div className="vignette"/></div>
    <div className="shell"><header className="app-header">
      <HoverStrip label="Game launchers" className="launcher-shortcuts">{[
        ['steam','Open Steam','openSteam',<SteamIcon/>],['epic','Open Epic Games Launcher','openEpic',<EpicIcon/>],['xbox','Open Xbox app','openXbox',<XboxIcon/>],
      ].map(([id,label,method,glyph])=><IconButton key={id} id={`${id}-launcher`} label={label} className="launcher-button" onClick={()=>app.perform(()=>request(method))}>{glyph}</IconButton>)}</HoverStrip>
      <Button variant="ghost" size="icon" className="brand" aria-label="Orbit home" onClick={()=>app.navigate('games')}><img src="./brand/orbit-mark.svg" alt="" draggable="false"/></Button>
      <nav aria-label="Main"><TabsSubtle idPrefix="orbit-route" selectedIndex={app.view==='games' ? 0 : 1} onSelect={index=>app.navigate(index===0 ? 'games' : 'catalogue')}>
        <TabsSubtleItem index={0} label="Home" data-view="games"/><TabsSubtleItem index={1} label="Library" data-view="catalogue"/>
      </TabsSubtle></nav>
      <div className="utilities">{update.state==='ready' && <Button leadingIcon={RefreshCw} variant="secondary" size="compact" id="install-update" onClick={()=>app.perform(()=>request('installUpdate'))}>Restart to update</Button>}<div className="route-music-slot">{app.view!=='games' && <ThemePlayer app={app} compact/>}</div>{app.view==='games' && <IconButton id="search-button" label="Search" onClick={search}><Search/></IconButton>}<IconButton id="settings-button" label="Settings" onClick={()=>app.openModal({type:'settings'})}><Settings2/></IconButton></div>
    </header>
    <main id="main"><div id="orbit-route-panel-0" role="tabpanel" aria-labelledby="orbit-route-tab-0" className="home-view" hidden={app.view!=='games'}><HomeCarousel app={app} visible={app.view==='games'}/></div>{(libraryOpened || app.view==='catalogue') && <GameLibrary app={app} visible={app.view==='catalogue'}/>}</main></div>
    <OrbitOverlays app={app}/>
    <div className="toast-container" role="status" aria-live="polite"><AnimatePresence>{app.message && <motion.div className="toast" key={app.message} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0,transition:spring.fast.exit}} transition={spring.fast}>{app.message}</motion.div>}</AnimatePresence></div>
  </div>;
}

// Updates download in the background; offer a restart once one is ready.
function useUpdateStatus() {
  const [status,setStatus] = useState({state:'idle'});
  useEffect(()=>{
    if(!desktop || !window.orbit.onUpdateStatus)return;
    request('updateStatus').then(setStatus,()=>{});
    return window.orbit.onUpdateStatus(setStatus);
  },[]);
  return status;
}

export function OrbitRoot() { return <FluidProvider shape="rounded" size="default"><TooltipProvider><App/></TooltipProvider></FluidProvider>; }

function SteamIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="16.5" cy="7.5" r="5"/><circle cx="16.5" cy="7.5" r="2.5"/><path d="m12.5 10.5-5 4.5m3 3 5-5M1 14l5.5 3" strokeWidth="2.5"/><circle cx="8" cy="17" r="3.5"/></svg>; }
function EpicIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 3h14v15l-7 4-7-4Z"/><path d="M15 7H9v9h6m-6-4.5h5"/></svg>; }
function XboxIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M5 4c5 2 11 9 14 15M19 4C14 6 8 13 5 19"/></svg>; }
