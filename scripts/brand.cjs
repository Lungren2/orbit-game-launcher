const fs = require('node:fs/promises');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');

async function buildBrand() {
  const directory = path.join(__dirname, '../public/brand');
  const svg = await fs.readFile(path.join(directory, '../favicon.svg'), 'utf8');
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = sizes.map(size => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((png, i) => {
    const entry = 6 + i * 16;
    header[entry] = header[entry + 1] = sizes[i] === 256 ? 0 : sizes[i];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  await fs.writeFile(path.join(directory, 'orbit.ico'), Buffer.concat([header, ...images]));
  await fs.writeFile(path.join(directory, 'orbit.png'), images.at(-1));
}

module.exports = { buildBrand };
if (require.main === module) buildBrand().catch(error => { console.error(error); process.exitCode = 1; });
