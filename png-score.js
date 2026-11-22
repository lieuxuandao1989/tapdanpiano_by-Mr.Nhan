// Basic recognition for straight, printed treble staves with filled noteheads.
(() => {
  'use strict';

  function staffPitch(steps, bass, key = 0, accidental) {
    const degree = (bass ? 18 : 30) + steps;
    const letter = (degree % 7 + 7) % 7;
    const order = key < 0 ? [6,2,5,1,4,0,3] : [3,0,4,1,5,2,6];
    const alteration = accidental ?? (order.indexOf(letter) < Math.abs(key) ? Math.sign(key) : 0);
    return (Math.floor(degree / 7) + 1) * 12 + [0,2,4,5,7,9,11][letter] + alteration;
  }

  // Scale notehead silhouettes to the staff spacing. Ignore staff/ledger
  // lines and verify the surrounding paper as well as the ink inside a head.
  const headMasks = [
    { skip: 4, rows: ['............#..','...............','.....########..','....#########..','...##########..','...#########...','..##########...','..#########....','...#######.....','...............','...............'] },
    { skip: 0, rows: ['...............','........####...','......#####.##.','.....####....#.','....###.....##.','...............','...#......###..','...#....####...','...#..#####....','....#####......','...............'] },
    { skip: 0, rows: ['...............','.....######....','...#####...#...','..####.....#...','..###.....##...','...............','.#.....####....','.#....####.....','.##.####.......','...#...........','...............'] }
  ];
  function printedHeads(ink, width, height, lines, gap, left, right) {
    const bottom = (lines[4].start + lines[4].end) / 2;
    const matches = [];
    for (let steps = -6; steps <= 14; steps++) {
      const y = Math.round(bottom - steps * gap / 2);
      if (y < gap || y + gap >= height) continue;
      for (const mask of headMasks) {
        const dark = [], light = [];
        for (let row = 0; row < mask.rows.length; row++) {
          const dy = row - 5;
          const yy = y + Math.round(dy * gap / 8);
          if (Math.abs(dy) === mask.skip || (steps % 2 === 0 && Math.abs(dy) < 1) ||
            lines.some(line => yy >= line.start && yy <= line.end)) continue;
          for (let col = 0; col < mask.rows[row].length; col++) {
            const offset = yy * width + Math.round((col - 7) * gap / 8);
            (mask.rows[row][col] === '#' ? dark : light).push(offset);
          }
        }
        if (!dark.length || !light.length) continue;
        const minDark = Math.ceil(.82 * dark.length);
        for (let x = Math.ceil(left + 3 * gap); x <= Math.min(right, width - gap - 1); x++) {
          if (!ink[x + dark[Math.floor(dark.length / 2)]] && !ink[x + dark[Math.floor(dark.length / 3)]]) continue;
          let d = 0, l = 0;
          for (const offset of dark) d += ink[x + offset];
          if (d < minDark) continue;
          for (const offset of light) l += 1 - ink[x + offset];
          const score = (d / dark.length + l / light.length) / 2;
          if (score >= .88 && l / light.length >= .8) matches.push({ x, steps, score });
        }
      }
    }
    const heads = [];
    for (const hit of matches.sort((a,b) => b.score - a.score)) {
      if (!heads.some(n => Math.abs(n.x-hit.x) < gap*.9 && Math.abs(n.steps-hit.steps) < 2)) heads.push(hit);
    }
    return heads;
  }
  function readPixels(pixels, width, height, options = {}) {
    const ink = new Uint8Array(width * height);
    const bands = [];
    for (let y = 0; y < height; y++) {
      let count = 0;
      let first = width;
      let last = -1;
      for (let x = 0; x < width; x++) {
        const pos = y * width + x;
        const i = 4 * pos;
        const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        const brightness = 255 - (255 - gray) * pixels[i + 3] / 255;
        if (brightness > 210) continue;
        ink[pos] = Number(brightness <= 155);
        count++;
        first = Math.min(first, x);
        last = x;
      }
      if (count < width * .32) continue;
      const prev = bands.at(-1);
      if (prev && prev.end === y - 1) {
        prev.end = y;
        prev.first = Math.min(prev.first, first);
        prev.last = Math.max(prev.last, last);
      }
      else bands.push({ start: y, end: y, first, last });
    }
    const notes = [];
    const linesFound = [];
    let staffs = 0;
    let beat = 0;
    for (let i = 0; i + 4 < bands.length; i++) {
      const lines = bands.slice(i, i + 5);
      const centers = lines.map(line => (line.start + line.end) / 2);
      const gap = (centers[4] - centers[0]) / 4;
      if (gap < 5 || gap > 85 || centers.some((center, j) => Math.abs(center - centers[0] - j * gap) > gap * .18)) continue;
      staffs++;
      i += 4;
      const left = Math.max(...lines.map(line => line.first));
      const right = Math.min(...lines.map(line => line.last));
      if (options.list || options.geometry) linesFound.push({ top: centers[0], bottom: centers[4], left, right });
      if (options.list || (options.staff !== undefined && options.staff !== staffs - 1)) continue;
      const candidates = [];
      // A notehead leaves wide runs on either side of staff lines. Thin stems
      // and long horizontal beams do not match its expected width and height.
      const clusters = [];
      let active = [];
      for (let y = Math.max(0, Math.ceil(centers[0] - 2 * gap)); y <= Math.min(height - 1, centers[4] + 2 * gap); y++) {
        if (lines.some(line => y >= line.start && y <= line.end)) continue;
        active = active.filter(c => y === c.last + 1 ||
          lines.some(line => c.last + 1 === line.start && y === line.end + 1));
        for (let x = left; x <= right; x++) {
          if (!ink[y * width + x]) continue;
          const x0 = x;
          while (x < right && ink[y * width + x + 1]) x++;
          const size = x - x0 + 1;
          if (size < gap * .63 || size > gap * 1.68) continue;
          const cx = (x + x0) / 2;
          // Reserve the beginning of a standard staff for its clef.
          if (cx < left + gap * 3) continue;
          let cluster = active.findLast(c => Math.abs(cx - c.x) < gap * .42 && y > c.last);
          if (!cluster) {
            cluster = { x: cx, top: y, last: y, sum: 0, count: 0 };
            clusters.push(cluster);
            active.push(cluster);
          }
          cluster.last = y;
          cluster.sum += cx;
          cluster.count++;
          cluster.x = cluster.sum / cluster.count;
        }
      }
      for (const cluster of clusters) {
        const size = cluster.last - cluster.top + 1;
        if (size < gap * .45 || size > gap * 1.22 || cluster.count < gap * .3) continue;
        const cy = (cluster.top + cluster.last) / 2;
        const steps = Math.round((centers[4] - cy) / (gap / 2));
        const pitch = staffPitch(steps, options.bass, options.key);
        candidates.push({ x: cluster.x, pitch, steps });
      }
      if (options.staff !== undefined) {
        const heads = printedHeads(ink, width, height, lines, gap, left, right);
        // Prefer the silhouette check when this printed font matches well.
        // Preserve the run-based fallback for handwriting and other fonts.
        if (heads.length >= Math.max(3, candidates.length * .5)) candidates.length = 0;
        for (const hit of heads) {
          if (!candidates.some(n => n.steps === hit.steps && Math.abs(n.x-hit.x) < gap*.85)) {
            candidates.push({ ...hit, pitch: staffPitch(hit.steps, options.bass, options.key) });
          }
        }
      }
      candidates.sort((a, b) => a.x - b.x);
      let onsetX = -Infinity;
      for (const candidate of candidates) {
        if (candidate.x - onsetX > gap * .65) {
          onsetX = candidate.x;
          beat++;
        }
        notes.push({ start: beat - 1, duration: 1, pitch: candidate.pitch, hand: options.bass ? 'left' : 'right',
          x: candidate.x / width, steps: candidate.steps, staff: staffs - 1 });
      }
    }
    if (options.list) return linesFound;
    if (!staffs) throw Error('Không tìm thấy khuông 5 dòng. Hãy cắt sát bản nhạc và chỉnh thẳng ảnh.');
    if (!notes.length) throw Error('Đã thấy khuông nhạc nhưng chưa đọc được đầu nốt đen. Hãy thử ảnh rõ hơn.');
    return options.geometry ? { notes, staves: linesFound, width, height } : notes;
  }

  async function readPNG(file, geometryOnly = false) {
    const header = new DataView(await file.slice(0, 24).arrayBuffer());
    if (header.byteLength < 24 || header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a) {
      throw Error('Tệp PNG không hợp lệ.');
    }
    const w = header.getUint32(16);
    const h = header.getUint32(20);
    if (!w || !h || w * h > 32e6) throw Error('Hãy cắt ảnh thành từng đoạn nhỏ hơn 32 triệu điểm ảnh.');
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 2400 / w, Math.sqrt(12e6 / (w * h)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const { width, height } = canvas;
      const pixels = ctx.getImageData(0, 0, width, height).data;
      if (geometryOnly) return { staves: readPixels(pixels, width, height, { list: true }), width, height };
      return readPixels(pixels, width, height, { geometry: true });
    } finally {
      bitmap.close();
    }
  }
  // Match the selected printed head at diatonic staff positions. Ignore
  // staff-line pixels so a space note can also match a note on a line.
  function similarHeads(pixels, width, height, staff, sampleX, sampleStep) {
    const gap = (staff.bottom - staff.top) / 4;
    const centerY = step => Math.round(staff.bottom - step * gap / 2);
    const sampleY = centerY(sampleStep), hits = [];
    const r = Math.max(3, Math.round(gap * .78));
    const h = Math.max(2, Math.round(gap * .58));
    const sx = Math.round(sampleX * width);
    if (sx < r || sx + r >= width || sampleY < h || sampleY + h >= height) return hits;
    const black = (x,y) => pixels[(y*width+x)*4] < 128;
    const line = y => {
      const pos = (y-staff.top)/gap;
      return pos > -.15 && pos < 4.15 && Math.abs(pos-Math.round(pos)) < .13;
    };
    for (let step = Math.min(-5,sampleStep); step <= Math.max(13,sampleStep); step++) {
      const y = centerY(step);
      if (y < h || y + h >= height) continue;
      const foreground = [], background = [];
      const stride = Math.max(1, Math.floor(gap / 9));
      for (let dy=-h; dy<=h; dy+=stride) {
        if (line(sampleY+dy) || line(y+dy)) continue;
        for (let dx=-r; dx<=r; dx+=stride) {
          (black(sx+dx,sampleY+dy) ? foreground : background).push(((y+dy)*width+dx)*4);
        }
      }
      if (foreground.length < 5 || background.length < 5) continue;
      for (let x=r; x<width-r; x++) {
        const base=x*4;
        let found=0;
        for (const offset of foreground) if (pixels[base+offset]<128) found++;
        if (found < foreground.length*.86) continue;
        let clear=0;
        for (const offset of background) if (pixels[base+offset]>=128) clear++;
        const score=(found/foreground.length+clear/background.length)/2;
        if (clear >= background.length*.8 && score >= .89) hits.push({ x:x/width, steps:step, score });
      }
    }
    const distinct=[];
    for (const hit of hits.sort((a,b)=>b.score-a.score)) {
      if (!distinct.some(n=>Math.abs(n.x-hit.x)*width < gap*.85 && Math.abs(n.steps-hit.steps)<2)) distinct.push(hit);
    }
    return distinct;
  }
  function showStaves(frame, paper, staves, width, height, index) {
    const firstIndex = Math.floor(Math.max(0, index) / 2) * 2;
    const rows = staves.slice(firstIndex, firstIndex + 2);
    frame.hidden = !rows.length;
    if (!rows.length) return { first: firstIndex, count: 0 };
    const first = rows[0], last = rows.at(-1);
    const outside = staves[firstIndex + rows.length];
    const previous = staves[firstIndex - 1];
    const gap = (first.bottom - first.top) / 4;
    // Keep space for lyrics, stems and chord labels between neighbouring rows.
    const top = Math.max(0, first.top - 5.5 * gap, previous ? (previous.bottom + first.top) / 2 : 0);
    const bottom = Math.min(height, last.bottom + 5 * gap, outside ? (outside.top + last.bottom) / 2 : height);
    const left = Math.max(0, Math.min(...rows.map(row => row.left)) - 3 * gap);
    const right = Math.min(width, Math.max(...rows.map(row => row.right)) + 3 * gap);
    frame.style.aspectRatio = (right - left) + ' / ' + Math.max(1, bottom - top);
    paper.style.width = width / (right - left) * 100 + '%';
    paper.style.transform = 'translate(' + (-left / width * 100) + '%, ' + (-top / height * 100) + '%)';
    return { first: firstIndex, count: rows.length };
  }

  globalThis.PianoPNG = { readPNG, readPixels, staffPitch, similarHeads, showStaves };
})();
