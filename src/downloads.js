const labels = { downloading: 'Downloading', paused: 'Paused', interrupted: 'Interrupted', queued: 'Waiting to install', extracting: 'Extracting', importing: 'Installing', ready: 'Not in library', 'needs-executable': 'Setup required', 'needs-attention': 'Needs attention', failed: 'Installation failed' };
const pathKey = value => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
export const catalogueId = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? String(Number(value)) : null;

export function sameDownload(a, b) {
  const id = catalogueId(a.game?.id), steam = catalogueId(a.game?.steamAppId);
  return a.id === b.id || !!(id && id === catalogueId(b.game?.id)) || !!(steam && steam === catalogueId(b.game?.steamAppId));
}

export function installedDownload(job, games) {
  const id = catalogueId(job.game?.id), steam = catalogueId(job.game?.steamAppId);
  return games.find(game => (job.gameId && game.id === job.gameId) || (job.folder && pathKey(game.folder) === pathKey(job.folder)) ||
    (id && catalogueId(game.playzipId) === id) || (steam && catalogueId(game.steamAppId) === steam));
}

export function pendingDownloads(jobs, games, root) {
  const seen = new Set();
  return [...jobs].reverse().filter(job => {
    if (!labels[job.status] || !job.game?.name || installedDownload(job, games)) return false;
    if (root && job.root && pathKey(root) !== pathKey(job.root)) return false;
    const id = catalogueId(job.game.id), steam = catalogueId(job.game.steamAppId);
    const key = id ? `catalogue:${id}` : steam ? `steam:${steam}` : `job:${job.id}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function downloadGames(jobs, games, root) {
  return pendingDownloads(jobs, games, root).map(job => ({ id: `download-${job.id}`, name: job.game.name, coverUrl: job.game.coverUrl || null, download: job }));
}

export function downloadStatus(job) {
  const transferring = ['downloading', 'paused', 'interrupted'].includes(job.status);
  const percent = transferring && job.total > 0 ? Math.max(0, Math.min(100, Math.floor(job.received / job.total * 100))) : null;
  return { label: labels[job.status] || 'Not installed', percent, text: `${labels[job.status] || 'Not installed'}${percent === null ? '' : ` · ${percent}%`}` };
}

export function downloadMarkup(job, esc, { compact = false } = {}) {
  if (!job) return '';
  const state = downloadStatus(job);
  const progress = ['downloading', 'paused', 'interrupted', 'queued', 'extracting', 'importing'].includes(job.status);
  const message = compact ? '' : job.message || (job.status === 'ready' ? 'Rescan the library or import the archive again.' : '');
  return `<span class="installation-label">${esc(state.text)}</span>${progress ? `<progress max="100" ${state.percent === null ? '' : `value="${state.percent}"`} aria-label="${esc(job.game.name)} installation progress"></progress>` : ''}${message ? `<span class="installation-message">${esc(message)}</span>` : ''}`;
}

export function downloadActions(job) {
  const actions = [];
  if (job.status === 'downloading' && job.live) actions.push(['pause','Pause']);
  if ((job.status === 'paused' || job.status === 'interrupted' && job.resumable) && job.live) actions.push(['resume','Resume']);
  if (job.live || job.status === 'queued') actions.push(['cancel','Cancel']);
  if (job.downloadComplete && ['failed','interrupted'].includes(job.status)) actions.push(['retry','Retry installation']);
  if (['ready','needs-attention'].includes(job.status)) actions.push(['reimport','Import archive']);
  if (job.status === 'interrupted' && !job.live && !job.downloadComplete) actions.push(catalogueId(job.game?.id) ? ['restart','Download again'] : ['reimport','Import archive']);
  if (!['extracting','importing'].includes(job.status)) actions.push(['delete','Delete download']);
  return actions;
}
