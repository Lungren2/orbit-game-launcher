import { useRef, useState, useEffect } from 'react';
import { Check, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from './ui/button';
import { Tooltip } from './ui/tooltip';
import { Dropdown } from './ui/dropdown';
import { MenuItem } from './ui/menu-item';
import { Select, SelectTrigger, SelectContent, SelectItem } from './ui/select';
import { useFluidHover, useRegisterFluidHoverItem } from '@/hooks/use-fluid-hover';
import { FluidHoverHighlight } from './fluid-hover-highlight';
import { spring } from '@/lib/springs';
import { downloadStatus } from '../downloads.js';

export function IconButton({ label, children, compact = false, ...props }) {
  return <Tooltip content={label}><Button variant="ghost" size={compact ? 'icon-compact' : 'icon'} aria-label={label} {...props}>{children}</Button></Tooltip>;
}

export function Choice({ id, label, value, options, onChange, disabled }) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger id={id} aria-label={label} className="transition-[color,background-color,border-color,box-shadow,font-variation-settings]">{options.find(([key])=>key === value)?.[1]}</SelectTrigger>
    <SelectContent>{options.map(([key,text],index)=><SelectItem key={key} index={index} value={key}>{text}</SelectItem>)}</SelectContent>
  </Select>;
}

export function ActionList({ actions, label = 'Actions' }) {
  return <Dropdown aria-label={label} className="action-list">{actions.filter(Boolean).map((action,index) => <MenuItem key={action.id || action.label} index={index} icon={action.icon} label={action.label} id={action.id} onSelect={action.onClick} disabled={action.disabled} className={action.danger ? 'text-destructive' : ''} />)}</Dropdown>;
}

export function HoverStrip({ children, label, className = '' }) {
  const ref = useRef(null), hover = useFluidHover(ref,{axis:'x'});
  return <div ref={ref} {...hover.handlers} role="group" aria-label={label} className={`hover-strip ${className}`}>
    <FluidHoverHighlight hover={hover} className="rounded-lg" />
    {children.map((child,index)=><HoverStripItem key={child.key || index} index={index} register={hover.registerItem}>{child}</HoverStripItem>)}
  </div>;
}
function HoverStripItem({ index, register, children }) {
  const ref = useRef(null); useRegisterFluidHoverItem(register,index,ref);
  return <div ref={ref} className="hover-strip-item">{children}</div>;
}

export function GameImage({ game, source, previewSource, className = '', eager = false }) {
  const [broken,setBroken] = useState(false);
  const [previewReady,setPreviewReady]=useState(''),[fullReady,setFullReady]=useState(''),[previewFailed,setPreviewFailed]=useState(false);
  useEffect(()=>{setBroken(false);setPreviewReady('');setFullReady('');setPreviewFailed(false);},[source,previewSource]);
  const progressive=previewSource && previewSource!==source;
  return <div className={`game-image ${className}`}>
    {source && !broken ? <>
      <img src={progressive?previewSource:source} alt="" decoding="async" loading={eager ? 'eager' : 'lazy'} referrerPolicy="no-referrer" onLoad={()=>setPreviewReady(source)} onError={()=>{if(progressive){setPreviewFailed(true);setPreviewReady(source);}else setBroken(true);}} draggable="false" />
      {progressive && previewReady===source && <motion.img key={source} className="game-image-full" src={source} alt="" decoding="async" referrerPolicy="no-referrer" initial={{opacity:0}} animate={{opacity:fullReady===source?1:0}} transition={spring.fast}
        onLoad={event=>{const image=event.currentTarget;image.decode().then(()=>setFullReady(source)).catch(()=>{});}} onError={()=>{if(previewFailed)setBroken(true);}} draggable="false" />}
    </> : <span className="fallback-name">{game.name}</span>}
  </div>;
}

export function TransferState({ job, compact = false }) {
  const state = downloadStatus(job), progress = ['downloading','paused','interrupted','queued','extracting','importing'].includes(job.status);
  return <div className="download-state"><span className="installation-label">{job.status === 'cancelled' ? 'Cancelled' : state.text}</span>
    {progress && <progress max="100" value={state.percent ?? undefined} aria-label={`${job.game.name} installation progress`} />}
    {!compact && job.message && <span className="installation-message">{job.message}</span>}
  </div>;
}

export function ThemePlayer({ app, compact = false }) {
  const off = app.musicState.muted || app.musicState.volume === 0 || !app.musicEngaged;
  if (!app.musicState.theme) return null;
  return <div className={`theme-player ${compact ? 'theme-player-compact' : ''}`}>
    <IconButton id="theme-mute" label={off ? 'Play theme music' : 'Mute theme music'} onClick={app.toggleMusic} aria-pressed={off}>
      <span className="icon-swap">{[false,true].map(muted=><motion.span key={String(muted)} animate={{opacity:muted === off ? 1 : 0,scale:muted === off ? 1 : .6}} transition={muted === off ? spring.fast : spring.fast.exit}>{muted ? <VolumeX/> : <Volume2/>}</motion.span>)}</span>
    </IconButton>
    {!compact && <span className="theme-track" id="theme-title">{app.musicState.theme.title}</span>}
  </div>;
}

export function InstalledMark() { return <span className="installed-marker" aria-label="Installed"><Check size={14}/></span>; }
