export async function launchVortex({ game, art, games, enabled = true, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, page = document } = {}) {
  if (!enabled || reduced) return { close() {} };
  const overlay = page.createElement('div');
  overlay.className = 'launch-vortex space-vortex';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  const core = page.createElement('div'); core.className = 'vortex-core'; core.setAttribute('aria-hidden', 'true');
  const space = page.createElement('canvas'); space.className = 'vortex-space'; space.setAttribute('aria-hidden','true');
  const pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
  space.width = Math.round(innerWidth * pixelRatio); space.height = Math.round(innerHeight * pixelRatio);
  const context = space.getContext('2d');
  if (context) {
    context.scale(pixelRatio,pixelRatio); context.fillStyle = '#020410'; context.fillRect(0,0,innerWidth,innerHeight);
    for (const [x,y,color] of [[.3,.42,'#4436ad44'],[.7,.32,'#1b61bd33'],[.53,.58,'#8c2c9b22']]) {
      const glow = context.createRadialGradient(innerWidth*x,innerHeight*y,0,innerWidth*x,innerHeight*y,innerWidth*.4);
      glow.addColorStop(0,color); glow.addColorStop(1,'transparent'); context.fillStyle = glow; context.fillRect(0,0,innerWidth,innerHeight);
    }
    let seed = 1937;
    const random = () => { seed = seed*16807%2147483647; return seed/2147483647; };
    for (let i=0;i<220;i++) {
      const x=random()*innerWidth,y=random()*innerHeight,radius=.35+random()*1.15;
      context.fillStyle=`rgba(210,225,255,${.25+random()*.65})`; context.beginPath(); context.arc(x,y,radius,0,Math.PI*2); context.fill();
      if(i%27===0) { context.strokeStyle='#b6d3ff55';context.lineWidth=.6;context.beginPath();context.moveTo(x-5,y);context.lineTo(x+5,y);context.moveTo(x,y-5);context.lineTo(x,y+5);context.stroke(); }
    }
  }
  const ns='http://www.w3.org/2000/svg';
  const spiral=page.createElementNS(ns,'svg');spiral.setAttribute('viewBox','0 0 600 600');spiral.classList.add('vortex-spiral');
  for(let arm=0;arm<7;arm++) {
    let points='';
    for(let step=0;step<=110;step++) {const t=step/110;const radius=32*Math.exp(t*2.1);const angle=arm*Math.PI*2/7+t*Math.PI*2.6;points+=`${step?'L':'M'}${(300+Math.cos(angle)*radius).toFixed(2)},${(300+Math.sin(angle)*radius).toFixed(2)} `;}
    const path=page.createElementNS(ns,'path');path.setAttribute('d',points);path.setAttribute('fill','none');path.setAttribute('stroke',arm%2?'#9c94ff':'#a3d7ff');path.setAttribute('stroke-width',String(arm%3+1.5));path.setAttribute('stroke-linecap','round');path.setAttribute('opacity',String(.45+(arm%3)*.18));spiral.append(path);
  }
  core.append(spiral);
  const halo = page.createElement('div'); halo.className = 'vortex-halo'; halo.setAttribute('aria-hidden', 'true');
  const caption = page.createElement('div'); caption.className = 'vortex-caption';
  const label = page.createElement('span'); label.className = 'vortex-eyebrow'; label.textContent = 'ENTERING ORBIT';
  const title = page.createElement('h2'); title.textContent = game.name;
  const status = page.createElement('p'); status.textContent = 'Launching your game';
  caption.append(label,title,status); overlay.append(space,halo,core,caption);
  page.body.append(overlay); page.body.classList.add('launching');
  const animations = [];
  const selected = games.find(g => g.id === game.id) || game;
  const orbiting = [...games.filter(g => g.id !== game.id).slice(0,23), selected];
  const radius = Math.min(innerWidth * 0.23, innerHeight * 0.27, 260);
  const size = Math.max(58, Math.min(100, innerWidth * 0.065));
  const transform = (angle, distance, scale) => `rotate(${angle}deg) translateX(${distance}px) rotate(${-angle}deg) scale(${scale})`;
  try {
    orbiting.forEach((g,i) => {
      const card = page.createElement('div'); card.className = `vortex-card${g.id === game.id ? ' vortex-selected' : ''}`;
      card.style.width = `${size}px`; card.style.height = `${size}px`;
      card.style.marginLeft = `${-size/2}px`; card.style.marginTop = `${-size/2}px`;
      card.setAttribute('aria-hidden','true');
      const source = art(g,'cover');
      if (source) { const img = page.createElement('img'); img.src = source; img.alt = ''; card.append(img); }
      else { const text = page.createElement('span'); text.textContent = g.name; card.append(text); }
      overlay.append(card);
      const original = [...page.querySelectorAll('.game-tile')].find(el => el.dataset.id === g.id);
      const rect = original?.getBoundingClientRect();
      const angle = i * 360 / orbiting.length - 100;
      const initial = rect ? `translate(${rect.left + rect.width/2 - innerWidth/2}px,${rect.top + rect.height/2 - innerHeight*0.45}px) scale(${Math.min(rect.width/size,2)})` : transform(angle,radius,1);
      animations.push(card.animate([
        { transform:initial, opacity:1, offset:0 },
        { transform:transform(angle,radius,0.95), opacity:1, offset:0.19 },
        { transform:transform(angle+160,radius*0.94,0.86), opacity:1, offset:0.42 },
        { transform:transform(angle+355,radius*0.62,0.62), opacity:1, offset:0.67 },
        { transform:transform(angle+560,radius*0.23,0.35), opacity:0.9, offset:0.88 },
        { transform:transform(angle+690,0,0.015), opacity:0, offset:1 },
      ], { duration:2250, delay:i*32, fill:'forwards', easing:'cubic-bezier(.35,0,.35,1)' }));
    });
    await Promise.all(animations.map(animation => animation.finished));
    await core.animate([{transform:'scale(1)',opacity:1},{transform:'scale(.05)',opacity:0}],{duration:220,fill:'forwards',easing:'ease-in'}).finished;
    halo.style.opacity = '0'; status.textContent = 'Opening game…';
  } catch { /* A closed or interrupted animation must not block launching the game. */ }
  return { close() { animations.forEach(animation => animation.cancel()); overlay.remove(); page.body.classList.remove('launching'); } };
}
