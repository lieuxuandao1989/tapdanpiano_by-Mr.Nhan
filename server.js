'use strict';

const http = require('node:http');
const { readFile, readdir } = require('node:fs/promises');
const { join } = require('node:path');

const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/music.js', ['music.js', 'text/javascript']],
  ['/png-score.js', ['png-score.js', 'text/javascript']],
  ['/thu-tinh.js', ['thu-tinh.js', 'text/javascript']],
  ['/mua-xuan.js', ['mua-xuan.js', 'text/javascript']],
  ['/score-cursors.js', [join('Sheet Scores', 'cursors.js'), 'text/javascript']],
  ['/chord-symbols.js', [join('Sheet Scores', 'chord-symbols.js'), 'text/javascript']],
  ['/pdf-chords.js', ['pdf-chords.js', 'text/javascript']],
  ...['audio-input.js', 'pdf-reader.js', 'vendor/pdf.js', 'vendor/pdf.worker.js'].map(name => ['/' + name, [name, 'text/javascript']]),
  ['/app.js', ['app.js', 'text/javascript']]
]);
const port = Number(process.argv[2] || 4173);

http.createServer(async (request, response) => {
  const path = request.url.split('?')[0];
  let asset = files.get(path);
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end();
    return;
  }
  try {
    if (/^\/sheet-score\/[a-f0-9]{64}$/.test(path)) {
      try {
        const content = await readFile(join(__dirname, 'Sheet Scores', path.split('/').at(-1) + '.mxl'));
        response.writeHead(200, { 'Content-Type': 'application/vnd.recordare.musicxml', 'Cache-Control': 'no-store' });
        response.end(request.method === 'HEAD' ? undefined : content);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const hash = path.split('/').at(-1);
        const folder = join(__dirname, 'Sheet Scores');
        const movements = (await readdir(folder).catch(error => { if (error.code === 'ENOENT') return []; throw error; }))
          .filter(name => name.startsWith(hash + '.mvt') && /^\w{64}\.mvt\d+\.mxl$/.test(name))
          .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
        if (!movements.length) { response.writeHead(404).end(); return; }
        const encoded = await Promise.all(movements.map(async name => (await readFile(join(folder, name))).toString('base64')));
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(encoded));
      }
      return;
    }
    if (path === '/sheet-library' || path.startsWith('/sheet-library/')) {
      const entries = await readdir(join(__dirname, 'Sheet Music'), { withFileTypes: true });
      const names = entries.filter(entry => entry.isFile() && /\.pdf$/i.test(entry.name)).map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b, 'vi'));
      if (path === '/sheet-library') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(names));
        return;
      }
      const name = decodeURIComponent(path.slice('/sheet-library/'.length));
      if (names.includes(name)) asset = [join('Sheet Music', name), 'application/pdf'];
    }
    if (!asset) { response.writeHead(404).end(); return; }
    const [name, mime] = asset;
    const content = await readFile(join(__dirname, name));
    response.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(500).end();
  }
}).listen(port, '127.0.0.1', () => {
  console.log('Phím & Nhịp · http://127.0.0.1:' + port);
});
