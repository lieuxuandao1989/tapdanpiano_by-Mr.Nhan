'use strict';

const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, readdirSync, copyFileSync, appendFileSync, renameSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const root = __dirname;
const sheets = join(root, 'Sheet Music');
const library = join(root, 'Sheet Scores');
const runtime = process.env.PIANO_AUDIVERIS_HOME || join(tmpdir(), 'PhimNhip-Audiveris-5.11.0', 'Audiveris');
const java = join(runtime, 'runtime', 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
if (!existsSync(java)) throw Error('Chưa tìm thấy Audiveris. Đặt PIANO_AUDIVERIS_HOME trỏ tới thư mục Audiveris có app và runtime.');

const files = readdirSync(sheets, { withFileTypes: true }).filter(entry => entry.isFile() && /\.pdf$/i.test(entry.name));
const filter = process.argv.slice(2);
const jobs = join(tmpdir(), 'PhimNhip-Audiveris-jobs');
mkdirSync(jobs, { recursive: true });
mkdirSync(library, { recursive: true });
const pending = [];
for (const entry of files) {
  if (filter.length && !filter.includes(entry.name)) continue;
  const path = join(sheets, entry.name);
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (hash !== 'cc7487e7a3dbf3a03879b734b5682b3cc8b030b5c94c59b50e00a37a95546233' &&
    !existsSync(join(library, hash + '.mxl')) && !existsSync(join(library, hash + '.mvt1.mxl'))) {
    pending.push({ path, hash, name: entry.name });
  }
}

function convert(item) {
  return new Promise(resolve => {
    // ASCII basename avoids encoding issues in native Java services on Windows.
    const input = join(jobs, item.hash + '.pdf');
    if (!existsSync(input)) copyFileSync(item.path, input);
    const book = join(jobs, item.hash + '.omr');
    const processArgs = ['-XX:ActiveProcessorCount=2', '-Xmx2g', '-Dfile.encoding=UTF-8',
      '--enable-native-access=ALL-UNNAMED', '--add-exports=java.desktop/sun.awt.image=ALL-UNNAMED',
      '-cp', join(runtime, 'app', '*'), 'Audiveris', '-batch', '-save', '-transcribe', '-export', '-output', jobs,
      '--', existsSync(book) ? book : input];
    const child = spawn(java, processArgs, { cwd: jobs, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const collect = chunk => { log = (log + chunk).slice(-32000); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', error => { collect(String(error)); });
    const timeout = setTimeout(() => child.kill(), 600000);
    child.on('close', code => {
      clearTimeout(timeout);
      appendFileSync(join(jobs, item.hash + '.run.log'), '\n' + log);
      const scoreNames = readdirSync(jobs).filter(name => name === item.hash + '.mxl' ||
        (name.startsWith(item.hash + '.mvt') && name.endsWith('.mxl')));
      if (code !== 0 || !scoreNames.length) {
        console.error('THIẾU', item.name, code, join(jobs, item.hash + '.run.log'));
        resolve(false);
        return;
      }
      for (const name of scoreNames) {
        const output = join(library, name);
        const temporary = output + '.tmp';
        copyFileSync(join(jobs, name), temporary);
        renameSync(temporary, output);
      }
      console.log('XONG', item.name);
      resolve(true);
    });
  });
}

async function run() {
  let completed = 0;
  const total = pending.length;
  const workers = Math.max(1, Math.min(4, Number(process.env.PIANO_OMR_WORKERS) || 2));
  await Promise.all(Array.from({ length: workers }, async () => {
    while (pending.length) if (await convert(pending.shift())) completed++;
  }));
  console.log('Xuất được ' + completed + ' / ' + total + ' PDF trong lượt này.');
  if (completed < total) process.exitCode = 1;
}
run().catch(error => { console.error(error); process.exitCode = 1; });
