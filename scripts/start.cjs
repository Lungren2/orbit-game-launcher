const { spawn } = require('node:child_process');
const path = require('node:path');
const env = { ...process.env };
// Terminal hosts built on Electron may export this variable for their helpers.
delete env.ELECTRON_RUN_AS_NODE;
const smoke = process.argv.includes('--smoke');
const packaged = process.argv.includes('--packaged');
const child = spawn(packaged ? path.join(__dirname, '../release/Orbit/Orbit.exe') : require('electron'), packaged ? [] : [smoke ? path.join(__dirname, 'smoke.cjs') : '.'], { cwd: path.join(__dirname, '..'), env, stdio: 'inherit', windowsHide: smoke });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
