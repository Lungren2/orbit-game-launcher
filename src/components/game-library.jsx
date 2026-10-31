import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { spring } from '@/lib/springs';
import { Search, Download, Play, Ellipsis, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardGroup, CardTitle, CardFooter } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { InputGroup, InputField } from './ui/input-group';
import { SizeProvider } from '@/lib/size-context';
import { Choice, IconButton, GameImage, InstalledMark, TransferState } from './orbit-controls';
import { artwork, catalogueArtwork, canPlay, catalogueClient } from '@/lib/orbit';
import { catalogueKey } from '@/lib/catalogue-client';
import { genres } from '../catalogue-data.js';
import { pendingDownloads, installedDownload, catalogueId } from '../downloads.js';

const scopes = [['all','All games'],['installed','Installed'],['favorites','Favorites'],['recent','Recent']];
const match = (job,game) => Boolean(catalogueId(job.game.id) && catalogueId(job.game.id)===catalogueId(game.id) || catalogueId(game.steamAppId) && catalogueId(job.game.steamAppId)===catalogueId(game.steamAppId));

export function GameLibrary({ app, visible }) {
  const [options,setOptions] = useState({page:1,keywords:'',category:'all',sort:'views'}), [scope,setScope] = useState('all');
  const [query,setQuery] = useState(''), [pageInput,setPageInput] = useState('1');
  const [result,setResult] = useState(null), [busy,setBusy] = useState(false), [error,setError] = useState(''), [retry,setRetry] = useState(0);
  const scroller=useRef(null), sequence = useRef(0), retryVersion=useRef(0);
  const [cacheRevision,setCacheRevision]=useState(0);
  const [reducedMotion,setReducedMotion]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const preference=window.matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReducedMotion(preference.matches);preference.addEventListener('change',change);return()=>preference.removeEventListener('change',change);},[]);
  const pending = pendingDownloads(app.jobs,app.library.games,app.library.root);
  const prefix = useMemo(()=>{
    const games=app.library.games.filter(game=>game.name.toLowerCase().includes(options.keywords.toLowerCase()) &&
      (scope!=='favorites' || app.library.favorites.includes(game.id)) && (scope!=='recent' || app.library.recent[game.id]));
    if(scope==='recent')games.sort((a,b)=>new Date(app.library.recent[b.id])-new Date(app.library.recent[a.id]));
    const output=games.map(game=>({kind:'installed',game,key:game.id}));
    if(scope==='all' && !options.keywords && options.category==='all')for(const job of pending){
      if(['downloading','paused','interrupted','queued','extracting','importing'].includes(job.status))output.push({kind:'pending',game:job.game,job,key:`job-${job.id}`});
    }
    return output;
  },[scope,options.keywords,options.category,app.library,app.jobs]);
  const collection={prefixCount:prefix.length,
    playzipIds:prefix.map(entry=>catalogueId(entry.kind==='installed'?entry.game.playzipId:entry.game.id)).filter(Boolean),
    steamIds:prefix.map(entry=>catalogueId(entry.game.steamAppId)).filter(Boolean)};
  const requestOptions={...options,collection};
  const key = catalogueKey(requestOptions), queryKey=catalogueKey({...requestOptions,page:1});
  useEffect(()=>window.orbit?.onCatalogueUpdated?.(()=>{catalogueClient.invalidate();setCacheRevision(value=>value+1);}),[]);
  useEffect(()=>{
    const version = ++sequence.current;
    if (!visible || scope !== 'all') {setBusy(false);return;}
    const force=retry!==retryVersion.current;retryVersion.current=retry;
    const cached=catalogueClient.peek(requestOptions);
    if(cached)setResult({...cached,key:catalogueKey({...requestOptions,page:cached.page}),queryKey});
    setBusy(!cached);setError('');
    catalogueClient.load(requestOptions,{force}).then(data=>{if(version===sequence.current){
      const actualKey=catalogueKey({...requestOptions,page:data.page});
      setResult({...data,key:actualKey,queryKey});
      if(data.page!==options.page)setOptions(current=>catalogueKey({...current,collection})===key?{...current,page:data.page}:current);
    }})
      .catch(error=>{if(version===sequence.current)setError(error.message);})
      .finally(()=>{if(version===sequence.current)setBusy(false);});
    return ()=>{sequence.current++;};
  },[key,scope,retry,visible,cacheRevision]);
  useEffect(()=>{
    if(visible && scope==='all' && !busy && result?.key===key && result.page<result.totalPages)catalogueClient.prefetch({...requestOptions,page:result.page+1});
  },[visible,scope,busy,result?.key,key]);
  useLayoutEffect(()=>{const viewport=scroller.current?.querySelector('[data-slot="scroll-area-viewport"]');if(viewport)viewport.scrollTop=0;},[key,scope]);
  useEffect(()=>setPageInput(String(options.page)),[options.page]);
  const remote = result?.queryKey === queryKey ? result.games : [];
  const totalPages=result?.queryKey===queryKey?result.totalPages:null;
  const entries = useMemo(()=>{
    if(scope!=='all')return prefix;
    const output=result?.queryKey===queryKey && result.collection
      ? prefix.slice(result.prefixStart,result.prefixEnd)
      : options.page===1 ? [...prefix] : [];
    for(const game of remote) {
      const installed = installedDownload({game},app.library.games);
      if(installed) { if(!output.some(entry=>entry.key===installed.id))output.push({kind:'installed',game:installed,key:installed.id}); }
      else { const job = pending.find(job=>match(job,game)); if(!job || !output.some(entry=>entry.key===`job-${job.id}`))output.push({kind:job?'pending':'available',game,job,key:`catalogue-${game.id}`}); }
    }
    return output;
  },[scope,key,remote,app.library,pending,prefix,result,queryKey]);
  const change = patch => setOptions(old=>({...old,...patch}));
  const movePage=delta=>setOptions(old=>({...old,page:Math.max(1,Math.min(totalPages||1,old.page+delta))}));
  const search = event => { event.preventDefault(); change({page:1,keywords:query.trim()}); };
  return <section id="orbit-route-panel-1" role="tabpanel" aria-labelledby="orbit-route-tab-1" className="catalogue-view" aria-label="Game library" hidden={!visible}>
    <div className="catalogue-toolbar">
      <div className="catalogue-filters"><Choice id="catalogue-scope" label="Games to show" value={scope} options={scopes} onChange={value=>{setScope(value);change({page:1});}}/>
        {scope==='all' && <><Choice id="catalogue-genre" label="Catalogue genre" value={options.category} options={genres} onChange={category=>change({category,page:1})}/><Choice id="catalogue-sort" label="Catalogue order" value={options.sort} options={[['views','Popular'],['latest','Latest']]} onChange={sort=>change({sort,page:1})}/></>}
      </div>
      <IconButton className="catalogue-transfers" id="transfers-button" label="Transfers and archive import" onClick={()=>app.openModal({type:'transfers'})}>{pending.length>0 && <span className="transfer-count">{pending.length}</span>}</IconButton>
      <form id="catalogue-search-form" className="catalogue-search" role="search" onSubmit={search}><InputGroup><InputField id="catalogue-search" type="search" label="Search games" labelHidden placeholder="Search" icon={Search} index={0} value={query} onChange={value=>{setQuery(value);if(!value && options.keywords)change({keywords:'',page:1});}} maxLength={200}/></InputGroup></form>
    </div>
    <ScrollArea ref={scroller} className="catalogue-results" aria-busy={busy && scope==='all'} viewportClassName="library-scroll-viewport scroll-fade">
      <div>
        <SizeProvider size="compact"><CardGroup columns={10} separated border="none" className="catalogue-grid" aria-label="Games">
          {entries.map(entry=><GameCard key={entry.key} entry={entry} app={app} reducedMotion={reducedMotion} loading={busy && result?.key!==key}/>)}
        </CardGroup></SizeProvider>
        {busy && !remote.length && scope==='all' && <div className="catalogue-grid skeleton-grid" aria-label="Loading catalogue" aria-hidden="true">{Array.from({length:10},(_,index)=><div className="catalogue-skeleton" key={index}/>)}</div>}
        {error && scope==='all' && <div className="catalogue-message" role="status"><p>{error}</p><Button leadingIcon={RefreshCw} id="catalogue-retry" variant="secondary" onClick={()=>setRetry(value=>value+1)}>Retry</Button></div>}
        {!busy && !error && entries.length===0 && <div className="catalogue-message">No games found</div>}
      </div>
    </ScrollArea>
    {scope==='all' && <form id="catalogue-page-form" noValidate className="catalogue-pagination" aria-label="Catalogue pagination" onSubmit={event=>{event.preventDefault();const page=Number(pageInput);if(Number.isInteger(page) && page>=1 && totalPages)change({page:Math.min(page,totalPages)});else setPageInput(String(options.page));}}>
      <IconButton compact type="button" id="catalogue-prev" label="Previous catalogue page" disabled={options.page<=1} onClick={()=>movePage(-1)}><ChevronLeft/></IconButton>
      <label className="page-label"><span className="sr-only">Page</span><input id="catalogue-page" aria-label="Catalogue page" type="number" min="1" max={totalPages||undefined} value={pageInput} onChange={event=>setPageInput(event.target.value)} disabled={!totalPages}/><span>/ {totalPages||1}</span></label>
      <IconButton compact type="button" id="catalogue-next" label="Next catalogue page" disabled={!totalPages || options.page>=totalPages} onClick={()=>movePage(1)}><ChevronRight/></IconButton>
    </form>}
  </section>;
}

