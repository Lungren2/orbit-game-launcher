import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion } from 'motion/react';
import { Play, Ellipsis, Download, FolderOpen, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { CarouselDots } from '@/components/ui/carousel-dots';
import { IconButton, GameImage, ThemePlayer, TransferState } from './orbit-controls';
import { artwork, canPlay } from '@/lib/orbit';
import { spring } from '@/lib/springs';

export const CAROUSEL_DWELL = 30000;

export function HomeCarousel({ app, visible }) {
  const {games,selectedId,clock} = app;
  const root = useRef(null), viewport = useRef(null), live = useRef(null), direction = useRef(1), wheelAt = useRef(-Infinity);
  const [hovered,setHovered] = useState(false), [focused,setFocused] = useState(false), [dismissed,setDismissed] = useState(false);
  const [step,setStep] = useState(0), [seconds,setSeconds] = useState(30);
  const reduced = useReducedMotion();
  const progress = useMotionValue(clock.current.elapsed / CAROUSEL_DWELL), dots = useRef(null);
  const active = Math.max(0,games.findIndex(game=>game.id===selectedId));
  const previousActive=useRef(active), largeJump=Math.abs(active-previousActive.current)>1;
  useLayoutEffect(()=>{previousActive.current=active;},[active]);
  live.current = {app,visible,hovered,active};
  const select = (index,source='manual',focus=false) => {
    index = Math.max(0,Math.min(games.length-1,index)); const game = games[index]; if (!game) return;
    if (index !== active) { clock.current = {id:game.id,elapsed:0}; setSeconds(30); progress.set(0); }
    setDismissed(false); app.select(game.id,source);
    if (focus) requestAnimationFrame(()=>root.current?.querySelector(`.game-tile[data-id="${CSS.escape(game.id)}"]`)?.focus({preventScroll:true}));
  };
  useLayoutEffect(()=>{
    if(!visible || !app.focusReturn)return;
    setDismissed(false);setFocused(true);
    const frame=requestAnimationFrame(()=>root.current?.querySelector(`#${CSS.escape(app.focusReturn.control)}`)?.focus({preventScroll:true}));
    return ()=>cancelAnimationFrame(frame);
  },[app.focusReturn]);
  const selection = useRef(selectedId);
  const focusedBeforeCommit = root.current?.contains(document.activeElement) ? document.activeElement : null;
  const movingFocus = selection.current !== selectedId && focusedBeforeCommit ? focusedBeforeCommit.closest('.carousel-dots') ? 'dot' : focusedBeforeCommit.id || (focusedBeforeCommit.classList.contains('game-tile') ? 'tile' : null) : null;
  useLayoutEffect(()=>{
    if (clock.current.id !== selectedId) { clock.current = {id:selectedId,elapsed:0}; setSeconds(30); progress.set(0); }
    const focus = document.activeElement;
    if (root.current && selection.current !== selectedId && (movingFocus || root.current.contains(focus))) {
      const target = movingFocus === 'dot' || focus?.closest('.carousel-dots') ? dots.current?.querySelector('button[aria-current="true"]') : movingFocus === 'tile' ? root.current.querySelector('.selected .game-tile') : movingFocus ? root.current.querySelector(`#${CSS.escape(movingFocus)}`) : null;
      target?.focus({preventScroll:true});
    }
    selection.current = selectedId;
  },[selectedId,clock]);
  useLayoutEffect(()=>{
    const measure = () => {
      const tile = root.current?.querySelector('.carousel-slide');
      const track = root.current?.querySelector('.carousel-track');
      if (tile?.offsetWidth) setStep(tile.offsetWidth + parseFloat(getComputedStyle(track).gap));
    };
    const resize = new ResizeObserver(measure); if (viewport.current) resize.observe(viewport.current); measure();
    return ()=>resize.disconnect();
  },[games.length]);
  useEffect(()=>{
    let frame, previous = null;
    const tick = time => {
      const current = live.current;
      const delta = previous === null ? 0 : Math.min(1000,time-previous); previous = time;
      if (current.visible && !current.hovered && !current.app.busy && !current.app.modal && !document.hidden && current.app.games.length > 1) {
        clock.current.elapsed += delta;
        if (clock.current.elapsed >= CAROUSEL_DWELL) {
          const count = current.app.games.length;
          if (current.active >= count-1) direction.current = -1;
          if (current.active <= 0) direction.current = 1;
          const next = current.app.games[current.active+direction.current];
          clock.current = {id:next.id,elapsed:0}; current.app.select(next.id,'automatic');
        }
      }
      const remaining = Math.ceil((CAROUSEL_DWELL-clock.current.elapsed)/1000);
      setSeconds(old=>old === remaining ? old : remaining);
      progress.set(Math.min(1,Math.max(0,clock.current.elapsed/CAROUSEL_DWELL)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return ()=>cancelAnimationFrame(frame);
  },[clock,progress]);
  useEffect(()=>{
    const element=root.current;
    if(!element)return;
    const wheel = event => {
      const current=live.current;
      if(current.app.busy || current.app.modal || !current.visible)return;
      event.preventDefault();
      if(performance.now()-wheelAt.current<300)return;
      wheelAt.current=performance.now();
      const index=Math.max(0,Math.min(current.app.games.length-1,current.active+Math.sign(event.deltaY || event.deltaX)));
      const game=current.app.games[index];if(!game)return;
      if(index!==current.active){clock.current={id:game.id,elapsed:0};setSeconds(30);progress.set(0);}
      setDismissed(false);current.app.select(game.id,'wheel');
    };
    element.addEventListener('wheel',wheel,{passive:false});
    return ()=>element.removeEventListener('wheel',wheel);
  },[games.length,clock]);
  useLayoutEffect(()=>{
    if(!visible)return;
    const container=dots.current, current=container?.querySelector('button[aria-current="true"]');
    if(!current)return;
    if(current.offsetLeft<container.scrollLeft)container.scrollLeft=current.offsetLeft;
    else if(current.offsetLeft+current.offsetWidth+18>container.scrollLeft+container.clientWidth)container.scrollLeft=current.offsetLeft+current.offsetWidth+18-container.clientWidth;
  },[active,games.length,visible]);
  const onKeyDown = event => {
    if (app.busy || app.modal || /INPUT|TEXTAREA/.test(event.target.tagName)) return;
    if (event.key === 'Escape') { event.preventDefault(); setDismissed(true); root.current.querySelector('.selected .game-tile')?.focus({preventScroll:true}); return; }
    const next = event.key === 'ArrowRight' ? active+1 : event.key === 'ArrowLeft' ? active-1 : event.key === 'Home' ? 0 : event.key === 'End' ? games.length-1 : null;
    if (next !== null) { event.preventDefault(); const dot = event.target.closest('.carousel-dots'); select(next,'manual',!dot); if (dot) requestAnimationFrame(()=>dots.current?.querySelector('button[aria-current="true"]')?.focus({preventScroll:true})); }
  };
  if (!games.length) return <section className="empty-state"><FolderOpen/><h1>{app.loadError ? 'Library unavailable' : 'No games yet'}</h1><p>{app.loadError || app.library.root}</p><div className="button-row"><Button leadingIcon={RefreshCw} variant="secondary" id="empty-refresh" onClick={app.load}>Refresh</Button><Button variant="ghost" id="empty-folder" onClick={app.chooseRoot}>Choose folder</Button></div></section>;
  const overlay = (hovered || focused) && !dismissed;
  const paused = hovered || app.busy || Boolean(app.modal) || !visible;
  return <section ref={root} className={`game-carousel ${games.length === 1 ? 'single-game' : ''} ${overlay ? 'overlay-open' : ''}`} aria-label="Games" aria-roledescription="carousel" data-rotation={paused ? 'paused' : 'running'} onKeyDown={onKeyDown}
    onFocusCapture={()=>setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);}}>
    <div ref={viewport} className="carousel-viewport" onPointerEnter={()=>{setHovered(true);setDismissed(false);}} onPointerLeave={()=>setHovered(false)}>
      <motion.div className="carousel-track" initial={false} animate={{x:-active*step}} transition={reduced || largeJump ? {duration:0} : spring.slow}>
        {games.map((game,index)=><article key={game.id} className={`carousel-slide ${index===active ? 'selected' : ''}`} aria-label={`${game.name}, ${index+1} of ${games.length}`}>
          <motion.button className="game-tile" data-id={game.id} aria-label={`Select ${game.name}`} aria-pressed={index===active} tabIndex={index===active ? 0 : -1} onClick={()=>select(index)} onFocus={()=>{if(index!==active)select(index,'focus');}} initial={false} animate={{scale:index===active ? 1 : .97,opacity:index===active ? 1 : .7}} transition={spring.moderate}>
            <GameImage game={game} source={artwork(game)} eager={index===active} className={!game.hasHero && !game.art && !game.heroUrl ? 'package-cover' : ''}/>
          </motion.button>
          <motion.section className="game-overlay" aria-label={`${game.name} controls`} inert={index!==active || !overlay} initial={false} animate={{opacity:index===active && overlay ? 1 : 0}} transition={spring.fast}>
            <h1 className="carousel-title">{game.name}</h1>
            <div className="carousel-actions"><Button leadingIcon={game.download ? Download : Play} id={index===active ? 'play' : undefined} data-play={game.id} onClick={()=>app.play(game.id)} disabled={app.busy || !canPlay(game,app.library)} className="hero-play">{game.download ? 'Not installed' : 'Play'}</Button>
              {!game.download && <IconButton label={`Game details for ${game.name}`} id={index===active ? 'details' : undefined} data-details={game.id} onClick={()=>app.details(game.id)}><Ellipsis/></IconButton>}</div>
            {game.download && <TransferState job={game.download}/>}
            {index===active && visible && <ThemePlayer app={app}/>}
          </motion.section>
        </article>)}
      </motion.div>
    </div>
    <div className="carousel-navigation"><CarouselDots ref={dots} className="carousel-dots" aria-label="Choose game" count={games.length} value={active} onValueChange={index=>select(index)} progress={games.length>1 ? progress : undefined} getLabel={index=>`Show ${games[index].name}`}/></div>
    <p id="carousel-timing" role="timer" aria-live="off" className="sr-only">{games.length===1 ? 'Only one game. Automatic browsing is unavailable.' : `${paused ? 'Automatic browsing paused with' : 'Next game in'} ${seconds} seconds`}</p>
  </section>;
}
