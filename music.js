(() => {
  'use strict';

  const pitchNames = ['Đô', 'Đô♯', 'Rê', 'Rê♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
  const pitchSteps = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const fileLimit = 20 * 1024 * 1024;
  const noteName = pitch => pitchNames[pitch % 12] + (Math.floor(pitch / 12) - 1);
  const letterNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const internationalName = pitch => letterNames[pitch % 12] + (Math.floor(pitch / 12) - 1);
  const diatonicNames = { C: 'Đô', D: 'Rê', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
  const spelledName = (note, language = 'vi') => {
    if (!note.spelling) return (language === 'vi' ? noteName : internationalName)(note.pitch);
    const { step, alter, octave } = note.spelling;
    return (language === 'vi' ? diatonicNames[step] : step) + (alter < 0 ? '♭' : '♯').repeat(Math.abs(alter)) + octave;
  };
  const guessHand = pitch => pitch < 60 ? 'left' : 'right';
  const isPianoKey = pitch => Number.isInteger(pitch) && pitch >= 21 && pitch <= 108;
  const direct = (node, name) => Array.from(node?.children || []).filter(child => child.localName === name);
  const child = (node, name) => direct(node, name)[0];
  const value = (node, name) => child(node, name)?.textContent.trim() || '';
  const number = (node, name, fallback = 0) => Number(value(node, name) || fallback);

  const chordKinds = {
    '': [0,4,7], m:[0,3,7], min:[0,3,7], M:[0,4,7], maj:[0,4,7],
    dim:[0,3,6], dim4:[0,3,5,6], '°':[0,3,6], aug:[0,4,8], '+':[0,4,8], sus:[0,5,7], sus2:[0,2,7], sus4:[0,5,7],
    '5':[0,7], '6':[0,4,7,9], m6:[0,3,7,9], '6/9':[0,4,7,9,14], '69':[0,4,7,9,14],
    '7':[0,4,7,10], maj7:[0,4,7,11], M7:[0,4,7,11], m7:[0,3,7,10], min7:[0,3,7,10],
    mMaj7:[0,3,7,11], dim7:[0,3,6,9], '°7':[0,3,6,9], m7b5:[0,3,6,10], 'ø':[0,3,6,10], 'ø7':[0,3,6,10],
    '7sus':[0,5,7,10], '7sus4':[0,5,7,10], '7sus2':[0,2,7,10], sus7:[0,5,7,10],
    add9:[0,4,7,14], madd9:[0,3,7,14], add2:[0,2,4,7], add4:[0,4,5,7], add11:[0,4,7,17],
    '9':[0,4,7,10,14], maj9:[0,4,7,11,14], M9:[0,4,7,11,14], m9:[0,3,7,10,14],
    '11':[0,4,7,10,14,17], maj11:[0,4,7,11,14,17], m11:[0,3,7,10,14,17],
    '13':[0,4,7,10,14,17,21], maj13:[0,4,7,11,14,17,21], m13:[0,3,7,10,14,17,21],
    '7+':[0,4,8,10], aug7:[0,4,8,10], '7aug':[0,4,8,10],
  };
  const degreeSemitones = { 5:7, 9:14, 11:17, 13:21 };
  const accidentalValue = sign => sign === '#' ? 1 : sign === 'b' ? -1 : 0;
  function readChord(symbol) {
    const label = symbol.trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/𝄪/g, '##').replace(/∆|Δ/g, 'maj')
      .replace(/[()]/g, '').replace(/−/g, '-').replace(/^([A-G][#b]?)-/, '$1m').replace(/\s/g, '');
    if (/^N\.?C\.?$/i.test(label)) return { label: 'N.C.', pitches: [] };
    const match = /^([A-G])([#b]?)(.*?)(?:\/([A-G])([#b]?))?$/.exec(label);
    if (!match) return null;
    let [, root, rootSign, suffix, bass, bassSign] = match;
    const alterations = [...suffix.matchAll(/([#b])(5|9|11|13)/g)];
    if (suffix !== 'm7b5') suffix = suffix.replace(/[#b](5|9|11|13)/g, '');
    if (!Object.hasOwn(chordKinds, suffix)) return null;
    const intervals = new Set(chordKinds[suffix]);
    for (const [, sign, degree] of alterations) {
      const natural = degreeSemitones[degree];
      intervals.delete(natural);
      intervals.add(natural + accidentalValue(sign));
    }
    const rootPitch = 48 + pitchSteps[root] + accidentalValue(rootSign);
    const lowest = 36 + pitchSteps[bass || root] + accidentalValue(bass ? bassSign : rootSign);
    const chord = [...intervals].map(interval => rootPitch + interval);
    if (bass) {
      const duplicate = chord.findIndex(pitch => (pitch - lowest) % 12 === 0);
      if (duplicate !== -1) chord.splice(duplicate, 1);
      chord.unshift(lowest);
    }
    return { label, pitches: chord.sort((a,b) => a-b), bass: lowest };
  }
  const xmlKinds = {
    major:'', minor:'m', augmented:'aug', diminished:'dim', dominant:'7', 'major-seventh':'maj7',
    'minor-seventh':'m7', 'diminished-seventh':'dim7', 'augmented-seventh':'aug7', 'half-diminished':'m7b5',
    'major-minor':'mMaj7', 'major-sixth':'6', 'minor-sixth':'m6', 'dominant-ninth':'9',
    'major-ninth':'maj9', 'minor-ninth':'m9', 'dominant-11th':'11', 'major-11th':'maj11', 'minor-11th':'m11',
    'dominant-13th':'13', 'major-13th':'maj13', 'minor-13th':'m13',
    'suspended-second':'sus2', 'suspended-fourth':'sus4', power:'5',
  };
  const signFor = amount => amount === 1 ? '#' : amount === -1 ? 'b' : '';
  function harmonyChord(harmony) {
    const root = child(harmony, 'root'), bass = child(harmony, 'bass');
    const kind = value(harmony, 'kind'), suffix = xmlKinds[kind];
    if (kind === 'none') return readChord('N.C.');
    if (suffix === undefined) return null;
    const rootLabel = value(root, 'root-step') + signFor(number(root, 'root-alter'));
    const bassLabel = value(bass, 'bass-step') + signFor(number(bass, 'bass-alter'));
    const chord = readChord(rootLabel + suffix + (bassLabel ? '/' + bassLabel : ''));
    if (!chord) return null;
    const rootPitch = 48 + pitchSteps[value(root, 'root-step')] + number(root, 'root-alter');
    for (const degree of direct(harmony, 'degree')) {
      const n = number(degree, 'degree-value');
      if (!Number.isInteger(n) || n < 1 || n > 13) continue;
      const interval = [0,2,4,5,7,9,11][(n - 1) % 7] + 12 * Math.floor((n - 1) / 7);
      const operation = value(degree, 'degree-type');
      if (operation !== 'add') chord.pitches = chord.pitches.filter(pitch => pitch !== rootPitch + interval);
      if (operation !== 'subtract') chord.pitches.push(rootPitch + interval + number(degree, 'degree-alter'));
    }
    chord.pitches = [...new Set(chord.pitches)].sort((a,b) => a-b);
    return chord;
  }

  function withAccompaniment(score, changes) {
    if (score.hasBassClef || score.accompaniment || !actualChords(changes)) return score;
    const latest = new Map(changes.filter(c => c.at >= 0 && c.at < score.duration).map(c => [c.at.toFixed(5), c]));
    const ordered = [...latest.values()].sort((a,b) => a.at-b.at);
    const chordNotes = ordered.flatMap((chord, i) => {
      const end = ordered[i + 1]?.at ?? score.duration;
      const lowest = (chord.bass ?? chord.pitches[0] - 12) + 12;
      const offsets = [...new Set(chord.pitches.map(pitch => (pitch - lowest + 120) % 12))];
      const top = lowest + Math.max(0, ...offsets);
      return offsets.map(offset => ({ pitch: lowest + offset - (top > 60 ? 12 : 0), start: chord.at, duration: end - chord.at,
        hand: 'left', chord: chord.label, scoreBox: chord.scoreBox, measure: chord.measure }));
    }).filter(note => note.duration > 0 && isPianoKey(note.pitch));
    if (!chordNotes.length) return score;
    return { ...score, accompaniment: true,
      notes: [...score.notes.map(n => ({ ...n, originalHand: n.hand, hand: 'right' })), ...chordNotes].sort((a,b) => a.start-b.start || a.pitch-b.pitch) };
  }
  const actualChords = changes => changes?.some(chord => chord.pitches.length);

  function buildBeats(meters, units, end, time) {
    const changes = new Map([[0, { at: 0, count: 4, denominator: 4 }]]);
    for (const meter of meters) {
      if (Number.isInteger(meter.count) && meter.count >= 1 && meter.count <= 32 &&
        [1, 2, 4, 8, 16, 32, 64].includes(meter.denominator)) changes.set(meter.at, meter);
    }
    const sections = [...changes.values()].sort((a, b) => a.at - b.at);
    const beats = [];
    for (const [index, meter] of sections.entries()) {
      const compound = meter.denominator >= 8 && meter.count >= 6 && meter.count % 3 === 0 ? 3 : 1;
      const count = meter.count / compound;
      const stride = units * 4 / meter.denominator * compound;
      const limit = Math.min(sections[index + 1]?.at ?? end, end);
      for (let i = 0; meter.at + i * stride < limit - .000001 && beats.length < 200000; i++) {
        const raw = meter.at + i * stride;
        const at = time(raw);
        const period = time(raw + stride) - at;
        if (period > 0) beats.push({ at, period, number: 1 + i % count, count });
      }
    }
    return beats;
  }

  function beatIndex(beats, at) {
    let low = 0, high = beats.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (beats[mid].at <= at + .000001) low = mid + 1;
      else high = mid;
    }
    return Math.max(0, low - 1);
  }

  function finalize({ title, format, notes, tempos = [], meters = [], units = 1, end = 0, notices = [], harmonies = [], anchors = [] }) {
    notes = notes.filter(note => isPianoKey(note.pitch) && Number.isFinite(note.start) && note.start >= 0 &&
      Number.isFinite(note.duration) && note.duration > 0).sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    if (!notes.length) throw Error('Bản nhạc không có nốt nằm trong phạm vi 88 phím piano.');
    if (notes.length > 100000) throw Error('Bản nhạc có quá nhiều nốt để mở trong trình duyệt.');
    const timeline = [{ at: 0, bpm: 120, seconds: 0 }];
    for (const tempo of tempos.sort((a, b) => a.at - b.at)) {
      if (tempo.bpm <= 0 || !Number.isFinite(tempo.bpm) || !Number.isFinite(tempo.at) || tempo.at < 0) continue;
      const last = timeline.at(-1);
      const seconds = last.seconds + (tempo.at - last.at) * 60 / (units * last.bpm);
      if (tempo.at === last.at) last.bpm = tempo.bpm;
      else timeline.push({ ...tempo, seconds });
    }
    function time(at) {
      let low = 0;
      let high = timeline.length;
      while (low + 1 < high) {
        const mid = (low + high) >>> 1;
        if (timeline[mid].at <= at) low = mid;
        else high = mid;
      }
      const tempo = timeline[low];
      return tempo.seconds + (at - tempo.at) * 60 / (units * tempo.bpm);
    }
    const result = notes.map(note => {
      const start = time(note.start);
      return { ...note, start, duration: time(note.start + note.duration) - start,
        ...(note.cursorMarks && { cursorMarks: note.cursorMarks.map(mark => ({ ...mark, at: time(mark.at) })) }) };
    });
    const duration = result.reduce((latest, note) => Math.max(latest, note.start + note.duration), time(end));
    const rawEnd = notes.reduce((latest, note) => Math.max(latest, note.start + note.duration), end);
    const beats = buildBeats(meters, units, rawEnd, time);
    return { title, format, notes: result, duration, bpm: timeline[0].bpm, beats, notices,
      ...(harmonies.length && { harmonies: harmonies.map(chord => ({ ...chord, at: time(chord.at) })) }),
      ...(anchors.length && { anchors: anchors.map(anchor => ({ ...anchor, start: time(anchor.start) })) }) };
  }

  function createTimingJudge(groups, { first, last, at, clockTime, speed, beats, end, onResult }) {
    const targets = [];
    const pitches = new Map();
    const held = new Map();
    const toClock = seconds => clockTime + (seconds - at) / speed;
    for (let step = first; step <= last; step++) {
      const distinct = new Map();
      for (const note of groups[step].notes) {
        if (!distinct.has(note.pitch) || distinct.get(note.pitch).duration < note.duration) distinct.set(note.pitch, note);
      }
      for (const note of distinct.values()) {
        const beat = beats[beatIndex(beats, note.start)];
        const target = { note, step, due: toClock(note.start), duration: note.duration / speed,
          period: (beat?.period || .5) / speed };
        targets.push(target);
        if (!pitches.has(note.pitch)) pitches.set(note.pitch, []);
        pitches.get(note.pitch).push(target);
      }
    }
    targets.sort((a, b) => a.due - b.due);
    const endTime = targets.reduce((latest, target) => Math.max(latest, target.due + target.duration), toClock(end)) + .8;
    let cursor = 0;

    function release(source, when, measured = true) {
      const result = held.get(source);
      if (!result) return;
      held.delete(source);
      const actual = Math.max(0, when - result.attack);
      const { duration } = result.target;
      const tolerance = Math.min(duration * .45, Math.max(duration * .15, result.microphone ? .15 : .065));
      if (result.microphone && duration < .20) {
        result.length = 'uncertain';
      } else if (!measured && actual < duration - tolerance) {
        result.length = 'unfinished';
      } else {
        result.length = actual < duration - tolerance ? 'short' : 'enough';
        result.actual = actual;
        result.atLeast = !measured;
      }
      onResult(result);
    }

    function press(pitch, source, when, microphone) {
      release(source, when);
      const row = pitches.get(pitch);
      if (!row) return;
      let index = row.firstPending || 0;
      while (index < row.length && row[index].result) index++;
      row.firstPending = index;
      let target;
      for (let i = index; i < row.length && row[i].due <= when + .42; i++) {
        const candidate = row[i];
        if (candidate.result || candidate.due < when - .50) continue;
        if (!target || Math.abs(candidate.due - when) < Math.abs(target.due - when)) target = candidate;
      }
      if (!target) return;
      const offset = when - target.due;
      const tolerance = microphone ? Math.max(.13, Math.min(.22, target.period * .22)) :
        Math.max(.065, Math.min(.14, target.period * .15));
      const result = { target, attack: when, microphone, offset, length: 'holding',
        timing: offset < -tolerance ? 'early' : offset > tolerance ? 'late' : 'onTime' };
      target.result = result;
      held.set(source, result);
      onResult(result);
    }

    function advance(now) {
      while (cursor < targets.length && targets[cursor].due + .78 <= now) {
        const target = targets[cursor++];
        if (!target.result) {
          target.result = { target, timing: 'missed' };
          onResult(target.result);
        }
      }
      return now >= endTime;
    }

    function finish(now) {
      for (const [source, result] of held) release(source, now - (result.microphone ? .2 : 0), false);
    }

    return { press, release, advance, finish };
  }

  function groupNotes(notes, hand) {
    const groups = [];
    for (const note of notes) {
      if (hand === 'vocal' || hand === 'instrumental') {
        if (note.originalHand !== (hand === 'vocal' ? 'right' : 'left')) continue;
      } else if (hand !== 'both' && note.hand !== hand) continue;
      const last = groups.at(-1);
      if (last && note.start - last.at < 0.00001) last.notes.push(note);
      else groups.push({ at: note.start, notes: [note] });
    }
    return groups;
  }

  const fingerPositions = [0, 0, 2.2, 4, 5.8, 8];
  const blackKey = pitch => [1, 3, 6, 8, 10].includes(pitch % 12);

  function fingeringChoices(notes, direction) {
    const choices = [];
    function visit(fingers, first) {
      const index = fingers.length;
      if (index === notes.length) {
        const positions = notes.map((note, i) => note.pitch * direction - fingerPositions[fingers[i]]);
        const center = positions.reduce((sum, x) => sum + x, 0) / positions.length;
        let cost = positions.reduce((sum, x) => sum + (x - center) ** 2 * .21, 0);
        for (const [i, note] of notes.entries()) {
          const finger = fingers[i];
          if (finger === 1 && blackKey(note.pitch)) cost += 1.2;
          if (notes.length === 1) cost += Math.abs(3 - finger) * .06;
        }
        choices.push({ fingers, center, cost });
        return;
      }
      const fixed = notes[index].writtenFinger;
      for (let finger = first; finger <= 5 - (notes.length - index - 1); finger++) {
        if (!fixed || finger === fixed) visit([...fingers, finger], finger + 1);
      }
    }
    const span = Math.abs(notes.at(-1).pitch - notes[0].pitch);
    if (notes.length <= 5 && span <= 12) visit([], 1);
    return choices;
  }

  function fingerTransition(previous, current, from, to, direction) {
    const delay = to.at - from.at;
    let cost = Math.abs(previous.center - current.center) * (delay > .8 ? .23 : .52);
    if (from.notes.length !== 1 || to.notes.length !== 1) return cost;
    const difference = (to.notes[0].pitch - from.notes[0].pitch) * direction;
    const oldFinger = previous.fingers[0], newFinger = current.fingers[0];
    if (difference === 0) return cost + (oldFinger === newFinger ? 0 : 1.1);
    if (oldFinger === newFinger) return cost + (delay > .8 ? .8 : 2);
    if (Math.sign(difference) === Math.sign(newFinger - oldFinger)) return cost;
    const thumbPass = difference > 0 ? newFinger === 1 : oldFinger === 1;
    if (thumbPass && Math.abs(difference) <= 4) return cost * .36 + .85 + (Math.max(oldFinger, newFinger) > 3 ? .7 : 0);
    return cost + (delay > .8 ? 1 : 3.3);
  }

  function suggestFingering(notes) {
    const suggestions = new Map();
    for (const [hand, direction] of [['right', 1], ['left', -1]]) {
      let line = [];
      function finish() {
        if (!line.length) return;
        let choice = line.at(-1).choices.reduce((best, item) => item.total < best.total ? item : best);
        for (let index = line.length - 1; index >= 0; index--) {
          const row = line[index];
          row.notes.forEach((note, i) => row.pitches.get(note.pitch)
            .forEach(original => suggestions.set(original, choice.fingers[i])));
          choice = choice.previous;
        }
        line = [];
      }
      for (const group of groupNotes(notes, hand)) {
        const pitches = new Map();
        for (const note of group.notes) {
          if (!pitches.has(note.pitch)) pitches.set(note.pitch, []);
          pitches.get(note.pitch).push(note);
        }
        const distinct = [...pitches.values()].map(unison => unison.find(note => note.writtenFinger) || unison[0])
          .sort((a, b) => direction * (a.pitch - b.pitch));
        const choices = fingeringChoices(distinct, direction);
        const last = line.at(-1);
        if (!choices.length || (last && group.at - last.at > 2)) finish();
        if (!choices.length) continue;
        const from = line.at(-1);
        const row = { at: group.at, pitches, notes: distinct, choices };
        for (const choice of choices) {
          choice.total = choice.cost;
          if (!from) continue;
          let best = Infinity;
          for (const prior of from.choices) {
            const cost = prior.total + fingerTransition(prior, choice, from, row, direction);
            if (cost < best) { best = cost; choice.previous = prior; }
          }
          choice.total += best;
        }
        line.push(row);
      }
      finish();
    }
    return notes.map(note => {
      const finger = note.writtenFinger || suggestions.get(note);
      return finger ? { ...note, finger } : note;
    });
  }

  function writtenFingering(note) {
    const fingers = direct(note, 'notations').flatMap(section => direct(section, 'technical'))
      .flatMap(technical => direct(technical, 'fingering'))
      .filter(finger => /^[1-5]$/.test(finger.textContent.trim()) && finger.getAttribute('substitution') !== 'yes');
    const finger = fingers.find(item => item.getAttribute('alternate') !== 'yes') || fingers[0];
    return finger ? Number(finger.textContent.trim()) : undefined;
  }

  function xmlDocument(source) {
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    if (doc.getElementsByTagNameNS('*', 'parsererror').length) throw Error('Tệp XML không hợp lệ.');
    return doc.documentElement;
  }

  function parseXML(source, fallback, format = 'MusicXML', allParts = false, positions, reviewedChords, pianoPart, bpm) {
    const root = xmlDocument(source);
    if (!['score-partwise', 'score-timewise'].includes(root.localName)) throw Error('Tệp này không chứa bản nhạc MusicXML.');
    const parts = direct(child(root, 'part-list'), 'score-part');
    const pianoParts = parts.filter(part => {
      const description = [value(part, 'part-name'), ...direct(part, 'score-instrument').map(item => value(item, 'instrument-name'))].join(' ');
      return /piano|klavier|pianoforte/i.test(description) ||
        direct(part, 'midi-instrument').some(item => number(item, 'midi-program', 100) <= 8);
    });
    const selected = (pianoPart !== undefined ? parts.slice(pianoPart, pianoPart + 1) :
      allParts ? parts : pianoParts.length ? pianoParts : parts.slice(0, 1)).map(part => part.getAttribute('id'));
    const measures = root.localName === 'score-partwise'
      ? direct(root, 'part').filter((part, index) => selected.length ? selected.includes(part.getAttribute('id')) : index === 0)
          .map(part => direct(part, 'measure'))
      : (selected.length ? selected : [direct(child(root, 'measure'), 'part')[0]?.getAttribute('id')])
        .map(id => direct(root, 'measure').map(measure => direct(measure, 'part').find(part => part.getAttribute('id') === id)));
    const notes = [];
    const tempos = bpm ? [{ at: 0, bpm }] : [];
    const meters = [];
    let meter = { count: 4, denominator: 4 };
    const harmonies = [];
    const printed = new Map();
    for (const [measure, beat, label, scoreBox] of reviewedChords ?? []) {
      const chord = readChord(label);
      if (!chord) throw Error('Ký hiệu hợp âm chưa được hỗ trợ: ' + label);
      if (!printed.has(measure)) printed.set(measure, []);
      printed.get(measure).push({ ...chord, beat, measure, scoreBox });
    }
    const anchors = [];
    const notices = [];
    let playedGrace = false;
    let end = 0;
    if (root.getElementsByTagNameNS('*', 'repeat').length || root.getElementsByTagNameNS('*', 'ending').length) {
      notices.push('Bài tập đi theo thứ tự ô nhịp trong tệp và bỏ qua ký hiệu lặp.');
    }
    if (pianoPart !== undefined) notices.push('Đang luyện khuông Piano ghi trên PDF.');
    else if (parts.length > selected.length) notices.push('Đang luyện phần piano hoặc khuông nhạc đầu tiên.');
    for (const [partIndex, part] of measures.entries()) {
      let divisions = 1;
      let position = 0;
      const multipleStaves = part.some(measure => direct(measure, 'attributes').some(item => number(item, 'staves') > 1) ||
        direct(measure, 'note').some(item => number(item, 'staff') > 1));
      const ties = new Map();
      const graceNotes = new Map();
      for (const [measureIndex, measure] of part.entries()) {
        if (partIndex === 0) {
          const time = direct(measure, 'attributes').map(item => child(item, 'time')).find(Boolean);
          if (time) {
            const counts = value(time, 'beats').split('+').map(Number);
            const count = counts.reduce((sum, item) => sum + item, 0);
            const denominator = number(time, 'beat-type');
            if (count > 0 && denominator > 0) meter = { count, denominator };
          }
          meters.push({ at: position, ...meter });
          for (const { beat, ...chord } of printed.get(measureIndex + 1) ?? []) {
            harmonies.push({ ...chord, at: position + beat });
          }
        }
        let cursor = position;
        let furthest = position;
        let previousStart = position;
        let graceOffset = 0;
        let noteIndex = 0;
        for (const item of measure?.children || []) {
          const duration = number(item, 'duration') / divisions;
          switch (item.localName) {
            case 'attributes': {
              const nextDivisions = number(item, 'divisions', divisions);
              if (nextDivisions > 0) divisions = nextDivisions;
              break;
            }
            case 'backup':
              cursor = Math.max(position, cursor - duration);
              break;
            case 'forward':
              cursor += duration;
              break;
            case 'harmony': {
              const chord = reviewedChords === undefined ? harmonyChord(item) : null;
              if (chord) harmonies.push({ ...chord, at: Math.max(position, cursor + number(item, 'offset') / divisions), measure: measureIndex + 1 });
              break;
            }
            case 'direction':
            case 'sound': {
              const sound = item.localName === 'sound' ? item : child(item, 'sound');
              const metronome = child(child(item, 'direction-type'), 'metronome');
              const beat = { whole: 4, half: 2, quarter: 1, eighth: .5, '16th': .25 }[value(metronome, 'beat-unit')] || 1;
              const dotted = 2 - 2 ** -direct(metronome, 'beat-unit-dot').length;
              const bpm = Number(sound?.getAttribute('tempo')) || number(metronome, 'per-minute') * beat * dotted;
              if (bpm > 0) tempos.push({ at: Math.max(0, cursor + number(item, 'offset') / divisions), bpm });
              break;
            }
            case 'note': {
              const scoreBox = positions?.[pianoPart ?? partIndex]?.[measureIndex]?.[noteIndex];
              noteIndex++;
              const pitchNode = child(item, 'pitch');
              const octave = number(pitchNode, 'octave', NaN);
              const step = value(pitchNode, 'step');
              const alter = number(pitchNode, 'alter');
              const pitch = (octave + 1) * 12 + pitchSteps[step] + alter;
              const staff = number(item, 'staff', 1);
              const voice = value(item, 'voice');
              const hand = multipleStaves ? (staff === 1 ? 'right' : 'left') : guessHand(pitch);
              const spelling = { step, alter, octave };
              const writtenFinger = writtenFingering(item);
              const graceKey = staff + '/' + voice;
              if (child(item, 'grace')) {
                if (scoreBox !== false && isPianoKey(pitch)) {
                  const pending = graceNotes.get(graceKey) || [];
                  pending.push({ pitch, hand, measure: measureIndex + 1, spelling, scoreBox, writtenFinger });
                  graceNotes.set(graceKey, pending);
                }
                break;
              }
              const isChord = Boolean(child(item, 'chord'));
              const start = isChord ? previousStart : cursor;
              if (!isChord) {
                previousStart = start;
                graceOffset = 0;
                if (Number.isFinite(duration)) cursor += duration;
              }
              if (scoreBox && child(item, 'rest')) anchors.push({ scoreBox, start, measure: measureIndex + 1 });
              if (scoreBox === false || !isPianoKey(pitch) || !Number.isFinite(duration) || duration <= 0) break;
              const pending = graceNotes.get(graceKey);
              if (pending?.length && !isChord) {
                graceOffset = Math.min(.25, duration / 3);
                const length = graceOffset / pending.length;
                pending.forEach((ornament, index) => notes.push({ ...ornament, start: start + length * index, duration: length }));
                graceNotes.delete(graceKey);
                playedGrace = true;
              }
              const offset = Math.min(graceOffset, duration / 2);
              const note = { pitch, start: start + offset, duration: duration - offset, hand, measure: measureIndex + 1,
                spelling, scoreBox, writtenFinger };
              const tieKey = [staff, voice, pitch].join('/');
              const types = [...direct(item, 'tie'), ...direct(child(item, 'notations'), 'tied')]
                .map(tie => tie.getAttribute('type'));
              const previous = types.some(type => type === 'stop' || type === 'continue') ? ties.get(tieKey) : null;
              if (previous) {
                previous.duration = Math.max(previous.duration, start + duration - previous.start);
                if (scoreBox) (previous.cursorMarks ||= []).push({ at: note.start, box: scoreBox });
              }
              else notes.push(note);
              if (types.some(type => type === 'start' || type === 'continue')) ties.set(tieKey, previous || note);
              else ties.delete(tieKey);
              furthest = Math.max(furthest, start + duration);
              break;
            }
          }
          furthest = Math.max(furthest, cursor);
        }
        position = furthest;
      }
      end = Math.max(end, position);
    }
    if (playedGrace) notices.push('Nốt hoa mỹ dùng thời lượng ngắn ước tính.');
    const title = value(child(root, 'work'), 'work-title') || value(root, 'movement-title') || fallback;
    const hasBassClef = reviewedChords === undefined && measures.some(part => part.some(measure =>
      direct(measure, 'attributes').some(attr => direct(attr, 'clef').some(clef => value(clef, 'sign') === 'F'))));
    if (!hasBassClef) notes.forEach(note => { note.hand = 'right'; });
    const score = { ...finalize({ title, format, notes, tempos, meters, end, notices, harmonies, anchors }), hasBassClef };
    return allParts ? { ...score, measureCount: Math.max(0, ...measures.map(part => part.length)) } :
      withAccompaniment(score, score.harmonies);
  }

  function parseMIDI(buffer, title) {
    const data = new DataView(buffer);
    const tag = at => String.fromCharCode(...new Uint8Array(buffer, at, 4));
    if (data.byteLength < 14 || tag(0) !== 'MThd') throw Error('Tệp MIDI không hợp lệ.');
    const headerSize = data.getUint32(4);
    const format = data.getUint16(8);
    const trackCount = data.getUint16(10);
    const units = data.getUint16(12);
    if (headerSize < 6 || format > 1 || units === 0 || units & 0x8000) {
      throw Error('Chỉ hỗ trợ MIDI loại 0 hoặc 1 dùng đơn vị tick theo phách.');
    }
    const notes = [];
    const tempos = [];
    const meters = [];
    let offset = 8 + headerSize;
    let end = 0;
    for (let track = 0; track < trackCount; track++) {
      if (offset + 8 > data.byteLength || tag(offset) !== 'MTrk') throw Error('Thiếu đoạn dữ liệu MIDI.');
      const trackEnd = offset + 8 + data.getUint32(offset + 4);
      if (trackEnd > data.byteLength) throw Error('Tệp MIDI bị cắt ngắn.');
      offset += 8;
      let ticks = 0;
      let running = 0;
      const active = new Map();
      const read = () => {
        if (offset >= trackEnd) throw Error('Tệp MIDI bị cắt ngắn.');
        return data.getUint8(offset++);
      };
      const variable = () => {
        let result = 0;
        for (let index = 0; index < 4; index++) {
          const byte = read();
          result = result * 128 + (byte & 127);
          if (byte < 128) return result;
        }
        throw Error('Tệp MIDI có giá trị thời gian không hợp lệ.');
      };
      while (offset < trackEnd) {
        ticks += variable();
        let status = read();
        if (status < 128) {
          offset--;
          if (!running) throw Error('Tệp MIDI có trạng thái sự kiện không hợp lệ.');
          status = running;
        }
        if (status >= 0xf0) {
          running = 0;
          const type = status === 0xff ? read() : null;
          if (type === null && ![0xf0, 0xf7].includes(status)) throw Error('Tệp MIDI có sự kiện không được hỗ trợ.');
          const length = variable();
          if (offset + length > trackEnd) throw Error('Tệp MIDI bị cắt ngắn.');
          if (type === 0x51 && length === 3) {
            const micros = data.getUint8(offset) * 65536 + data.getUint16(offset + 1);
            if (micros) tempos.push({ at: ticks, bpm: 60000000 / micros });
          }
          if (type === 0x58 && length === 4) {
            meters.push({ at: ticks, count: data.getUint8(offset), denominator: 2 ** data.getUint8(offset + 1) });
          }
          if (type === 0x2f) break;
          offset += length;
          continue;
        }
        running = status;
        const event = status >> 4;
        const channel = status & 15;
        const first = read();
        const second = event === 12 || event === 13 ? 0 : read();
        if (first > 127 || second > 127) throw Error('Tệp MIDI có dữ liệu nốt không hợp lệ.');
        if (channel === 9 || ![8, 9].includes(event)) continue;
        const key = channel * 128 + first;
        if (event === 9 && second > 0) {
          const held = active.get(key) || [];
          held.push({ pitch: first, start: ticks, velocity: second / 127, hand: guessHand(first) });
          active.set(key, held);
        } else if (active.has(key)) {
          const held = active.get(key);
          const note = held.shift();
          notes.push({ ...note, duration: Math.max(1, ticks - note.start) });
          if (!held.length) active.delete(key);
        }
      }
      for (const held of active.values()) {
        for (const note of held) notes.push({ ...note, duration: Math.max(1, ticks - note.start) });
      }
      end = Math.max(end, ticks);
      offset = trackEnd;
    }
    return finalize({ title, format: 'MIDI', notes, tempos, meters, units, end,
      notices: ['Với MIDI, ứng dụng chia tay theo cao độ.'] });
  }

  function decodeXML(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0x3c && bytes[1] === 0) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff || bytes[0] === 0 && bytes[1] === 0x3c) return new TextDecoder('utf-16be').decode(bytes);
    return new TextDecoder().decode(bytes);
  }

  async function zipScore(buffer) {
    const data = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder();
    let footer = data.byteLength - 22;
    const floor = Math.max(0, footer - 65535);
    while (footer >= floor && (data.getUint32(footer, true) !== 0x06054b50 ||
      footer + 22 + data.getUint16(footer + 20, true) !== data.byteLength)) footer--;
    if (footer < floor) throw Error('Tệp MXL không phải gói MusicXML hợp lệ.');
    const entries = new Map();
    let cursor = data.getUint32(footer + 16, true);
    const count = data.getUint16(footer + 10, true);
    for (let index = 0; index < count; index++) {
      if (cursor + 46 > footer || data.getUint32(cursor, true) !== 0x02014b50) throw Error('Danh mục trong tệp MXL không hợp lệ.');
      const nameLength = data.getUint16(cursor + 28, true);
      const extraLength = data.getUint16(cursor + 30, true);
      const commentLength = data.getUint16(cursor + 32, true);
      const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
      entries.set(name, {
        flags: data.getUint16(cursor + 8, true), method: data.getUint16(cursor + 10, true),
        compressed: data.getUint32(cursor + 20, true), size: data.getUint32(cursor + 24, true),
        at: data.getUint32(cursor + 42, true)
      });
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    async function read(entry) {
      if (entry.size > fileLimit || entry.flags & 1) throw Error('Tệp MXL quá lớn hoặc được mã hóa.');
      const at = entry.at;
      if (at + 30 > bytes.length || data.getUint32(at, true) !== 0x04034b50) throw Error('Gói MXL bị hỏng.');
      const start = at + 30 + data.getUint16(at + 26, true) + data.getUint16(at + 28, true);
      if (start + entry.compressed > bytes.length) throw Error('Gói MXL bị cắt ngắn.');
      const compressed = bytes.subarray(start, start + entry.compressed);
      if (entry.method === 0 && entry.compressed === entry.size) return decodeXML(compressed);
      if (entry.method !== 8) throw Error('Kiểu nén của tệp MXL không được hỗ trợ.');
      let inflater;
      try {
        inflater = new DecompressionStream('deflate-raw');
      } catch {
        throw Error('Trình duyệt này chưa mở được MXL. Hãy thử Chrome hoặc Edge, hoặc dùng MusicXML dạng .musicxml.');
      }
      const reader = new Blob([compressed]).stream().pipeThrough(inflater).getReader();
      const output = new Uint8Array(entry.size);
      let written = 0;
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        if (written + chunk.length > output.length) {
          await reader.cancel();
          throw Error('Kích thước nội dung MXL không hợp lệ.');
        }
        output.set(chunk, written);
        written += chunk.length;
      }
      if (written !== output.length) throw Error('Kích thước nội dung MXL không hợp lệ.');
      return decodeXML(output);
    }
    const container = entries.get('META-INF/container.xml');
    const rootfiles = container ? Array.from(xmlDocument(await read(container)).getElementsByTagNameNS('*', 'rootfile')) : [];
    const path = (rootfiles.find(node => node.getAttribute('media-type') === 'application/vnd.recordare.musicxml+xml') || rootfiles[0])
      ?.getAttribute('full-path');
    const entry = entries.get(path) || [...entries].find(([name]) => /\.(musicxml|xml)$/i.test(name) && !name.startsWith('META-INF/'))?.[1];
    if (!entry) throw Error('Không tìm thấy bản nhạc trong tệp MXL.');
    return read(entry);
  }

  async function importScore(file) {
    const extension = file.name.split('.').at(-1).toLowerCase();
    if (!['mid', 'midi', 'xml', 'musicxml', 'mxl', 'png'].includes(extension)) {
      throw Error('Hãy chọn PDF, PNG, MusicXML, MXL hoặc MIDI.');
    }
    if (file.size > fileLimit) throw Error('Tệp vượt quá giới hạn 20 MB.');
    const title = file.name.replace(/\.[^.]+$/, '');
    if (extension === 'png') {
      if (file.size === ThuTinhScore.bytes && globalThis.crypto?.subtle) {
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (hash === ThuTinhScore.sha256) {
          const score = finalize(ThuTinhScore.score());
          return { ...withAccompaniment(score, score.harmonies), vocalPiano: true,
            imageGeometry: await PianoPNG.readPNG(file, true) };
        }
      }
      const { notes, ...imageGeometry } = await PianoPNG.readPNG(file);
      return { ...finalize({ title, format: 'PNG', notes, tempos: [{ at: 0, bpm: 80 }],
        notices: ['Hãy đối chiếu nốt với ảnh gốc. Bản tập dùng khóa Sol, nốt tự nhiên và một phách cho mỗi bước.'] }), imageGeometry };
    }
    const buffer = await file.arrayBuffer();
    if (extension === 'mid' || extension === 'midi') return parseMIDI(buffer, title);
    if (extension === 'mxl') return parseXML(await zipScore(buffer), title, 'MXL');
    return parseXML(decodeXML(new Uint8Array(buffer)), title);
  }

  async function importRecognizedPDF(buffers, title, positions, reviewedChords) {
    const scores = await Promise.all(buffers.map(async (buffer, index) =>
      parseXML(await zipScore(buffer), title, 'PDF · MusicXML', true, positions?.[index],
        reviewedChords === undefined ? undefined : reviewedChords.movements[index] ?? [],
        reviewedChords?.part, reviewedChords?.bpm)));
    const { bpm, format } = scores[0];
    let duration = 0, measures = 0;
    const notes = [], beats = [], notices = new Set();
    const harmonies = [];
    const anchors = [];
    for (const score of scores) {
      for (const note of score.notes) {
        notes.push({ ...note, start: note.start + duration, measure: note.measure + measures,
          ...(note.cursorMarks && { cursorMarks: note.cursorMarks.map(mark => ({ ...mark, at: mark.at + duration })) }) });
      }
      for (const chord of score.harmonies || []) harmonies.push({ ...chord, at: chord.at + duration, measure: chord.measure + measures });
      for (const anchor of score.anchors || []) anchors.push({ ...anchor, start: anchor.start + duration, measure: anchor.measure + measures });
      for (const beat of score.beats) beats.push({ ...beat, at: beat.at + duration });
      duration += score.duration;
      measures += score.measureCount;
      score.notices.forEach(notice => notices.add(notice));
    }
    const score = { title, format, bpm, notes, duration, beats, notices: [...notices], harmonies, anchors,
      hasBassClef: scores.some(score => score.hasBassClef) };
    return reviewedChords === undefined ? score : withAccompaniment(score, harmonies);
  }

  globalThis.PianoMusic = { noteName, spelledName, internationalName, groupNotes, importScore, importRecognizedPDF,
    finalize, readChord, withAccompaniment, suggestFingering, beatIndex, createTimingJudge };
})();
