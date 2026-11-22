'use strict';

const { copyFile, mkdir, readFile, readdir, rm, writeFile } = require('node:fs/promises');
const { dirname, join } = require('node:path');

const output = join(__dirname, 'dist');
const library = join(__dirname, 'Sheet Music');
const scores = join(__dirname, 'Sheet Scores');

async function copyAsset(source, destination = source) {
  const target = join(output, destination);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(__dirname, source), target);
}

async function build() {
  await rm(output, { recursive: true, force: true });
  await mkdir(join(output, 'sheet-score'), { recursive: true });

  const assets = [
    'index.html', 'styles.css', 'music.js', 'png-score.js', 'thu-tinh.js',
    'mua-xuan.js', 'pdf-chords.js', 'audio-input.js', 'pdf-reader.js', 'app.js',
    'vendor/pdf.js', 'vendor/pdf.worker.js', 'vendor/pdfjs-LICENSE'
  ];
  await Promise.all(assets.map(name => copyAsset(name)));
  await copyAsset(join('Sheet Scores', 'cursors.js'), 'score-cursors.js');
  await copyAsset(join('Sheet Scores', 'chord-symbols.js'), 'chord-symbols.js');

  const pdfs = (await readdir(library, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /\.pdf$/i.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, 'vi'));
  await Promise.all(pdfs.map(name => copyAsset(join('Sheet Music', name), join('sheet-library', name))));
  await writeFile(join(output, 'sheet-library.json'), JSON.stringify(pdfs));

  const recordings = new Map();
  const names = (await readdir(scores)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  for (const name of names) {
    const match = /^([a-f0-9]{64})(\.mvt\d+)?\.mxl$/.exec(name);
    if (!match) continue;
    const [, hash, movement] = match;
    if (!movement) {
      recordings.set(hash, [name]);
    } else {
      const existing = recordings.get(hash) || [];
      if (!existing.includes(hash + '.mxl')) recordings.set(hash, [...existing, name]);
    }
  }
  for (const [hash, files] of recordings) {
    const movements = await Promise.all(files.map(name => readFile(join(scores, name), 'base64')));
    await writeFile(join(output, 'sheet-score', hash + '.json'), JSON.stringify(movements));
  }
}

build().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
