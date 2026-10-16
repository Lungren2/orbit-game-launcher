const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const { createPackage } = await import('@electron/asar');
  const root = path.join(__dirname, '..');
  const output = path.join(root, 'release', 'Orbit');
  const stage = path.join(root, 'release', 'app-source');
  const electronDist = path.dirname(require('electron'));
  await fs.mkdir(stage, { recursive: true });
  await fs.mkdir(output, { recursive: true });
  for (const entry of await fs.readdir(electronDist)) {
    await fs.cp(path.join(electronDist, entry), path.join(output, entry === 'electron.exe' ? 'Orbit.exe' : entry), { recursive: true });
  }
  for (const entry of ['dist', 'electron']) await fs.cp(path.join(root, entry), path.join(stage, entry), { recursive: true });
  await fs.cp(path.join(root, 'vendor/7zip'), path.join(output, 'resources/7zip'), { recursive: true });
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: 'orbit-game-launcher', productName: 'Orbit', version: '1.0.0', main: 'electron/main.cjs' }, null, 2));
  await createPackage(stage, path.join(output, 'resources', 'app.asar'));
  await fs.copyFile(path.join(root, 'README.md'), path.join(output, 'README.md'));
  console.log(`Windows app ready: ${path.join(output, 'Orbit.exe')}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