function GameCard({ entry, app, loading, reducedMotion, ...props }) {
  const {game,kind,job} = entry, installed = kind==='installed', pending = kind==='pending';
  const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[origin,setOrigin]=useState('50% 50%');
  const expanded=hovered||focused;
  const expandFrom=element=>{
    const rect=element.getBoundingClientRect(),viewport=element.closest('.catalogue-results').getBoundingClientRect();
    const x=rect.left-viewport.left<rect.width*.4?'0%':viewport.right-rect.right<rect.width*.4?'100%':'50%';
    const y=rect.top-viewport.top<rect.height*.2?'0%':viewport.bottom-rect.bottom<rect.height*.2?'100%':'50%';
    setOrigin(`${x} ${y}`);
  };
  const platform=game.platform==='steam' || game.steamAppId?'Steam':game.platform==='epic'?'Epic Games':game.platform==='xbox'?'Xbox':'PC';
  const detail=pending?'Installing':installed?(canPlay(game,app.library)?'Installed':'Choose executable'):'Available to install';
  const action = () => installed ? app.details(game.id) : app.install(game);
  return <motion.div className="catalogue-card-slot" data-expanded={expanded} style={{zIndex:expanded?40:1,transformOrigin:origin}}
    animate={{scale:expanded && !reducedMotion?1.32:1}} transition={expanded?spring.moderate:spring.moderate.exit}
    onPointerEnter={event=>{if(event.pointerType==='mouse'){expandFrom(event.currentTarget);setHovered(true);}}} onPointerLeave={()=>setHovered(false)}
    onFocusCapture={event=>{if(event.target.matches(':focus-visible')){expandFrom(event.currentTarget);setFocused(true);}}}
    onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);}}
    onKeyDownCapture={event=>{if(event.key==='Escape' && expanded){event.preventDefault();event.stopPropagation();setHovered(false);setFocused(false);}}}>
  <Card {...props} className={`catalogue-card ${installed ? 'installed-card' : ''}`} data-installed-id={installed ? game.id : undefined} data-catalogue-id={!installed ? game.id : undefined} data-pending-job={pending ? job.id : undefined}
    onClick={pending || app.busy || loading && !installed ? undefined : action} disabled={pending || app.busy || loading && !installed} label={`${installed ? 'Options for' : pending ? 'Downloading' : 'Install'} ${game.name}`}>
    <div className="catalogue-cover"><GameImage game={game} source={installed ? artwork(game,'cover') : catalogueArtwork(game,'full')} previewSource={installed?undefined:catalogueArtwork(game,160)}/>{installed && <InstalledMark/>}
      <motion.div className="catalogue-hover-details" aria-hidden={!expanded} animate={{opacity:expanded?1:0}} transition={expanded?spring.fast:spring.fast.exit}>
        <p className="catalogue-full-title">{game.name}</p><p className="catalogue-game-meta">{platform} · {detail}</p>
      </motion.div>
      {pending && <div className="catalogue-installation-status"><TransferState job={job} compact/></div>}</div>
    <CardTitle className="catalogue-title truncate px-2 pt-2">{game.name}</CardTitle>
    <CardFooter className="catalogue-card-actions">
      {installed ? <><Button leadingIcon={Play} variant="secondary" data-play-installed={game.id} aria-label={`Play ${game.name}`} disabled={app.busy || !canPlay(game,app.library)} onClick={()=>app.play(game.id)}>Play</Button><IconButton compact label={`Options for ${game.name}`} data-details-installed={game.id} onClick={()=>app.details(game.id)}><Ellipsis/></IconButton></> : <Button leadingIcon={Download} variant="ghost" className="catalogue-install-label" disabled={pending || app.busy || loading} aria-label={`Install ${game.name}`} onClick={()=>app.install(game)}>{pending ? 'Installing' : 'Install'}</Button>}
    </CardFooter>
  </Card></motion.div>;
}
