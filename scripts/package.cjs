const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const { createPackage } = await import('@electron/asar');
  const { rcedit } = await import('rcedit');
  const root = path.join(__dirname, '..');
  const { version } = require(path.join(root, 'package.json'));
  const output = path.join(root, 'release', 'Orbit');
  const stage = path.join(root, 'release', 'app-source');
  const electronDist = path.dirname(require('electron'));
  await fs.mkdir(stage, { recursive: true });
  await fs.mkdir(output, { recursive: true });
  for (const entry of await fs.readdir(electronDist)) {
    await fs.cp(path.join(electronDist, entry), path.join(output, entry === 'electron.exe' ? 'Orbit.exe' : entry), { recursive: true });
  }
  for (const entry of ['dist', 'electron']) await fs.cp(path.join(root, entry), path.join(stage, entry), { recursive: true });
  // Only the HTML parser and the updater need npm packages at runtime; bundle
  // those modules so the installed Electron app remains independent of node_modules.
  for (const entry of ['catalogue-parser.cjs', 'updater.cjs']) await require('esbuild').build({entryPoints:[path.join(root,'electron',entry)],outfile:path.join(stage,'electron',entry),bundle:true,platform:'node',format:'cjs',target:'node22',external:['electron'],legalComments:'inline'});
  await fs.cp(path.join(root, 'vendor/7zip'), path.join(output, 'resources/7zip'), { recursive: true });
  await fs.cp(path.join(root, 'vendor/hatchzip'), path.join(output, 'resources/hatchzip'), { recursive: true });
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: 'orbit-game-launcher', productName: 'Orbit', version, main: 'electron/main.cjs' }, null, 2));
  await createPackage(stage, path.join(output, 'resources', 'app.asar'));
  // electron-updater reads its feed from here; releases are published on GitHub.
  await fs.writeFile(path.join(output, 'resources', 'app-update.yml'), 'provider: github\nowner: Lungren2\nrepo: orbit-game-launcher\nupdaterCacheDirName: orbit-updater\n');
  await rcedit(path.join(output, 'Orbit.exe'), {
    icon: path.join(root, 'public/brand/orbit.ico'),
    'version-string': { ProductName: 'Orbit', FileDescription: 'Orbit Game Launcher', InternalName: 'Orbit', OriginalFilename: 'Orbit.exe' },
    'file-version': version, 'product-version': version,
  });
  await fs.copyFile(path.join(root, 'README.md'), path.join(output, 'README.md'));
  console.log(`Windows app ready: ${path.join(output, 'Orbit.exe')}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
