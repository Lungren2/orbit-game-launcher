const path = require('node:path');

// Native caption buttons retain Windows keyboard shortcuts and Snap layouts.
function windowOptions() {
  return {
    width: 1440, height: 940, minWidth: 900, minHeight: 650,
    title: 'Orbit', backgroundColor: '#080e18', autoHideMenuBar: true,
    icon: path.join(__dirname, '../dist/brand/orbit.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#eef2ff', height: 88 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      autoplayPolicy: 'no-user-gesture-required',
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  };
}

module.exports = { windowOptions };
