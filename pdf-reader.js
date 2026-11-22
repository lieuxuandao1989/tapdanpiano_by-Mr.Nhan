(() => {
  'use strict';
  let engine;
  function script(src) {
    return new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = src; tag.onload = resolve; tag.onerror = () => reject(Error('Thiếu thư viện đọc PDF.'));
      document.head.append(tag);
    });
  }
  function pdfEngine() {
    engine ||= Promise.all([script('vendor/pdf.js'), script('vendor/pdf.worker.js')]).then(async () => {
      const pdf = await import(globalThis.pdfModuleURL);
      pdf.GlobalWorkerOptions.workerSrc = globalThis.pdfWorkerURL;
      return pdf;
    }).catch(error => { engine = null; throw error; });
    return engine;
  }
  let offline, cursorData, chordData;

  function connect(addPractice, onOpen, jumpTo, showFingering) {
    const el = id => document.getElementById(id);
    const library = el('pdf-library'), reader = el('pdf-reader'), page = el('pdf-page');
    const staff = el('pdf-staff'), practice = el('pdf-practice'), help = el('pdf-help');
    const canvas = el('pdf-canvas'), original = el('pdf-original');
    const frame = el('pdf-scroll'), paper = canvas.parentElement;
    const zoom = el('pdf-zoom');
    let cursorX;
    zoom.onclick = () => {
      PianoPNG.toggleScoreZoom(frame, zoom, cursorX);
      paintFingering();
    };
    const staveNav = el('pdf-stave-nav'), staveRange = el('pdf-stave-range');
    const previousStaves = el('pdf-prev-staves'), nextStaves = el('pdf-next-staves');
    const actionGroup = el('pdf-action-group');
    const compact = matchMedia('(max-width: 530px), (orientation: landscape) and (max-height: 500px) and (max-width: 1000px)');
    const preview = el('pdf-preview-slot'), sheet = el('sheet-pdf-slot'), reopen = el('sheet-reopen');
    let choices = [], request = 0, draw = 0, task, doc, url, title, pixels, staves = [];
    let rendering;
    let staveWindow = -1, band, fingerView;
    const fingerCache = new WeakMap();
    let playbackPosition, displayedMarkers = '';
    let verified = false, activeSong, activeGroups = [], currentStep = 0;
    let fullScore = null;
    let sourceFile = null;
    const fullButton = el('pdf-score'), scoreStatus = el('pdf-score-status');
    const chordChoices = el('pdf-chord-choices'), variant = el('pdf-chord-variant');
    const edits = new Map();
    const key = el('pdf-key'), clef = el('pdf-clef'), tool = el('pdf-tool');
    for (let n = -7; n <= 7; n++) key.add(new Option(n ? Math.abs(n) + (n > 0 ? ' thăng' : ' giáng') : 'Không dấu', String(n)));
    key.value = '0';
    const checkedPage = () => verified && page.value === '1';
    const editId = i => page.value + '/' + i;
    function settings(i) {
      if (!edits.has(editId(i))) edits.set(editId(i), { bass: false, key: 0, notes: null });
      return edits.get(editId(i));
    }
    function notesOf(i) {
      const data = settings(i);
      if (!data.notes) {
        try { data.notes = PianoPNG.readPixels(pixels.data, pixels.width, pixels.height, { staff: i, ...data }); }
        catch (error) { if (!error.message.includes('đầu nốt đen')) throw error; data.notes = []; }
      }
      return data.notes;
    }
    function showSettings() {
      const data = settings(Number(staff.value));
      key.value = checkedPage() ? '3' : String(data.key);
      clef.value = !checkedPage() && data.bass ? 'bass' : 'treble';
      key.disabled = clef.disabled = checkedPage();
      el('pdf-edit-tools').hidden = checkedPage();
      tool.value = 'seek';
    }
    function updateSettings() {
      const data = settings(Number(staff.value));
      data.key = Number(key.value); data.bass = clef.value === 'bass';
      data.modified = true;
      for (const note of data.notes || []) {
        note.pitch = PianoPNG.staffPitch(note.steps, data.bass, data.key, note.accidental);
        note.hand = data.bass ? 'left' : 'right';
      }
      highlight();
    }
    key.onchange = clef.onchange = updateSettings;
    tool.onchange = highlight;
    function close() {
      sourceFile = null;
      fullScore = null; fullButton.disabled = true; scoreStatus.textContent = '';
      chordChoices.hidden = true; variant.value = 'main'; variant.onchange = null; variant.disabled = false;
      verified = false; edits.clear(); el('pdf-cursor').hidden = true;
      request++; draw++;
      rendering?.cancel(); rendering = null;
      task?.destroy().catch(() => {}); task = doc = null;
      if (url) URL.revokeObjectURL(url);
      url = null; pixels = null; staves = [];
      band = fingerView = undefined;
      el('pdf-fingers').hidden = true;
      reader.hidden = true; library.value = '';
      preview.append(reader);
      placeActions();
      reopen.hidden = false;
      original.removeAttribute('href');
    }
    function mount(song) {
      const showsOriginal = sourceFile && song?.pdfSource === sourceFile && !reader.hidden;
      const target = showsOriginal ? sheet : preview;
      reopen.hidden = Boolean(showsOriginal);
      if (reader.parentElement !== target) {
        target.append(reader);
        placeActions();
        highlight();
      }
    }
    function placeActions() {
      const target = el(compact.matches && reader.parentElement === sheet ? 'pdf-compact-actions' : 'pdf-quick');
      if (actionGroup.parentElement !== target) target.append(actionGroup);
    }
    compact.addEventListener('change', placeActions);
    function restore(song) {
      if (!song?.pdfSource) return;
      if (song.pdfSource === sourceFile) {
        if (doc && song.page && song.page !== page.value) {
          page.value = song.page;
          return renderPage();
        }
        return;
      }
      const { file, href, label } = song.pdfSource;
      return open(file, href, label, song);
    }
    function highlight() {
      if (!pixels) return;
      const ctx = canvas.getContext('2d');
      ctx.putImageData(pixels, 0, 0);
      if (reader.parentElement === sheet && tool.value === 'seek') return;
      const selected = staves[Number(staff.value)];
      if (!selected) return;
      const padding = (selected.bottom - selected.top) / 2;
      ctx.fillStyle = 'rgba(68,150,48,.13)';
      ctx.fillRect(0, selected.top - padding, canvas.width, selected.bottom - selected.top + 2 * padding);
      if (!checkedPage() && tool.value !== 'seek') {
        ctx.strokeStyle = '#3262bd'; ctx.lineWidth = 2;
        for (const n of notesOf(Number(staff.value))) {
          ctx.beginPath();
          ctx.arc(n.x * canvas.width, selected.bottom - n.steps * padding / 4, padding / 4, 0, 2 * Math.PI); ctx.stroke();
        }
      }
    }
    function paintFingering() {
      const overlay = el('pdf-fingers');
      const score = activeSong?.pdfSource === sourceFile ? activeSong : null;
      const groups = score ? activeGroups : null;
      const width = paper.clientWidth;
      overlay.hidden = !showFingering() || !band?.count || !width || (!score && !fullScore);
      if (overlay.hidden) return;
      if (fingerView?.band === band && fingerView.width === width &&
        fingerView.groups === groups && fingerView.fullScore === fullScore) return;
      const pageNumber = Number(page.value);
      const marks = [];
      function addNotes(item, notes) {
        for (const note of notes) {
          if (!note.finger) continue;
          const box = boxFor(note, item);
          if (box?.[0] === pageNumber) marks.push({ note, box });
          for (const continuation of note.cursorMarks || []) {
            const box = continuation.box || (continuation.note && boxFor(continuation.note, item));
            if (box?.[0] === pageNumber) marks.push({ note, box });
          }
        }
      }
      if (fullScore) {
        if (!fingerCache.has(fullScore)) fingerCache.set(fullScore, PianoMusic.suggestFingering(fullScore.notes));
        addNotes(fullScore, fingerCache.get(fullScore));
      }
      if (score) addNotes(score, groups.flatMap(group => group.notes));
      if (PianoPNG.fingerLabels(overlay, marks, band, canvas.width, canvas.height)) {
        fingerView = { band, groups, fullScore, width };
      }
    }

    function viewStaves(index) {
      if (!pixels) return;
      band = PianoPNG.showStaves(frame, paper, staves, canvas.width, canvas.height, index);
      const { first, count } = band;
      if (staveWindow !== first) frame.parentElement.scrollLeft = 0;
      staveWindow = first;
      el('pdf-no-staves').hidden = Boolean(count);
      staveNav.hidden = !count;
      previousStaves.disabled = first === 0;
      nextStaves.disabled = first + count >= staves.length;
      staveRange.textContent = 'Khuông ' + (first + 1) + (count > 1 ? '–' + (first + count) : '') + ' / ' + staves.length;
      paintFingering();
    }
    function moveStaves(index) {
      cursorX = undefined;
      staff.value = String(index);
      showSettings();
      viewStaves(index);
      highlight();
    }
    previousStaves.onclick = () => moveStaves(staveWindow - 2);
    nextStaves.onclick = () => moveStaves(staveWindow + 2);
    function boxFor(note, song, position) {
      const continuation = position == null ? null : note.cursorMarks?.findLast(mark => mark.at <= position);
      if (continuation?.box) return continuation.box;
      if (continuation?.note) return boxFor(continuation.note, song);
      if (note.scoreBox) return note.scoreBox;
      const line = staves[note.staff];
      if (!line || song.page !== page.value || !Number.isFinite(note.x)) return null;
      const height = line.bottom - line.top;
      const step = note.steps;
      const y = Number.isFinite(step) ? line.bottom - step * height / 8 : (line.top + line.bottom) / 2;
      return [Number(page.value), note.x, y / canvas.height, height / 3 / canvas.width,
        (Number.isFinite(step) ? height / 3 : height * 1.5) / canvas.height];
    }
    function sync(song, groups, step, position, follow = true) {
      const advanced = activeSong !== song || currentStep !== step;
      activeSong = song; activeGroups = groups; currentStep = step;
      playbackPosition = position;
      paintFingering();
      const cursor = el('pdf-cursor');
      if (reader.hidden || !doc || !song || song.pdfSource !== sourceFile) { cursor.hidden = true; return; }
      const notes = groups[step]?.notes || [];
      const marks = notes.map(note => ({ note, box: boxFor(note, song, position) })).filter(mark => mark.box);
      const boxes = marks.map(mark => mark.box);
      const nextPage = boxes.length ? String(Math.max(...boxes.map(box => box[0]))) : song.page;
      if (follow && nextPage && nextPage !== page.value && Number(nextPage) <= doc.numPages) {
        page.value = nextPage;
        renderPage(true);
        return;
      }
      const visible = marks.filter(({ box }) => box[0] === Number(page.value));
      cursor.hidden = !pixels || !visible.length;
      if (cursor.hidden) { cursorX = undefined; return; }
      cursorX = visible[0].box[1];
      const markerKey = visible.map(({ box }) => box.join(',')).join(';');
      const changed = displayedMarkers !== markerKey;
      if (follow && (changed || advanced) && staves.length && tool.value === 'seek') {
        const y = visible[0].box[2] * canvas.height;
        let index = 0, nearest = Infinity;
        for (const [i, row] of staves.entries()) {
          const distance = Math.abs(y - (row.top + row.bottom) / 2);
          if (distance < nearest) { nearest = distance; index = i; }
        }
        if (Math.floor(index / 2) * 2 !== staveWindow) {
          viewStaves(index);
          staff.value = String(index);
          showSettings();
          if (reader.parentElement !== sheet) highlight();
        }
      }
      if (follow && (changed || advanced)) PianoPNG.followScore(frame, cursorX);
      if (changed) {
        displayedMarkers = markerKey;
        PianoPNG.scoreMarkers(cursor, visible);
      }
    }
    async function renderPage(followCursor = false) {
      const version = ++draw;
      rendering?.cancel(); rendering = null;
      pixels = null; staves = []; practice.disabled = true; staff.replaceChildren();
      displayedMarkers = '';
      cursorX = undefined;
      staveWindow = -1; band = undefined; staveNav.hidden = true; frame.hidden = true;
      el('pdf-fingers').hidden = true;
      el('pdf-no-staves').hidden = true;
      el('pdf-full').disabled = true; el('pdf-cursor').hidden = true;
      canvas.hidden = true; help.textContent = 'Đang đọc trang…';
      try {
        const sheet = await doc.getPage(Number(page.value));
        if (version !== draw) return;
        const base = sheet.getViewport({ scale: 1 });
        const viewport = sheet.getViewport({ scale: Math.min(1920 / base.width, 2720 / base.height) });
        const buffer = document.createElement('canvas');
        buffer.width = Math.ceil(viewport.width); buffer.height = Math.ceil(viewport.height);
        const ctx = buffer.getContext('2d', { willReadFrequently: true });
        rendering = sheet.render({ canvasContext: ctx, canvas: buffer, viewport, background: '#ffffff' });
        await rendering.promise;
        if (version !== draw) return;
        rendering = null;
        pixels = ctx.getImageData(0, 0, buffer.width, buffer.height);
        staves = PianoPNG.readPixels(pixels.data, pixels.width, pixels.height, { list: true });
        staff.replaceChildren(...staves.map((_, i) => new Option(String(i + 1), String(i))));
        canvas.width = buffer.width; canvas.height = buffer.height; canvas.hidden = false;
        showSettings();
        viewStaves(0);
        highlight();
        practice.disabled = !staves.length;
        el('pdf-full').disabled = !staves.length;
        if (activeSong) sync(activeSong, activeGroups, currentStep, playbackPosition, followCursor);
        help.textContent = checkedPage() ? 'Bản đã đối chiếu · 2/4 · 63 BPM · 3 dấu thăng. Chọn Tập cả trang để chơi theo dấu lặp và hai kết bài.' : staves.length ? 'Chọn khóa và hóa biểu cho từng khuông. Chế độ sửa khoanh các nốt nhận được; chạm để sửa trước khi tạo bài tập. Trường độ mặc định là một phách.' :
          'Có thể đọc trang gốc. Ứng dụng chưa tìm thấy khuông để tạo bài tập trên trang này.';
        sheet.cleanup();
      } catch (error) {
        if (version === draw) help.textContent = 'Không đọc được trang. Bạn có thể mở PDF gốc. ' + error.message;
      }
    }
    async function open(file, href, label, existingSong) {
      const selected = library.value;
      close();
      if (existingSong?.chordVariant) variant.value = existingSong.chordVariant;
      sourceFile = existingSong?.pdfSource || { file, href, label };
      if (!existingSong) onOpen();
      if (href || choices.some(c => c.file === file)) library.value = selected;
      const token = request;
      title = (file?.name || label).replace(/\.pdf$/i, '');
      el('pdf-title').textContent = title;
      url = file ? URL.createObjectURL(file) : null;
      original.href = url || href;
      reader.hidden = false; canvas.hidden = true; page.replaceChildren(); staff.replaceChildren();
      practice.disabled = true; help.textContent = 'Đang mở PDF…';
      if (existingSong) mount(existingSong);
      else reader.scrollIntoView({ block: 'start' });
      try {
        const pdf = await pdfEngine();
        if (token !== request) return;
        const source = file ? { data: await file.arrayBuffer() } : { url: href };
        if (token !== request) return;
        task = pdf.getDocument({ ...source, isEvalSupported: false, useSystemFonts: true });
        const loaded = await task.promise;
        if (token !== request) return;
        doc = loaded;

        let hash;
        if (globalThis.crypto?.subtle) {
          const digest = await crypto.subtle.digest('SHA-256', await doc.getData());
          if (token !== request) return;
          hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        } else if (href) {
          const response = await fetch(href, { method: 'HEAD' });
          if (token !== request) return;
          const fingerprint = response.headers.get('X-Score-Hash');
          if (response.ok && /^[a-f0-9]{64}$/.test(fingerprint || '')) hash = fingerprint;
        }
        verified = hash === MuaXuan.hash;
        loadFullScore(hash, token);
        if (token !== request) return;
        page.replaceChildren(...Array.from({ length: doc.numPages }, (_, i) => new Option((i + 1) + ' / ' + doc.numPages, String(i + 1))));
        if (existingSong?.page) page.value = existingSong.page;
        await renderPage();
        if (token === request && existingSong === activeSong) sync(activeSong, activeGroups, currentStep, playbackPosition);
      } catch (error) {
        if (token === request) help.textContent = 'Không mở được bản xem trước. Hãy thử “Mở PDF gốc”. ' + error.message;
      }
    }
    async function loadFullScore(hash, token) {
      try {
        if (verified) {
          fullScore = PianoMusic.finalize({ title, format: 'PDF', ...MuaXuan.notesFor() });
          fullScore.page = '1';
          scoreStatus.textContent = 'Có bản tập đã đối chiếu với PDF.';
        } else {
          let buffers;
          const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0)).buffer;
          if (hash && /^https?:$/.test(location.protocol)) {
            scoreStatus.textContent = 'Đang tìm bản MusicXML…';
            const response = await fetch('/sheet-score/' + hash);
            if (response.ok) buffers = response.headers.get('Content-Type')?.split(';')[0] === 'application/json'
              ? (await response.json()).map(decode) : [await response.arrayBuffer()];
            else if (response.status !== 404) throw Error('Máy chủ chưa tải được MusicXML.');
          } else if (hash) {
            offline ||= script('Sheet Scores/offline.js').catch(() => { offline = null; });
            await offline;
            const encoded = globalThis.PianoOfflineScores?.[hash];
            if (encoded) buffers = [encoded].flat().map(decode);
          }
          if (token !== request) return;
          if (!buffers?.length) { scoreStatus.textContent = 'PDF này chưa có bản MusicXML.'; return; }
          cursorData ||= script(/^https?:$/.test(location.protocol) ? '/score-cursors.js' : 'Sheet Scores/cursors.js')
            .catch(() => { cursorData = null; });
          chordData ||= script(/^https?:$/.test(location.protocol) ? '/chord-symbols.js' : 'Sheet Scores/chord-symbols.js')
            .catch(() => { chordData = null; });
          await Promise.all([cursorData, chordData]);
          if (token !== request) return;
          const positions = globalThis.PianoScoreCursors?.[hash];
          const reviewed = globalThis.PianoReviewedChords?.[hash];
          async function selectVariant() {
            fullScore = null; fullButton.disabled = true; variant.disabled = true;
            try {
              const useUpper = variant.value === 'alternate' && Boolean(reviewed?.alternate);
              const scoreTitle = reviewed?.alternate
                ? title + ' · Hợp âm ' + (useUpper ? 'dòng trên' : 'dòng dưới') : title;
              let score = await PianoMusic.importRecognizedPDF(buffers, scoreTitle, positions,
                useUpper ? { ...reviewed, movements: reviewed.alternate } : reviewed);
              if (token !== request) return;
              if (!score.hasBassClef && reviewed === undefined) score = await PianoPDFChords.apply(score, doc);
              if (token !== request) return;
              fullScore = { ...score, pdfSource: sourceFile,
                ...(reviewed?.alternate && { chordVariant: variant.value }) };
              fullButton.disabled = false;
              paintFingering();
              scoreStatus.textContent = ['MusicXML · ' + score.notes.length + ' nốt.',
                ...(score.accompaniment ? ['Tay trái đệm theo ký hiệu hợp âm trên PDF.'] : []), ...score.notices].join(' ');
            } catch (error) {
              if (token === request) scoreStatus.textContent = 'Không mở được bản tập đầy đủ. ' + error.message;
            } finally {
              if (token === request) variant.disabled = false;
            }
          }
          chordChoices.hidden = !reviewed?.alternate;
          variant.onchange = selectVariant;
          await selectVariant();
          return;
        }
        fullScore.pdfSource = sourceFile;
        paintFingering();
        fullButton.disabled = false;
      } catch (error) {
        if (token === request) scoreStatus.textContent = 'Không mở được bản tập đầy đủ. ' + error.message;
      }
    }
    fullButton.addEventListener('click', () => { if (fullScore) addPractice(fullScore); });
    function list(items) {
      choices = items;
      library.replaceChildren(new Option('Chọn bản PDF…', ''), ...items.map((item, i) => new Option(item.name, String(i))));
      el('pdf-status').textContent = items.length + ' bản PDF trong thư mục.';
    }
    library.addEventListener('change', () => {
      if (!library.value) return;
      const item = choices[Number(library.value)];
      open(item.file, item.href, item.name);
    });
    el('choose-folder').addEventListener('click', () => el('pdf-folder').click());
    let chosenFolder = false;
    el('pdf-folder').addEventListener('change', event => {
      chosenFolder = true;
      const files = Array.from(event.target.files).filter(f => /\.pdf$/i.test(f.name));
      list(files.sort((a,b) => a.name.localeCompare(b.name, 'vi')).map(file => ({ file, name: file.name })));
      event.target.value = '';
    });
    if (/^https?:$/.test(location.protocol)) {
      fetch('/sheet-library').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(names => {
        if (!chosenFolder) list(names.map(name => ({ name, href: '/sheet-library/' + encodeURIComponent(name) })));
      }).catch(() => { if (!chosenFolder) el('pdf-status').textContent = 'Chọn thư mục Sheet Music trên máy.'; });
    } else el('pdf-status').textContent = 'Chọn thư mục Sheet Music trên máy để xem danh sách.';
    page.addEventListener('change', () => renderPage());
    staff.addEventListener('change', () => moveStaves(Number(staff.value)));
    canvas.addEventListener('click', e => {
      if (!staves.length) return;
      const bounds = canvas.getBoundingClientRect();
      const y = (e.clientY - bounds.top) * canvas.height / bounds.height;
      let nearest = 0;
      const distance = s => Math.abs(y - (s.top + s.bottom) / 2);
      staves.forEach((s, i) => { if (distance(s) < distance(staves[nearest])) nearest = i; });
      const x = (e.clientX - bounds.left) / bounds.width, s = staves[nearest];
      const same = nearest === Number(staff.value);
      staff.value = String(nearest);
      if (!same) showSettings();
      if (tool.value !== 'seek' && !checkedPage()) {
        const data = settings(nearest), notes = notesOf(nearest), gap = (s.bottom - s.top) / 4;
        data.modified = true;
        const steps = Math.round((s.bottom - y) / (gap / 2));
        const nearby = notes.filter(n => Math.abs(n.x - x) * canvas.width < gap && Math.abs(n.steps - steps) <= 3)
          .sort((a,b) => Math.hypot((a.x-x)*canvas.width,(a.steps-steps)*gap/2) - Math.hypot((b.x-x)*canvas.width,(b.steps-steps)*gap/2))[0];
        if (tool.value === 'match') {
          const hits = PianoPNG.similarHeads(pixels.data, pixels.width, pixels.height, s, x, steps);
          let added = 0;
          for (const hit of hits) {
            if (notes.some(n => n.steps === hit.steps && Math.abs(n.x-hit.x)*canvas.width < gap)) continue;
            notes.push({ ...hit, duration: 1, staff: nearest, hand: data.bass ? 'left' : 'right',
              pitch: PianoPNG.staffPitch(hit.steps, data.bass, data.key) });
            added++;
          }
          help.textContent = 'Đã thêm ' + added + ' đầu nốt tương tự trên khuông. Hãy kiểm tra các vòng xanh trước khi tập.';
          highlight(); return;
        } else if (tool.value === 'delete') { if (nearby) notes.splice(notes.indexOf(nearby), 1); }
        else {
          const alter = el('pdf-alter').value, accidental = alter === '' ? undefined : Number(alter);
          const pitch = PianoPNG.staffPitch(steps, data.bass, data.key, accidental);
          if (pitch >= 21 && pitch <= 108) {
            const item = { x, steps, pitch, accidental, staff: nearest, duration: Number(el('pdf-duration').value), hand: data.bass ? 'left' : 'right' };
            if (tool.value === 'add') notes.push(item);
            else if (nearby) Object.assign(nearby, item);
            else { help.textContent = 'Hãy chạm gần vòng xanh hiện có, hoặc chọn Thêm nốt.'; return; }
          }
        }
        help.textContent = 'Đã cập nhật bản nháp. Bấm Tập khuông này hoặc Tập cả trang để dùng các nốt đã sửa.';
      } else if (activeSong?.pdfSource === sourceFile) {
        let best = Infinity, index = -1;
        activeGroups.forEach((g, i) => {
          for (const n of g.notes) {
            const positions = [boxFor(n, activeSong), ...(n.cursorMarks || [])
              .map(mark => mark.box || (mark.note && boxFor(mark.note, activeSong)))];
            for (const at of positions) if (at && at[0] === Number(page.value)) {
              const dist = Math.hypot((at[1] - x) * canvas.width, at[2] * canvas.height - y);
              if (dist < best || dist === best && Math.abs(i-currentStep) < Math.abs(index-currentStep)) { best = dist; index = i; }
            }
          }
        });
        if (index >= 0) jumpTo(index);
      }
      highlight();
    });
    function accompaniedSection(selected, full) {
      if (!fullScore?.accompaniment || (full ? [...staves.keys()] : [selected]).some(i => settings(i).modified)) return null;
      const row = staves[selected];
      const gap = (row.bottom - row.top) / 4;
      const inSection = box => box?.[0] === Number(page.value) &&
        (full || (box[2] * canvas.height >= row.top - gap * 4 && box[2] * canvas.height <= row.bottom + gap * 2));
      const events = [...fullScore.anchors, ...fullScore.notes.flatMap(note => [
        note, ...(note.cursorMarks || []).map(mark => ({ start: mark.at, scoreBox: mark.box })),
      ])].filter(event => event.scoreBox);
      const selection = events.filter(event => inSection(event.scoreBox)).sort((a,b) => a.start-b.start);
      if (!selection.length) return null;
      const start = selection[0].start;
      const last = selection.at(-1).start;
      const end = events.reduce((earliest, event) => event.start > last && !inSection(event.scoreBox)
        ? Math.min(event.start, earliest) : earliest, fullScore.duration);
      if (end <= start) return null;
      const notes = fullScore.notes.filter(note => note.start < end && note.start + note.duration > start).map(note => {
        const onset = Math.max(start, note.start);
        const scoreBox = inSection(note.scoreBox) ? note.scoreBox :
          note.cursorMarks?.find(mark => inSection(mark.box))?.box ?? selection[0].scoreBox;
        return { ...note, scoreBox, start: onset - start, duration: Math.min(end, note.start + note.duration) - onset,
          cursorMarks: note.cursorMarks?.filter(mark => mark.at >= start && mark.at < end && inSection(mark.box))
            .map(mark => ({ ...mark, at: mark.at - start })) };
      });
      const beginning = PianoMusic.beatIndex(fullScore.beats, start);
      const beats = fullScore.beats.slice(beginning).filter(beat => beat.at < end)
        .map(beat => ({ ...beat, at: beat.at - start }));
      return { ...fullScore, notes, beats, duration: end - start };
    }
    async function startPractice(full) {
      if (!pixels || !staves.length) return;
      try {
        const selected = Number(staff.value);
        const scope = title + ' · Trang ' + page.value + (full ? '' : ' · Khuông ' + (selected + 1));
        const extracted = accompaniedSection(selected, full);
        if (extracted) {
          addPractice({ ...extracted, title: scope, page: page.value });
          return;
        }
        const skipped = [];
        let data;
        if (checkedPage()) data = MuaXuan.notesFor(full ? null : selected);
        else {
          const notes = [];
          let beat = 0;
          for (const i of full ? staves.keys() : [selected]) {
            const raw = notesOf(i).slice().sort((a,b) => a.x - b.x);
            if (!raw.length) skipped.push(i + 1);
            let onset = -Infinity, duration = 0;
            const gap = (staves[i].bottom - staves[i].top) / 4;
            for (const n of raw) {
              if ((n.x-onset)*canvas.width > gap*.65) { beat += duration; onset = n.x; duration = 0; }
              notes.push({ ...n, start: beat });
              duration = Math.max(duration, n.duration);
            }
            beat += duration;
          }
          data = { notes, tempos: [{at: 0, bpm: 80}] };
        }
        if (!data.notes.length) throw Error('Chưa có nốt. Chọn “Thêm nốt” và chạm các đầu nốt trên khuông.');
        let score = PianoMusic.finalize({ title: scope,
          format: 'PDF', ...data });
        if (!checkedPage() && !fullScore?.hasBassClef &&
          !(full ? staves.some((_, i) => settings(i).bass) : settings(selected).bass)) {
          const pageNumber = Number(page.value), documentToken = request, pageToken = draw;
          const rows = (full ? staves : [staves[selected]]).map(line => ({ left: 0, right: 1,
            top: line.top / canvas.height, bottom: line.bottom / canvas.height, gap: (line.bottom - line.top) / (canvas.height * 4) }));
          score.notes.forEach(note => {
            const line = staves[note.staff], gap = (line.bottom - line.top) / 4;
            note.scoreBox = [pageNumber, note.x, (line.bottom - note.steps * gap / 2) / canvas.height,
              gap / canvas.width, gap / canvas.height];
          });
          score = await PianoPDFChords.apply(score, doc, [{ page: pageNumber, rows }]);
          if (documentToken !== request || pageToken !== draw) return;
        }
        score.pdfSource = sourceFile; score.page = page.value;
        tool.value = 'seek'; highlight();
        addPractice(score);
        help.textContent = 'Chạm một nốt trên trang để tập từ đó.' + (skipped.length ? ' Chưa đọc được khuông ' + skipped.join(', ') + '.' : '');
      } catch (error) { help.textContent = error.message; }
    }
    practice.addEventListener('click', () => startPractice(false));
    el('pdf-full').addEventListener('click', () => startPractice(true));
    el('pdf-close').addEventListener('click', close);
    return { open, close, sync, mount, restore, paintFingering };
  }
  globalThis.PianoPDF = { connect };
})();
