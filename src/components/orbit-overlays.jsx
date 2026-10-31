import { useEffect, useRef, useState } from 'react';
import { FolderOpen, RefreshCw, Maximize, Keyboard, Images, Star, SquareTerminal, Trash2, Search, Music2, WandSparkles, X, ArrowLeft, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from './ui/dialog';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { InputGroup, InputField } from './ui/input-group';
import { SizeProvider } from '@/lib/size-context';
import { ActionList, GameImage, IconButton, TransferState } from './orbit-controls';
import { request, artwork, desktop } from '@/lib/orbit';
import { downloadActions, installedDownload } from '../downloads.js';
import { themes } from '../theme-music.js';

export function OrbitOverlays({ app }) {
  const previous = useRef(null); if (app.modal) previous.current = app.modal;
  const modal = app.modal || previous.current;
  const game = modal?.game || app.library.games.find(game=>game.id===modal?.gameId);
  const title = modal?.type==='details' ? game?.name || 'Game options' : modal?.type==='setup' ? 'Artwork & music' : modal?.type==='install' ? game?.name : modal?.type==='transfers' ? 'Transfers' : modal?.type==='controls' ? 'Controls' : 'Settings';
  return <Dialog open={Boolean(app.modal)} onOpenChange={open=>{if(!open)app.closeModal();}}>
    <DialogContent size={modal?.type==='install' ? 'xl' : 'lg'} showCloseButton={false} className={`orbit-dialog ${modal?.type==='install' ? 'catalogue-modal' : ''} ${modal?.type==='setup' ? 'game-setup' : ''}`} aria-describedby="orbit-dialog-description"
      onCloseAutoFocus={event=>{event.preventDefault();requestAnimationFrame(()=>{if(app.lastFocus.current?.isConnected)app.lastFocus.current.focus({preventScroll:true});else document.querySelector('#settings-button')?.focus();});}}>
      <DialogHeader className="dialog-header"><div className="dialog-heading"><DialogTitle>{title}</DialogTitle><DialogDescription id="orbit-dialog-description" className="sr-only">{modal?.type==='install' ? 'PlayZip game page and archive import' : `${title} for Orbit`}</DialogDescription></div>
        {modal?.type==='install' && desktop && <Button leadingIcon={FolderOpen} variant="ghost" size="compact" className="frame-import" onClick={()=>app.addArchive(game)}>Import archive</Button>}
        <DialogClose asChild><Button variant="ghost" size="icon" id="close-dialog" aria-label="Close"><X/></Button></DialogClose>
      </DialogHeader>
      {modal?.type==='install' ? <div className="playzip-frame-wrap">{app.modal && <iframe className="playzip-frame" src={game.url} title={`${game.name} on PlayZip`} sandbox={`allow-scripts allow-same-origin allow-forms${desktop ? ' allow-downloads allow-popups' : ''}`} referrerPolicy="no-referrer"/>}</div> :
        <ScrollArea className="dialog-scroll" viewportClassName="dialog-scroll-viewport scroll-fade">
          {modal?.type==='details' && game && <GameDetails app={app} game={game}/>}
          {modal?.type==='setup' && game && <GameSetup app={app} game={game}/>}
          {modal?.type==='settings' && <Settings app={app}/>}
          {modal?.type==='transfers' && <Transfers app={app}/>}
          {modal?.type==='controls' && <Controls/>}
        </ScrollArea>}
    </DialogContent>
  </Dialog>;
}

function Settings({ app }) {
  const setAuto = () => app.perform(async ()=>{await request('setAutoMetadata',app.library.autoMetadata===false);await app.load();});
  return <div className="settings-content">
    <div className="appearance-preview"><img src="./themes/jungle-source.png" alt="Jungle background"/><div><h3>Appearance</h3></div></div>
    <div className="settings-switches">
      <Switch id="jungle-mode" label="Jungle background" checked={app.preferences.jungle} onToggle={()=>app.setPreference('jungle',!app.preferences.jungle)}/>
      <Switch id="launch-artwork-mode" label="Fullscreen launch artwork" checked={app.preferences.launchVortex} onToggle={()=>app.setPreference('launchVortex',!app.preferences.launchVortex)}/>
      <Switch id="auto-game-setup" label="Automatic artwork & game details" checked={app.library.autoMetadata!==false} onToggle={setAuto} disabled={!desktop}/>
    </div>
    <div className="settings-section"><h3>Game folder</h3><p className="path-value">{app.library.root}</p></div>
    <ActionList label="Settings actions" actions={[
      {id:'change-folder',label:'Change folder',icon:FolderOpen,onClick:app.chooseRoot,disabled:!desktop},
      {id:'rescan',label:'Rescan library',icon:RefreshCw,onClick:async()=>{await app.load();app.closeModal();}},
      {id:'settings-full',label:'Fullscreen',icon:Maximize,onClick:app.fullscreen},
      {id:'shortcuts',label:'Controls',icon:Keyboard,onClick:()=>app.openModal({type:'controls'})},
    ]}/>
  </div>;
}

function GameDetails({ app, game }) {
  const [working,setWorking] = useState(false);
  const action = async fn => { if(working)return;setWorking(true);try{await fn();}finally{setWorking(false);} };
  return <div className="game-details-content">
    <GameImage game={game} source={artwork(game)} className="detail-art" eager/>
    <div className="detail-meta"><Badge variant="dot">{game.platform || 'PC'}</Badge><span>{game.genre}</span></div>
    {game.description && <p className="setup-description">{game.description}</p>}
    {game.developer && <p className="muted-copy">{game.developer}</p>}
    <p className="path-value">{game.aumid ? 'Launch through Xbox' : game.launchUri ? `Launch through ${game.platform || 'Epic Games'}` : app.library.executables[game.id] || game.executable || 'Choose an executable'}</p>
    <ActionList label="Game options" actions={[
      {id:'game-setup',label:'Artwork & music',icon:Images,onClick:()=>app.openModal({type:'setup',gameId:game.id}),disabled:!desktop},
      {id:'favorite',label:app.library.favorites.includes(game.id) ? 'Remove from favorites' : 'Add to favorites',icon:Star,onClick:()=>app.favorite(game.id)},
      {id:'open-game-folder',label:'Open folder',icon:FolderOpen,onClick:()=>app.perform(()=>request('openFolder',game.id)),disabled:!desktop},
      !game.launchUri && !game.aumid && {id:'choose-exe',label:'Choose executable',icon:SquareTerminal,onClick:()=>app.perform(async()=>{await request('chooseExecutable',game.id);await app.load();}),disabled:!desktop},
    ]}/>
    <div className="destructive-section"><Button leadingIcon={Trash2} variant="ghost" id="uninstall-game" disabled={!desktop || working} onClick={()=>action(()=>app.uninstall(game.id))} className="text-destructive">Uninstall</Button></div>
  </div>;
}

function Transfers({ app }) {
  const [working,setWorking] = useState(null);
  const rootKey = value => String(value||'').replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase();
  const jobs = [...app.jobs].reverse().filter(job=>!job.root || rootKey(job.root)===rootKey(app.library.root));
  const action = async (job,name) => { if(working)return;setWorking(`${job.id}:${name}`);try{await app.controlDownload(job.id,name);}finally{setWorking(null);} };
  return <div className="transfers-content"><div className="catalogue-transfer-list">
    {jobs.map(job=>{const installed=installedDownload(job,app.library.games);return <article className="catalogue-transfer" key={job.id}>
      <h3>{job.game.name}</h3>{installed ? <p className="muted-copy">Installed</p> : <TransferState job={job}/>}
      <SizeProvider size="compact"><div className="installation-actions">{downloadActions(job).filter(([name])=>!installed || name==='delete').map(([name,label])=><Button key={name} variant="ghost" data-transfer={name} data-job={job.id} aria-label={`${label} ${job.game.name}`} disabled={Boolean(working)} onClick={()=>action(job,name)} className={name==='delete'?'text-destructive':''}>{label}</Button>)}</div></SizeProvider>
    </article>;})}
    {!jobs.length && <p className="muted-copy transfers-empty">No transfers</p>}
    </div><Button leadingIcon={FolderOpen} variant="secondary" id="add-archive" disabled={!desktop} onClick={()=>app.addArchive()}>Import archive</Button></div>;
}

function GameSetup({ app, game }) {
  const [query,setQuery] = useState(game.name), [matches,setMatches] = useState([]), [tracks,setTracks] = useState([]);
  const [busy,setBusy] = useState(false), [status,setStatus] = useState('');
  const pending = useRef(false), active = useRef(true);
  active.current = app.modal?.type==='setup' && app.modal.gameId===game.id;
  useEffect(()=>()=>{active.current=false;},[]);
  const bundled = themes[game.folder?.split(/[\\/]/).pop()] || themes[game.name];
  const run = async (fn,message,{refresh=false}={}) => {
    if(pending.current)return;pending.current=true;setBusy(true);setStatus(message);
    try {const result=await fn();if(!active.current)return; if(refresh && result) {await app.load();if(active.current)setStatus('Saved');}else if(result===null)setStatus('No file selected'); return result;}
    catch(error){if(active.current)setStatus(error.message);}
    finally{pending.current=false;if(active.current)setBusy(false);}
  };
  const media = kind => run(()=>request('chooseMedia',game.id,kind),'Choosing a file…',{refresh:true});
  return <div className="setup-content">
    <Button leadingIcon={ArrowLeft} variant="ghost" size="compact" onClick={()=>app.openModal({type:'details',gameId:game.id})}>{game.name}</Button>
    <div className="setup-artwork"><Card className="setup-cover" data-media="cover" label="Choose cover image" disabled={busy} onClick={()=>media('cover')}><GameImage game={game} source={artwork(game,'cover')}/><span>Cover</span></Card><Card className="setup-wallpaper" data-media="hero" label="Choose wallpaper image" disabled={busy} onClick={()=>media('hero')}><GameImage game={game} source={artwork(game)}/><span>Wallpaper</span></Card></div>
    <div className="setup-section-heading"><h3>Game details</h3><Button leadingIcon={WandSparkles} variant="ghost" size="compact" id="setup-auto" disabled={busy} onClick={async()=>{const result=await run(()=>request('autoConfigure',game.id),'Matching game…',{refresh:true});if(result?.needsMatch)setStatus('Choose a game match below');}}>Auto-configure</Button></div>
    <form className="setup-search" id="setup-search" onSubmit={async event=>{event.preventDefault();const result=await run(()=>request('searchMetadata',game.id,query.trim()),'Finding matches…');if(result && active.current){setMatches(result);setStatus(result.length ? 'Choose the matching game' : 'No matches found');}}}>
      <InputGroup><InputField id="setup-query" label="Game title" labelHidden icon={Search} index={0} value={query} onChange={setQuery} disabled={busy} maxLength={200} required/></InputGroup><Button variant="secondary" type="submit" disabled={busy || !query.trim()}>Find game</Button>
    </form>
    <div className="setup-results" id="setup-matches"><ActionList label="Game matches" actions={matches.map((match,index)=>({id:`match-${index}`,label:match.name,onClick:()=>run(()=>request('applyMetadata',game.id,match.id),'Saving match…',{refresh:true}),disabled:busy}))}/></div>
    <Button leadingIcon={Images} variant="ghost" data-media="logo" disabled={busy} onClick={()=>media('logo')}>{game.hasLogo ? 'Change logo' : 'Choose logo'}</Button>
    <div className="setup-section-heading"><h3>Theme music</h3></div>
    <p className="setup-track-name"><Music2/>{game.hasMusic ? game.musicTitle : bundled?.title || 'Choose a track'}</p>
    <div className="button-row"><Button variant="secondary" id="setup-find-music" disabled={busy} onClick={async()=>{const result=await run(()=>request('musicCandidates',game.id),'Finding music…');if(result && active.current){setTracks(result);setStatus(result.length?'Choose a track':'No playable tracks found');}}}>Find in game files</Button><Button variant="ghost" data-media="music" disabled={busy} onClick={()=>media('music')}>Choose audio file</Button></div>
    <div id="setup-tracks" className="setup-results"><ActionList label="Music tracks" actions={tracks.map((track,index)=>({id:`track-${index}`,label:track.name,disabled:busy,onClick:()=>run(()=>request('useMusic',game.id,track.file),'Saving music…',{refresh:true})}))}/></div>
    <p className="setup-status" id="setup-status" role="status">{status}</p>
  </div>;
}

function Controls() {
  return <div className="shortcut-list">{[['Select game','← → Home End'],['Activate','Enter / Space'],['Search','/'],['Fullscreen','F11'],['Back','Esc'],['Move (controller)','D-pad / left stick'],['Select or play (controller)','A'],['Back (controller)','B'],['Home / Library (controller)','LB / RB'],['Settings (controller)','Menu']].map(([label,key])=><div className="shortcut-row" key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</div>;
}
