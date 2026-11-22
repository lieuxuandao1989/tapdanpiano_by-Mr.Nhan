(() => {
  'use strict';

  const { noteName, spelledName, groupNotes, importScore } = PianoMusic;
  const byId = id => document.getElementById(id);
  const ui = Object.fromEntries([
    'midi', 'import', 'file', 'library', 'drop', 'import-status', 'song-type', 'title', 'metadata',
    'practice', 'listen', 'cue-label', 'cue', 'hand', 'roll', 'lanes', 'notes', 'keyboard', 'feedback',
    'reset', 'previous', 'play', 'next', 'speed', 'speed-value', 'progress-track', 'progress', 'progress-label'
  ].map(id => [id, byId(id)]));
  const keyLanguage = byId('key-language');
  const libraryToggle = byId('library-toggle');
  function showLibraryPanel(show) {
    libraryToggle.setAttribute('aria-expanded', String(show));
    document.querySelector('.layout').classList.toggle('library-collapsed', !show);
  }
  libraryToggle.onclick = () => showLibraryPanel(libraryToggle.getAttribute('aria-expanded') !== 'true');
  byId('pdf-close').addEventListener('click', () => { if (!song) showLibraryPanel(true); });
  const pitchLabel = pitch => keyLanguage.value === 'vi' ? noteName(pitch) : PianoMusic.internationalName(pitch);
  const displayNote = note => spelledName(note, keyLanguage.value);
  try { keyLanguage.value = localStorage.getItem('piano-key-language') === 'vi' ? 'vi' : 'international'; } catch {}
  const songs = [];
  let song = null;
  let hand = 'both';
  let mode = 'practice';
  let groups = [], fingeredNotes = [];
  let loopA = 0, loopB = 0;
  const repeat = byId('loop-on');
  let step = 0;
  let position = 0;
  let playing = false, practicing = false, rhythm;
  const countSwitch = byId('count-in'), metronomeSwitch = byId('metronome-on');
  const rhythmButton = byId('practice-rhythm'), metronomeStatus = byId('metronome-status');
  const clicks = new Set();
  const timingSwitch = byId('timing-grade'), timingFeedback = byId('timing-feedback');
  const timingReview = byId('timing-review'), timingResults = byId('timing-results'), timingSummary = byId('timing-summary');
  const timingRows = new Map();
  const timingCounts = { early: 0, late: 0, short: 0, missed: 0 };
  let judge;
  let frame = 0;
  let playbackTime = 0;
  let playbackPosition = 0;
  let scheduled = 0;
  const speedPresets = [...byId('speed-presets').querySelectorAll('button')];
  const defaultSpeed = 60;
  let initialSpeed = defaultSpeed;
  try {
    const stored = Number(localStorage.getItem('piano-practice-speed'));
    if (stored >= 25 && stored <= 150 && stored % 5 === 0) initialSpeed = stored;
  } catch {}
  ui.speed.value = String(initialSpeed);
  let speed = initialSpeed / 100;
  let importSequence = 0;
  let audio;
  let master;
  let midiAccess;
  let keyboardStart;
  let keyboardEnd;
  let keyElements = new Map();
  let keyLayout = new Map();
  const matched = new Set();
  const inputs = new Map();
  const sampleVoices = new Set();
  let wrongPitch = null;
  let wrongTimer;
  let playbackRequest = 0;

  function element(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text) item.textContent = text;
    return item;
  }

  function showLibrary() {
    ui.library.replaceChildren(...songs.map(item => {
      const button = element('button', 'song');
      button.type = 'button';
      button.setAttribute('aria-current', String(item === song));
      const icon = element('span', 'song-icon', '♫');
      icon.setAttribute('aria-hidden', 'true');
      const details = element('div', 'song-text');
      details.append(element('strong', '', item.title), element('small', '', item.format));
      button.append(icon, details);
      button.addEventListener('click', () => loadSong(item));
      return button;
    }));
  }

  function announce(text) {
    if (ui.feedback.textContent !== text) ui.feedback.textContent = text;
  }

  function defaultFeedback() {
    if (!groups.length) return 'Hãy chọn tay khác để tiếp tục.';
    if (step >= groups.length) return 'Bạn đã hoàn thành bài.';
    if (mode === 'listen') return playing ? 'Đang phát bản mẫu.' : 'Nhấn Nghe mẫu để phát.';
    return 'Đánh các phím sáng để tiếp tục.';
  }

  function loadSong(item) {
    stopPlayback();
    clearTimingReport();
    song = item;
    fingeredNotes = PianoMusic.suggestFingering(item.notes);
    byId('practice-empty').hidden = true;
    byId('practice-workspace').hidden = false;
    if (item.pdfSource || item.imageURL) showSheet.checked = true;
    hand = 'both';
    mode = 'practice';
    ui.hand.value = hand;
    const labels = ['Hai tay', item.vocalPiano ? 'Ca và Đàn' : 'Tay phải', item.accompaniment ? 'Tay trái · Hợp âm' : 'Tay trái'];
    const choices = ['both', 'right', 'left'].map((side, i) => new Option(labels[i], side));
    if (item.vocalPiano && item.accompaniment) choices.push(new Option('Chỉ dòng Ca', 'vocal'), new Option('Chỉ dòng Đàn', 'instrumental'));
    ui.hand.replaceChildren(...choices);
    byId('legend-right').textContent = labels[1];
    byId('legend-left').textContent = labels[2];
    ui.title.textContent = song.title;
    ui['song-type'].textContent = song.format.toUpperCase();
    const minutes = Math.floor(song.duration / 60);
    const seconds = Math.floor(song.duration % 60).toString().padStart(2, '0');
    ui.metadata.textContent = [`${Math.round(song.bpm)} BPM`, `${minutes}:${seconds}`, `${song.notes.length} nốt`].join(' · ');
    showLibrary();
    rebuildGroups();
    if (item.pdfSource) pdfReader.restore(item);
    showLibraryPanel(false);
    if (libraryToggle.offsetWidth) window.scrollTo(0, 0);
  }

  function rebuildGroups() {
    groups = groupNotes(fingeredNotes, hand);
    loopA = 0; loopB = Math.max(0, groups.length - 1); repeat.checked = false;
    keyboardStart = undefined;
    seek(0);
  }

  function seek(index) {
    stopPlayback();
    step = Math.min(Math.max(0, index), groups.length);
    position = step === 0 ? 0 : groups[step]?.at ?? song.duration;
    matched.clear();
    wrongPitch = null;
    announce(defaultFeedback());
    render();
  }

  function switchMode(nextMode) {
    if (mode === nextMode) return;
    stopPlayback();
    mode = nextMode;
    matched.clear();
    if (mode === 'practice') position = groups[step]?.at ?? (step ? song.duration : 0);
    announce(defaultFeedback());
    render();
  }

  const blackKey = pitch => [1, 3, 6, 8, 10].includes(pitch % 12);
  const whiteKeys = Array.from({ length: 88 }, (_, i) => 21 + i).filter(pitch => !blackKey(pitch));
  function renderKeyboard() {
    const target = groups[step]?.notes || [];
    const preview = groups.slice(step, step + 8).flatMap(group => group.notes);
    if (keyboardStart !== undefined && target.every(note => note.pitch >= keyboardStart && note.pitch <= keyboardEnd)) return;
    const pitches = (target.length ? target : preview).map(note => note.pitch);
    const anchor = pitches.length ? Math.min(...pitches) : 60;
    const highest = pitches.length ? Math.max(...pitches) : 72;
    const candidates = preview.map(note => note.pitch);
    const below = Math.min(anchor, ...candidates);
    const octave = Math.floor(below / 12) * 12;
    const firstIndex = whiteKeys.findIndex(pitch => pitch >= octave);
    const anchorIndex = whiteKeys.findLastIndex(pitch => pitch <= anchor);
    const endIndex = whiteKeys.findIndex(pitch => pitch >= highest);
    const keyCount = ui.keyboard.clientWidth < 490 ? 9 : 15;
    const startIndex = Math.max(0, Math.min(Math.max(firstIndex, endIndex - keyCount + 1), anchorIndex, whiteKeys.length - keyCount));
    const available = whiteKeys.slice(startIndex, Math.max(startIndex + keyCount, endIndex + 1));
    keyboardStart = available[0];
    keyboardEnd = available.at(-1);
    keyElements = new Map();
    keyLayout = new Map();
    const keys = document.createDocumentFragment();
    const lanes = document.createDocumentFragment();
    const width = 100 / available.length;
    let whiteIndex = 0;
    for (let pitch = keyboardStart; pitch <= keyboardEnd; pitch++) {
      const black = blackKey(pitch);
      const span = black ? width * .63 : width;
      const left = whiteIndex * width - (black ? span / 2 : 0);
      if (!black) whiteIndex++;
      keyLayout.set(pitch, { left, width: span });
      const key = element('button', black ? 'key black' : 'key');
      key.type = 'button';
      const label = pitchLabel(pitch);
      key.title = label;
      key.setAttribute('aria-label', label);
      key.dataset.pitch = pitch;
      key.style.left = left + '%';
      key.style.width = span + '%';
      key.append(element('span', 'key-label', label), element('span', 'finger-badge'));
      key.lastElementChild.setAttribute('aria-hidden', 'true');
      keys.append(key);
      keyElements.set(pitch, key);
      const lane = element('div', black ? 'lane dark' : 'lane');
      lane.style.left = left + '%';
      lane.style.width = span + '%';
      lanes.append(lane);
    }
    ui.keyboard.replaceChildren(keys);
    ui.lanes.replaceChildren(lanes);
  }

  function paintKeys() {
    const targets = new Map((groups[step]?.notes || []).filter(note => !matched.has(note.pitch)).map(note => [note.pitch, note]));
    const inputPitches = new Set([...inputs.values()].map(input => input.pitch));
    const sounding = new Map();
    if (playing) {
      const now = audio.currentTime;
      for (const voice of sampleVoices) if (voice.start <= now && voice.end > now) sounding.set(voice.pitch, voice.hand);
    }
    for (const [pitch, key] of keyElements) {
      key.classList.toggle('target', targets.has(pitch));
      key.classList.toggle('sounding', inputPitches.has(pitch) || sounding.has(pitch));
      const target = targets.get(pitch);
      key.classList.toggle('left', (target?.hand || sounding.get(pitch)) === 'left');
      const finger = showFingering.checked && target?.finger;
      const badge = key.lastElementChild;
      const label = key.firstElementChild.textContent;
      const detail = finger ? fingerDescription(label, target) : label;
      if (badge.textContent !== String(finger || '')) badge.textContent = finger || '';
      if (key.title !== detail) {
        key.title = detail;
        key.setAttribute('aria-label', detail);
      }
      key.classList.toggle('wrong', wrongPitch === pitch);
    }
  }

  function renderRoll() {
    const view = document.createDocumentFragment();
    const height = ui.roll.clientHeight;
    const pixelsPerSecond = height / (5 * speed);
    const targetTime = playing || judge ? position : groups[step]?.at ?? position;
    let start = Math.max(0, step - 1);
    while (start > 0 && groups[start].at > targetTime - .4) start--;
    for (let index = start; index < groups.length; index++) {
      const group = groups[index];
      let bottom = (group.at - targetTime) * pixelsPerSecond;
      if (bottom > height) break;
      if (index === step) bottom = Math.max(0, bottom);
      for (const note of group.notes) {
        const layout = keyLayout.get(note.pitch);
        const size = Math.max(10, Math.min(height, note.duration * pixelsPerSecond - 4));
        if (!layout || bottom + size < 0) continue;
        const marker = element('div', `fall ${note.hand}${index === step ? ' current' : ''}`);
        marker.style.left = (layout.left + layout.width * .12) + '%';
        marker.style.width = (layout.width * .76) + '%';
        marker.style.bottom = bottom + 'px';
        marker.style.height = size + 'px';
        view.append(marker);
      }
    }
    ui.notes.replaceChildren(view);
  }

  const showSheet = byId('show-sheet');
  const showFingering = byId('show-fingering');
  try { showFingering.checked = localStorage.getItem('piano-show-fingering') !== 'off'; } catch {}
  showFingering.addEventListener('change', () => {
    try { localStorage.setItem('piano-show-fingering', showFingering.checked ? 'on' : 'off'); } catch {}
    render();
  });
  function fingerDescription(label, note) {
    return label + ' · ' + (note.hand === 'left' ? 'Tay trái' : 'Tay phải') + ' · ngón ' + note.finger;
  }
  const sheetView = byId('sheet-view');
  const image = byId('sheet-image');
  const imageFrame = byId('png-window');
  const previousImageStaves = byId('png-prev-staves'), nextImageStaves = byId('png-next-staves');
  let imageWindow = 0, currentImageStaff, currentImageX, imageBand, imageFingerView;
  const imageZoom = byId('png-zoom');
  imageZoom.onclick = () => {
    PianoPNG.toggleScoreZoom(imageFrame, imageZoom, currentImageX);
    paintImageFingering();
  };
  function paintImageFingering() {
    const overlay = byId('png-fingers');
    const paperWidth = image.parentElement.clientWidth;
    overlay.hidden = !showFingering.checked || !imageBand?.count || !paperWidth;
    if (overlay.hidden) return;
    if (imageFingerView?.song === song && imageFingerView.band === imageBand && imageFingerView.width === paperWidth) return;
    const { staves, width, height } = song.imageGeometry;
    const marks = fingeredNotes.flatMap(note => {
      const row = staves[note.staff];
      if (!row || note.staff < imageWindow || note.staff >= imageWindow + imageBand.count ||
        !Number.isFinite(note.x) || !Number.isFinite(note.steps) || !note.finger) return [];
      const gap = (row.bottom - row.top) / 4;
      return [{ note, box: [1, note.x, (row.bottom - note.steps * gap / 2) / height, gap / width, gap / height] }];
    });
    if (PianoPNG.fingerLabels(overlay, marks, imageBand, width, height)) {
      imageFingerView = { song, band: imageBand, width: paperWidth };
    }
  }
  function viewImageStaves(index) {
    const { staves, width, height } = song.imageGeometry;
    imageBand = PianoPNG.showStaves(imageFrame, image.parentElement, staves, width, height, index);
    const { first, count } = imageBand;
    if (imageWindow !== first) imageFrame.parentElement.scrollLeft = 0;
    imageWindow = first;
    imageZoom.hidden = !count;
    previousImageStaves.disabled = first === 0;
    nextImageStaves.disabled = first + count >= staves.length;
    byId('png-stave-range').textContent = count ? 'Khuông ' + (first + 1) + (count > 1 ? '–' + (first + count) : '') +
      ' / ' + staves.length : 'Chưa tìm thấy khuông';
    paintImageFingering();
  }
  previousImageStaves.onclick = () => viewImageStaves(imageWindow - 2);
  nextImageStaves.onclick = () => viewImageStaves(imageWindow + 2);
  try { showSheet.checked = localStorage.getItem('piano-show-sheet') === 'on'; } catch {}
  showSheet.addEventListener('change', () => {
    try { localStorage.setItem('piano-show-sheet', showSheet.checked ? 'on' : 'off'); } catch {}
    renderSheet();
    if (song?.pdfSource) pdfReader.sync(song, groups, step, mode === 'listen' ? position : undefined);
  });
  byId('sheet-reopen').onclick = () => pdfReader.restore(song);

  function renderSheet() {
    sheetView.hidden = !song || !showSheet.checked;
    const pdf = Boolean(song?.pdfSource);
    pdfReader.mount(song);
    byId('sheet-pdf-slot').hidden = !pdf;
    if (sheetView.hidden) return;
    byId('sheet-png').hidden = !song.imageURL;
    byId('sheet-notes').hidden = pdf || Boolean(song.imageURL);
    if (image.getAttribute('src') !== (song.imageURL || null)) {
      if (song.imageURL) {
        image.src = byId('png-original').href = song.imageURL;
        currentImageStaff = currentImageX = undefined;
        viewImageStaves(0);
      }
      else image.removeAttribute('src');
    }
    if (song.imageURL) {
      const note = groups[step]?.notes.find(note => Number.isInteger(note.staff));
      const staff = note?.staff;
      if (staff !== undefined && staff !== currentImageStaff) {
        currentImageStaff = staff;
        currentImageX = undefined;
        if (Math.floor(staff / 2) * 2 !== imageWindow) viewImageStaves(staff);
      }
      if (note && Math.floor(staff / 2) * 2 === imageWindow && note.x !== currentImageX) {
        currentImageX = note.x;
        PianoPNG.followScore(imageFrame, currentImageX);
      }
      paintImageFingering();
    }
    if (pdf || song.imageURL) return;
    const canvas = byId('sheet-staff');
    const page = Math.floor(Math.min(step, Math.max(0, groups.length - 1)) / 6) * 6;
    const visible = groups.slice(page, page + 6);
    const width = Math.max(240, sheetView.clientWidth);
    const spacing = Math.min(85, (width - 66) / 6);
    const degrees = [0,0,1,1,2,3,3,4,4,5,5,6];
    const staves = [];
    let height = 10;
    for (const side of ['right', 'left']) {
      const items = [];
      for (const [index, group] of visible.entries()) {
        for (const note of group.notes.filter(n => n.hand === side)) {
          const degree = note.spelling
            ? note.spelling.octave * 7 + 'CDEFGAB'.indexOf(note.spelling.step)
            : (Math.floor(note.pitch / 12) - 1) * 7 + degrees[note.pitch % 12];
          const bottom = song.vocalPiano || side === 'right' ? 30 : 18; // E4 or G2
          const accidental = note.spelling?.alter ?? Number(noteName(note.pitch).includes('♯'));
          items.push({ index, y: (bottom - degree) * 4, accidental,
            finger: showFingering.checked ? note.finger : undefined });
        }
      }
      if (!items.length) continue;
      const base = height + Math.max(32, ...items.map(n => -n.y)) + 12;
      height = base + Math.max(0, ...items.map(n => n.y)) + (showFingering.checked ? 21 : 16);
      staves.push({ side, base, items });
    }
    height = Math.max(height, 56);
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#34333c';
    ctx.font = '14px sans-serif';
    if (!visible.length) ctx.fillText('Không có nốt cho tay này.', 12, 32);
    const xFor = index => 54 + spacing * (index + .5);
    if (groups[step]) {
      ctx.fillStyle = '#d5edba';
      ctx.fillRect(xFor(step - page) - spacing * .4, 4, spacing * .8, height - 8);
    }
    function line(x, y, endX, endY) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY); ctx.stroke();
    }
    for (const { side, base, items } of staves) {
      ctx.strokeStyle = '#8d8b91';
      for (let row = 0; row < 5; row++) line(8, base - row * 8, width - 10, base - row * 8);
      ctx.fillStyle = '#24232a';
      ctx.font = '33px "Segoe UI Symbol", serif';
      const treble = song.vocalPiano || side === 'right';
      ctx.fillText(treble ? '𝄞' : '𝄢', 12, base - (treble ? 2 : 9));
      for (const n of items) {
        const x = xFor(n.index);
        const y = base + n.y;
        ctx.strokeStyle = '#47454c';
        for (let ledger = 8; ledger <= n.y; ledger += 8) line(x - 8, base + ledger, x + 8, base + ledger);
        for (let ledger = -40; ledger >= n.y; ledger -= 8) line(x - 8, base + ledger, x + 8, base + ledger);
        ctx.beginPath(); ctx.ellipse(x, y, 5.2, 3.5, -.3, 0, Math.PI * 2); ctx.fill();
        if (n.accidental) {
          ctx.font = '15px serif';
          ctx.fillText((n.accidental < 0 ? '♭' : '♯').repeat(Math.abs(n.accidental)), x - 17, y + 5);
        }
      }
      const digits = new Map();
      for (const note of items) {
        if (!note.finger) continue;
        if (!digits.has(note.index)) digits.set(note.index, []);
        digits.get(note.index).push(String(note.finger));
      }
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = side === 'left' ? '#593c94' : '#28583e';
      const baseline = base + Math.max(0, ...items.map(note => note.y)) + 16;
      for (const [index, fingers] of digits) ctx.fillText(fingers.join('·'), xFor(index), baseline, spacing - 4);
      ctx.textAlign = 'start';
    }
    canvas.setAttribute('aria-label', visible.length ? 'Khuông luyện tập, ' + visible.map((g, i) =>
      (page + i === step ? 'bước hiện tại ' : '') + g.notes.map(note => showFingering.checked && note.finger ? fingerDescription(displayNote(note), note) : displayNote(note)).join(' và ')).join(', ') : 'Không có nốt');
  }

  function render() {
    renderSheet();
    pdfReader.sync(song, groups, step, mode === 'listen' ? position : undefined);
    if (!song) return;
    byId('loop-range').textContent = groups.length ? 'Bước ' + (loopA + 1) + ' – ' + (loopB + 1) : '';
    renderKeyboard();
    paintKeys();
    renderRoll();
    ui.practice.setAttribute('aria-pressed', String(mode === 'practice'));
    ui.listen.setAttribute('aria-pressed', String(mode === 'listen'));
    ui['cue-label'].textContent = mode === 'practice' ? 'NỐT CẦN ĐÁNH' : 'NỐT TRONG BÀI MẪU';
    const current = groups[step];
    const chord = current?.notes.find(note => note.chord)?.chord;
    byId('practice-chord').hidden = !chord;
    byId('practice-chord').textContent = chord ? 'Hợp âm tay trái · ' + chord : '';
    if (current) {
      const pitches = new Map(current.notes.map(note => [note.hand + '/' + note.pitch, note]));
      ui.cue.replaceChildren(...[...pitches.values()].map(note => {
        const label = displayNote(note);
        const token = element('span', `cue-token ${note.hand}${matched.has(note.pitch) ? ' hit' : ''}`, label);
        if (showFingering.checked && note.finger) {
          token.title = fingerDescription(label, note);
          token.append(element('span', 'cue-finger', String(note.finger)));
        }
        return token;
      }));
    } else {
      ui.cue.textContent = groups.length ? 'Hoàn thành' : 'Không có nốt cho tay này';
    }
    ui.previous.disabled = step === 0;
    ui.next.disabled = step >= groups.length;
    ui.play.disabled = groups.length === 0;
    ui.play.textContent = playing ? 'Ⅱ Tạm dừng' : '▶ Nghe mẫu';
    rhythmButton.disabled = !groups.length;
    rhythmButton.setAttribute('aria-pressed', String(practicing));
    rhythmButton.textContent = practicing ? 'Dừng nhịp' : 'Tập theo nhịp';
    const rate = Math.round(speed * 100);
    ui['speed-value'].textContent = rate + '%';
    ui.speed.setAttribute('aria-valuetext', rate + '% · ' + Math.round(song.bpm * speed) + ' BPM');
    for (const button of speedPresets) button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === rate));
    ui.progress.style.width = (groups.length ? step / groups.length * 100 : 0) + '%';
    ui['progress-track'].setAttribute('aria-valuenow', String(step));
    ui['progress-track'].setAttribute('aria-valuemax', String(groups.length || 1));
    ui['progress-label'].textContent = `${step} / ${groups.length} bước${current?.notes[0].measure ? ` · Ô nhịp ${current.notes[0].measure}` : ''}`;
  }

  function prepareAudio() {
    if (!audio) {
      audio = new AudioContext();
      master = audio.createGain();
      master.gain.value = .62;
      const limiter = audio.createDynamicsCompressor();
      master.connect(limiter);
      limiter.connect(audio.destination);
    }
    return audio.state === 'running' ? Promise.resolve() : audio.resume();
  }

  function voiceFor(pitch, velocity, start, duration, side) {
    const frequency = 440 * 2 ** ((pitch - 69) / 12);
    const envelope = audio.createGain();
    envelope.connect(master);
    const level = Math.max(.025, velocity * .18);
    const decayEnd = start + Math.max(4, duration ?? 0);
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(level, start + .008);
    envelope.gain.exponentialRampToValueAtTime(level * .3, start + .23);
    envelope.gain.exponentialRampToValueAtTime(.0001, decayEnd);
    const harmonics = [[1, .74], [2, .19], [3.01, .05], [4.02, .02]];
    const sources = harmonics.map(([ratio, gain]) => {
      const source = audio.createOscillator();
      const partial = audio.createGain();
      source.frequency.value = frequency * ratio;
      partial.gain.value = gain;
      source.connect(partial).connect(envelope);
      source.start(start);
      source.stop(decayEnd + .1);
      return source;
    });
    const voice = { pitch, hand: side, start, end: start + (duration ?? 4), release };
    sources[0].onended = () => {
      envelope.disconnect();
      sampleVoices.delete(voice);
    };
    function release(when) {
      if (when <= start) {
        for (const source of sources) source.stop(when);
        return;
      }
      envelope.gain.cancelAndHoldAtTime(when);
      envelope.gain.exponentialRampToValueAtTime(.0001, when + .18);
      for (const source of sources) source.stop(when + .19);
    }
    if (duration !== undefined) release(start + Math.max(.025, duration));
    return voice;
  }

  function press(pitch, source, velocity = .7, timestamp = performance.now()) {
    if (inputs.has(source) || pitch < 21 || pitch > 108) return;
    const input = { pitch };
    inputs.set(source, input);
    try {
      prepareAudio().then(() => {
        if (inputs.get(source) === input) input.voice = voiceFor(pitch, velocity, audio.currentTime);
      }).catch(() => announce('Trình duyệt chưa cho phép phát âm thanh.'));
    } catch {
      announce('Trình duyệt này không phát được tiếng đàn.');
    }
    if (judge) {
      judge.press(pitch, source, inputClock(timestamp), false);
      paintKeys();
    } else acceptPitches([pitch]);
  }

  function acceptPitches(pitches) {
    const current = groups[step];
    if (mode !== 'practice' || !current || !pitches.length || countingIn()) {
      paintKeys();
      return;
    }
    const correct = pitches.filter(pitch => current.notes.some(note => note.pitch === pitch));
    if (!correct.length) {
      const pitch = pitches[0];
      wrongPitch = pitch;
      clearTimeout(wrongTimer);
      paintKeys();
      announce(`Bạn vừa đánh ${pitchLabel(pitch)}. Hãy thử phím đang sáng.`);
      wrongTimer = setTimeout(() => { wrongPitch = null; paintKeys(); }, 220);
      return;
    }
    wrongPitch = null;
    correct.forEach(pitch => matched.add(pitch));
    if (current.notes.every(note => matched.has(note.pitch))) {
      step++;
      if (repeat.checked && step > loopB) step = loopA;
      matched.clear();
      position = groups[step]?.at ?? song.duration;
      if (step === groups.length && practicing) stopPlayback();
      announce(step === groups.length ? 'Bạn đã hoàn thành bài!' : 'Đúng rồi. Tiếp tục với nốt đang sáng.');
    } else {
      announce('Đánh thêm các nốt còn sáng trong hợp âm.');
    }
    render();
  }

  function release(source, timestamp = performance.now(), measured = true) {
    const input = inputs.get(source);
    if (!input) return;
    if (judge) judge.release(source, inputClock(timestamp), measured);
    if (input.voice) input.voice.release(audio.currentTime);
    inputs.delete(source);
    paintKeys();
  }

  function metronomeClick(at, accent) {
    const click = audio.createOscillator();
    const envelope = audio.createGain();
    // Keep the click above the piano range to reduce microphone crosstalk.
    click.frequency.value = accent ? 6100 : 5100;
    click.connect(envelope).connect(master);
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(accent ? .15 : .095, at + .002);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + .024);
    click.start(at);
    click.stop(at + .027);
    clicks.add(click);
    click.onended = () => { clicks.delete(click); envelope.disconnect(); };
  }

  function metronomeGrid(at, countIn) {
    const grid = song.beats.length ? song.beats : [{ at: 0, period: 60 / song.bpm, number: 1, count: 4 }];
    const index = PianoMusic.beatIndex(grid, at);
    const anchor = grid[index];
    const last = grid.at(-1);
    const start = audio.currentTime + .06;
    const interval = anchor.period / speed;
    const count = countIn && countSwitch.checked ? anchor.count : 0;
    const ready = start + count * interval;
    let beat = grid[index].at + .000001 < at ? index + 1 : index;
    if (at > last.at + last.period) beat = grid.length - 1 + Math.ceil((at - last.at) / last.period - .000001);
    const preceding = count && at - anchor.at > .000001;
    return { grid, anchor, last, at, start, time: ready + (preceding ? (at - anchor.at) / speed : 0),
      ready, preceding, interval, count, nextCount: 0, beat };
  }

  function pulseAt(run, index) {
    if (index < run.grid.length) return run.grid[index];
    const offset = index - run.grid.length + 1;
    return { ...run.last, at: run.last.at + offset * run.last.period,
      number: 1 + (run.last.number - 1 + offset) % run.last.count };
  }

  function rhythmPosition(run, now) {
    return run.at + Math.max(0, now - run.time) * speed;
  }

  function rhythmStatus(text) {
    if (metronomeStatus.textContent !== text) metronomeStatus.textContent = text;
  }

  function scheduleMetronome(now, end = Infinity) {
    const run = rhythm;
    const horizon = now + .12;
    while (run.nextCount < run.count && run.start + run.nextCount * run.interval <= horizon) {
      const at = run.start + run.nextCount * run.interval;
      if (at >= now - .08) metronomeClick(Math.max(now, at), run.nextCount === 0);
      run.nextCount++;
    }
    if (run.preceding && run.ready <= horizon) {
      if (metronomeSwitch.checked && run.ready >= now - .08) metronomeClick(Math.max(now, run.ready), run.anchor.number === 1);
      run.preceding = false;
    }
    const position = rhythmPosition(run, now);
    const previous = PianoMusic.beatIndex(run.grid, position);
    const elapsed = Math.max(0, Math.floor((position - run.last.at) / run.last.period + .000001));
    const current = previous === run.grid.length - 1 ? previous + elapsed : previous;
    run.beat = Math.max(run.beat, current);
    for (let scheduledBeats = 0; scheduledBeats < 24; scheduledBeats++) {
      const beat = pulseAt(run, run.beat);
      const at = run.time + (beat.at - run.at) / speed;
      if (at > horizon || beat.at >= end) break;
      if (metronomeSwitch.checked && at >= now - .08) metronomeClick(Math.max(now, at), beat.number === 1);
      run.beat++;
    }
    if (run.count && now < run.ready) {
      const beat = Math.max(1, 1 + Math.floor((now - run.start) / run.interval));
      rhythmStatus('Đếm vào · ' + beat + ' / ' + run.count);
    } else if (now < run.time) rhythmStatus('Vào bài');
    else {
      const beat = pulseAt(run, current);
      rhythmStatus('Phách ' + beat.number + ' / ' + beat.count + ' · ' + Math.round(60 * speed / beat.period) + ' BPM');
    }
  }

  function clearTimingReport() {
    timingRows.clear();
    timingCounts.early = timingCounts.late = timingCounts.short = timingCounts.missed = 0;
    timingResults.replaceChildren();
    timingReview.hidden = true;
    timingFeedback.hidden = true;
  }

  function showTimingResult(result) {
    const { target } = result;
    const timing = { early: 'Sớm', late: 'Muộn', onTime: 'Đúng nhịp', missed: 'Bỏ sót' }[result.timing];
    const number = value => Math.round(value * 1000) + ' ms';
    const offset = result.timing === 'early' || result.timing === 'late' ? ' ' + number(Math.abs(result.offset)) : '';
    const lengths = {
      holding: 'Đang giữ',
      short: result.actual == null ? '' : 'Giữ ngắn ' + number(target.duration - result.actual),
      enough: 'Đủ trường độ',
      uncertain: 'Nốt quá ngắn để đo chắc qua micro',
      unfinished: 'Chưa đo hết trường độ',
    };
    const length = lengths[result.length];
    const measured = result.actual != null
      ? ' (' + (result.atLeast ? '≥' : '') + number(result.actual) + ' / ' + number(target.duration) + ')' : '';
    const place = target.note.measure ? 'Ô ' + target.note.measure + ' · ' : '';
    const text = place + 'Bước ' + (target.step + 1) + ' · ' + displayNote(target.note) + ' · ' + timing +
      offset + (length ? ' · ' + length + measured : '');
    let row = timingRows.get(target);
    if (!row) {
      row = element('li');
      timingRows.set(target, row);
      timingResults.prepend(row);
      if (result.timing !== 'onTime') timingCounts[result.timing]++;
    }
    if (result.length === 'short' && row.dataset.short !== 'true') {
      timingCounts.short++;
      row.dataset.short = 'true';
    }
    const issue = result.timing !== 'onTime' || result.length === 'short';
    row.textContent = text;
    row.dataset.issue = String(issue);
    timingFeedback.hidden = timingReview.hidden = false;
    timingFeedback.textContent = text;
    timingFeedback.dataset.issue = String(issue);
    timingSummary.textContent = timingRows.size + ' nốt · Sớm ' + timingCounts.early + ' · Muộn ' + timingCounts.late +
      ' · Ngắn ' + timingCounts.short + ' · Bỏ sót ' + timingCounts.missed;
  }

  function inputClock(timestamp = performance.now()) {
    const now = performance.now();
    const time = Number.isFinite(timestamp) && Math.abs(timestamp - now) < 2000 ? timestamp : now;
    const output = audio.getOutputTimestamp?.();
    if (output?.performanceTime > 0 && Math.abs(output.performanceTime - now) < 1000) {
      return output.contextTime + (time - output.performanceTime) / 1000;
    }
    return audio.currentTime + (time - now) / 1000;
  }

  function advanceTimedPractice(now) {
    position = rhythmPosition(rhythm, now);
    if (judge.advance(now)) {
      const looping = repeat.checked;
      seek(looping ? loopA : groups.length);
      if (looping) startPracticeRhythm(undefined, false, true);
      return false;
    }
    let next = step;
    while (next < rhythm.lastStep && groups[next + 1].at <= position) next++;
    if (next !== step) {
      step = next;
      render();
    } else renderRoll();
    return true;
  }

  async function startPracticeRhythm(at, withCount = true, keepReport = false) {
    if (!groups.length) return;
    switchMode('practice');
    if (step >= groups.length) seek(0);
    if (repeat.checked && (step < loopA || step > loopB)) seek(loopA);
    const request = ++playbackRequest;
    try {
      await prepareAudio();
    } catch {
      if (request === playbackRequest) announce('Trình duyệt chưa cho phép phát âm thanh.');
      return;
    }
    if (request !== playbackRequest) return;
    const start = timingSwitch.checked ? (step === 0 ? 0 : groups[step].at) : (at ?? position);
    position = start;
    rhythm = metronomeGrid(start, withCount);
    practicing = true;
    if (timingSwitch.checked) {
      if (!keepReport) clearTimingReport();
      const last = repeat.checked ? loopB : groups.length - 1;
      const end = repeat.checked ? (groups[last + 1]?.at ?? song.duration) : song.duration;
      rhythm.lastStep = last;
      judge = PianoMusic.createTimingJudge(groups, { first: step, last, at: rhythm.at, clockTime: rhythm.time,
        speed, beats: rhythm.grid, end, onResult: showTimingResult });
    }
    render();
    function tickPractice() {
      if (!practicing) return;
      const now = audio.currentTime;
      scheduleMetronome(now);
      if (judge && now >= rhythm.time && !advanceTimedPractice(now)) return;
      frame = requestAnimationFrame(tickPractice);
    }
    tickPractice();
  }

  function countingIn() {
    return practicing && audio.currentTime < rhythm.time;
  }

  function stopPlayback() {
    playbackRequest++;
    if (!playing && !practicing) return;
    if (judge) {
      judge.finish(inputClock());
      judge = undefined;
    }
    playing = practicing = false;
    rhythm = undefined;
    cancelAnimationFrame(frame);
    for (const click of clicks) click.stop();
    clicks.clear();
    rhythmStatus('');
    for (const voice of sampleVoices) {
      voice.release(audio.currentTime);
    }
    sampleVoices.clear();
  }

  function tick() {
    const now = audio.currentTime;
    position = rhythmPosition(rhythm, now);
    const last = repeat.checked ? loopB : groups.length - 1;
    const end = groups[last + 1]?.at ?? song.duration;
    scheduleMetronome(now, end);
    if (now + .12 < playbackTime) {
      frame = requestAnimationFrame(tick);
      return;
    }
    if (repeat.checked && position >= end) {
      seek(loopA); togglePlayback(false); return;
    }
    while (scheduled <= last && groups[scheduled].at <= position + .12 * speed) {
      const group = groups[scheduled++];
      for (const note of group.notes) {
        const noteEnd = note.start + note.duration;
        if (noteEnd <= playbackPosition) continue;
        const start = Math.max(now, playbackTime + (note.start - playbackPosition) / speed);
        const duration = (noteEnd - Math.max(note.start, playbackPosition)) / speed;
        sampleVoices.add(voiceFor(note.pitch, note.velocity ?? .7, start, duration, note.hand));
      }
    }
    let nextStep = step;
    while (nextStep < last && groups[nextStep + 1].at <= position) nextStep++;
    if (nextStep !== step) {
      step = nextStep;
      render();
    } else {
      if (song.pdfSource) pdfReader.sync(song, groups, step, position);
      paintKeys();
      renderRoll();
    }
    if (position >= song.duration) {
      seek(groups.length);
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  async function togglePlayback(withCount = true) {
    if (playing) {
      stopPlayback();
      announce('Đã tạm dừng bản mẫu.');
      render();
      return;
    }
    if (!groups.length) return;
    switchMode('listen');
    if (step >= groups.length) seek(0);
    if (repeat.checked && (step < loopA || step > loopB)) seek(loopA);
    const request = ++playbackRequest;
    try {
      await prepareAudio();
    } catch {
      if (request === playbackRequest) announce('Trình duyệt chưa cho phép phát âm thanh.');
      return;
    }
    if (request !== playbackRequest) return;
    rhythm = metronomeGrid(position, withCount);
    playbackTime = rhythm.time;
    playbackPosition = position;
    scheduled = step;
    playing = true;
    announce(defaultFeedback());
    render();
    tick();
  }

  async function loadFile(file) {
    if (!file) return;
    const sequence = ++importSequence;
    if (/\.pdf$/i.test(file.name)) {
      stopPlayback();
      render();
      await pdfReader.open(file);
      return;
    }
    pdfReader.close();
    ui['import-status'].hidden = false;
    ui['import-status'].classList.remove('error');
    ui['import-status'].textContent = 'Đang đọc bản nhạc…';
    try {
      const item = await importScore(file);
      if (sequence !== importSequence) return;
      if (item.format === 'PNG') item.imageURL = URL.createObjectURL(file);
      songs.push(item);
      loadSong(item);
      ui['import-status'].textContent = ['Đã nhập bản nhạc.', ...item.notices].join(' ');
    } catch (error) {
      if (sequence !== importSequence) return;
      ui['import-status'].classList.add('error');
      ui['import-status'].textContent = error.message || 'Không đọc được tệp này.';
    }
  }

  let preferredPort = '';
  let activePort = null;
  const portSelect = byId('midi-port');
  function wireMIDI() {
    const ports = [...midiAccess.inputs.values()].filter(port => port.state === 'connected');
    const port = ports.find(p => p.id === preferredPort) ||
      ports.find(p => /kurtzman|kurztman|\bks[ -]?1\b/i.test(p.name + ' ' + p.manufacturer)) || ports[0];
    byId('midi-picker').hidden = !ports.length;
    portSelect.replaceChildren(...ports.map(p => new Option(p.name || 'Cổng MIDI', p.id)));
    if (port) portSelect.value = port.id;
    const midiLabel = port ? 'MIDI đã kết nối' : 'Tìm đàn MIDI';
    ui.midi.querySelector('.header-full').textContent = midiLabel;
    ui.midi.setAttribute('aria-label', midiLabel);
    ui.midi.classList.toggle('connected', Boolean(port));
    if (activePort === port) return ports.length;
    if (activePort) {
      activePort.onmidimessage = null;
      for (const source of inputs.keys()) if (source.startsWith(`midi:${activePort.id}:`)) release(source, performance.now(), false);
    }
    activePort = port;
    byId('midi-signal').textContent = port ? 'Thử nhấn một phím đàn' : 'Chưa thấy cổng MIDI';
    if (port) {
      port.onmidimessage = event => {
        const [status, pitch, velocity] = event.data;
        const source = `midi:${port.id}:${status & 15}:${pitch}`;
        if ((status >> 4) === 9 && velocity > 0) {
          byId('midi-signal').textContent = 'Đã nhận ' + pitchLabel(pitch);
          press(pitch, source, velocity / 127, event.timeStamp);
        }
        else if ((status >> 4) === 8 || (status >> 4) === 9) release(source, event.timeStamp);
      };
    }
    return ports.length;
  }
  portSelect.addEventListener('change', () => {
    preferredPort = portSelect.value;
    wireMIDI();
  });

  ui.midi.addEventListener('click', async () => {
    if (!navigator.requestMIDIAccess) {
      announce('Trình duyệt này chưa hỗ trợ MIDI. Hãy thử Chrome hoặc Edge.');
      return;
    }
    try {
      midiAccess ||= await navigator.requestMIDIAccess();
      midiAccess.onstatechange = event => {
        if (event.port.state === 'disconnected') {
          for (const source of inputs.keys()) if (source.startsWith(`midi:${event.port.id}:`)) release(source, performance.now(), false);
        }
        wireMIDI();
      };
      announce(wireMIDI() ? 'Đã kết nối đàn MIDI.' : 'Hãy cắm đàn MIDI vào máy tính.');
    } catch {
      announce('Chưa có quyền truy cập MIDI. Hãy kiểm tra quyền của trình duyệt.');
    }
  });
  ui.import.addEventListener('click', () => ui.file.click());
  ui.drop.addEventListener('click', () => ui.file.click());
  ui.file.addEventListener('change', () => {
    loadFile(ui.file.files[0]);
    ui.file.value = '';
  });
  for (const event of ['dragenter', 'dragover']) {
    ui.drop.addEventListener(event, e => { e.preventDefault(); ui.drop.classList.add('dragging'); });
  }
  ui.drop.addEventListener('dragleave', () => ui.drop.classList.remove('dragging'));
  ui.drop.addEventListener('drop', event => {
    event.preventDefault();
    ui.drop.classList.remove('dragging');
    loadFile(event.dataTransfer.files[0]);
  });
  window.addEventListener('dragover', event => {
    if (event.dataTransfer.types.includes('Files')) event.preventDefault();
  });
  window.addEventListener('drop', event => {
    if (!event.defaultPrevented && event.dataTransfer.files.length) {
      event.preventDefault();
      loadFile(event.dataTransfer.files[0]);
    }
  });
  ui.practice.addEventListener('click', () => switchMode('practice'));
  ui.listen.addEventListener('click', () => switchMode('listen'));
  ui.hand.addEventListener('change', () => { hand = ui.hand.value; rebuildGroups(); });
  ui.reset.addEventListener('click', () => seek(0));
  ui.previous.addEventListener('click', () => seek(step - 1));
  ui.next.addEventListener('click', () => seek(step + 1));
  ui.play.addEventListener('click', () => togglePlayback());
  rhythmButton.addEventListener('click', () => {
    if (practicing) {
      stopPlayback();
      render();
    } else startPracticeRhythm();
  });
  function setSpeed(percent) {
    const wasPlaying = playing, wasPracticing = practicing, wasGrading = Boolean(judge);
    const wasCounting = rhythm && audio.currentTime < rhythm.time;
    const at = rhythm ? rhythmPosition(rhythm, audio.currentTime) : position;
    if (rhythm) stopPlayback();
    if (wasPlaying) position = at;
    speed = percent / 100;
    ui.speed.value = String(percent);
    try { localStorage.setItem('piano-practice-speed', String(percent)); } catch {}
    render();
    if (wasPlaying) togglePlayback(wasCounting);
    if (wasGrading) {
      position = groups[step]?.at ?? song.duration;
      announce('Đã đổi tốc độ. Bấm Tập theo nhịp để chấm lượt mới.');
    } else if (wasPracticing) startPracticeRhythm(at, wasCounting);
  }
  timingSwitch.addEventListener('change', () => {
    if (practicing) { stopPlayback(); render(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && judge) { stopPlayback(); render(); }
  });
  ui.speed.addEventListener('input', () => setSpeed(Number(ui.speed.value)));
  for (const button of speedPresets) button.addEventListener('click', () => setSpeed(Number(button.dataset.speed)));
  ui.keyboard.addEventListener('pointerdown', event => {
    const key = event.target.closest('.key');
    if (!key || event.button !== 0) return;
    event.preventDefault();
    ui.keyboard.setPointerCapture(event.pointerId);
    press(Number(key.dataset.pitch), `pointer:${event.pointerId}`, .7, event.timeStamp);
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    ui.keyboard.addEventListener(event, e => release(`pointer:${e.pointerId}`, e.timeStamp, e.type === 'pointerup'));
  }
  ui.keyboard.addEventListener('click', event => {
    const key = event.target.closest('.key');
    if (!key || event.detail !== 0) return;
    const source = `button:${key.dataset.pitch}`;
    press(Number(key.dataset.pitch), source);
    setTimeout(() => release(source), 180);
  });
  keyLanguage.addEventListener('change', () => {
    try { localStorage.setItem('piano-key-language', keyLanguage.value); } catch {}
    keyboardStart = undefined;
    render();
  });
  window.addEventListener('blur', () => {
    for (const source of inputs.keys()) if (!source.startsWith('midi:')) release(source, performance.now(), false);
  });
  window.addEventListener('resize', () => {
    if (!song) return;
    keyboardStart = undefined;
    renderKeyboard();
    paintKeys();
    renderRoll();
    renderSheet();
    pdfReader.paintFingering();
  });
  PianoAudioInput.connect({
    enabled: () => mode === 'practice' && !playing && (!countingIn() || judge && audio.currentTime >= rhythm.time - .44),
    onNotes: (pressed, released, events) => {
      for (const pitch of released) inputs.delete('audio-input:' + pitch);
      for (const pitch of pressed) inputs.set('audio-input:' + pitch, { pitch });
      if (judge) {
        for (const event of events) {
          const source = 'audio-input:' + event.pitch;
          const when = inputClock(event.at);
          if (event.pressed) judge.press(event.pitch, source, when, true);
          else judge.release(source, when, !event.cancelled);
        }
        paintKeys();
      } else acceptPitches(pressed);
    },
    name: pitchLabel
  });
  byId('loop-a').onclick = () => {
    loopA = Math.min(step, Math.max(0, groups.length - 1)); loopB = Math.max(loopA, loopB); render();
  };
  byId('loop-b').onclick = () => {
    loopB = Math.min(step, Math.max(0, groups.length - 1)); loopA = Math.min(loopA, loopB); render();
  };
  repeat.onchange = () => { if (repeat.checked && groups.length) seek(loopA); };
  const pdfReader = PianoPDF.connect(item => {
    songs.push(item);
    loadSong(item);
  }, () => { importSequence++; stopPlayback(); showLibraryPanel(false); render(); }, seek, () => showFingering.checked);
})();
