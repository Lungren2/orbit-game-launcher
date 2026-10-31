// Over-the-air updates from GitHub Releases. The installed app checks on
// start and every few hours, downloads new installers in the background, and
// installs them when Orbit restarts (or immediately when the user asks).
const { autoUpdater } = require('electron-updater');

const CHECK_INTERVAL = 4 * 60 * 60 * 1000;

function startUpdates({ app, send }) {
  if (!app.isPackaged) return { status: () => ({ state: 'unsupported' }), install: () => {} };
  let status = { state: 'idle' };
  const update = next => { status = next; send(status); };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Lets a local feed stand in for GitHub when testing an update end to end.
  if (process.env.ORBIT_UPDATE_FEED) autoUpdater.setFeedURL({ provider: 'generic', url: process.env.ORBIT_UPDATE_FEED });
  autoUpdater.on('update-available', info => update({ state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', progress => update({ ...status, state: 'downloading', percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', info => update({ state: 'ready', version: info.version }));
  autoUpdater.on('update-not-available', () => update({ state: 'idle' }));
  // Offline or rate limited: stay quiet and try again at the next check.
  autoUpdater.on('error', error => { console.warn('Update check failed:', error?.message || error); if (status.state !== 'ready') update({ state: 'idle' }); });
  const check = () => { if (status.state === 'idle') autoUpdater.checkForUpdates().catch(() => {}); };
  check();
  setInterval(check, CHECK_INTERVAL).unref?.();
  return { status: () => status, install: () => { if (status.state === 'ready') autoUpdater.quitAndInstall(true, true); } };
}

module.exports = { startUpdates };
