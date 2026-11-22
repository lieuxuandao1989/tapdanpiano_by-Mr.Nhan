// Transcription of the supplied PNG. Each column is one 4/4 measure.
// Staff steps count from E4 (0). The key signature raises F to F sharp.
// Durations are in sixteenth notes; '_' is a rest and '~' continues a tie. 't' is an eighth-note triplet.
(() => {
  const rest = '_:16';
  const systems = [];
  const bars = line => line.split('|').map(bar => bar.trim() || rest);
  function system(vocal, piano) {
    systems.push([bars(vocal), bars(piano)]);
  }
  const intro = '_:2 7:2 7:2 7:1 6:1 4:2 4:1 6:1 3:2 3:1 4:1';
  // The repeated pitches in the opening phrase are separate attacks.
  const letterBar = '_:2 -3:2 -5:2 -4:1 -3:1 0:2 0:4 -1:2';
  const memory = '_:2 0:2 -3:2 0:2 3:1 4:1 4:4 3:2';
  system('||', intro + '|7:16|_:2 7:2 7:2 7:1 6:1 4:2 4:1 6:1 4:1 3:1 2:2');
  system('||', '3:16|_:2 3:2 3:2 4:2 0:2 2:4 3:1 4:1|4:6 _:1 7:1 7:1 8:1 8:1 9:1 9:1 10:2 9:1');
  system('||'+letterBar, '8:6 8:2 6#:2 7:4 8:2|7:6 4:1 5:1 9:1 8:1 7:1 6:1 5:1 4:1 4:2|7:16');
  system('0:16|_:2 0:2 -3:2 0:2 3:1 4:1 4:4 3:2|4:16',
    '_:4 _:2 4:2 3:2 3:1 2:1 3:2 4:2|0:16|_:2 4:2 4:2 6:2 7:2 6:1 4:1 3:2 2:2');
  system('_:2 3:2 3:2 4:2 0:2 0:4 -1:2|0:2 1:2 1:2 0:1 2:1 -3:2 -3:4 -4:2|-3:6 -3:2 -5:2 -3:2 -1:1 0:1 -2:2',
    '3:16||_:2 4:2 5:2 3:2 4:8');
  system('-3:16|'+letterBar+'|0:16',
    '_:4 8:1 9:1 8:1 7:1 6#:2 7:2 5:2 3:2|4:16|');
  system(memory.replace('-3:2 0:2','-3:3 0:1')+'|4:16|_:2 3:2 3:2 4:2 0:4 0:2 -1:2','||');
  system('0:4 1:1 1:1 2:2 -3:2 -3:4 -4:2|-3:6 -3:2 -4:2 -3:2 -5:2 -4:2|-3:2 0:2 ~0:12',
    '||_:4 7:1 8:1 9:1 8:1 7:2 8:1 7:1 6:2 4:2');
  system('_:8 _:4 0:4|2:2 3:2 ~3:4 0:2 3:4 0:2|0:1 3:1 4:2 ~4:8 1:4',
    '7:6 _:1 7:1 7:1 6:1 6:1 5:1 5:2 4:2|3:16|');
  system('3:2 4:2 ~4:4 4:1 6:1 0:2 2:2 2:2|~2:2 0:2 ~0:8 -3:2 -4:2|-3:8 0:2 2:4 1:2',
    '|_:2 4:2 2:2 3:1 2:1 0:8|');
  system('~1:2 1:2 ~1:8 -3:2 -4:2|-3:8 -1#:2 1:4 0:2|~0:2 0:2 ~0:12',
    '_:2 3:2 2:2 0:2 0:8||_:4 _:2 4:2 3:2 4:2 9:2 8:2');
  system(letterBar+'|0:16|'+memory,
    '7:16|_:4 7:1 8:1 9:1 8:1 7:4 6:2 4:2|7:16');
  system('4:16|_:2 3:2 3:2 4:2 0:2 0:4 -1:2|0:2 1:2 1:2 0:1 2:1 -3:2 -3:4 -4:2',
    '_:2 4:1 5:1 6:2 7:2 6:4 5:1 6:1 5:1 4:1|3:16|');
  system('-3:6 -3:2 -4:2 -3:2 -5:2 -4:1 -3:1|~-3:2 0:2 ~0:12','|');
  system('|||','_:2 4:2 3:2 4:2 7:2 7:4 6:2|7:16|_:2 9:2 7:2 7:1 9:1 7:3 6:1 5:1 4:1 3:2|4:16');
  system('|||','_:2 3:2 3:2 4:2 0:2 0:4 -1:2|0:6 4:2 7:1 8:1 9:1 7:1 8:2 7:2|4:4 _:1 4:1 5:1 6:1 5:1 4:1 3:1 2:1 1:2 2:2|0:8 3:2 4:1 3:1 4:2 6:2');
  system('_:8 _:4 0:4|2:2 3:2 ~3:4 0:2 3:4 0:2|0:1 3:1 4:2 ~4:8 1:4|3:2 4:2 ~4:4 4:1 6:1 0:2 2:2 2:2',
    '7:8 9:1 8:1 7:1 6:1 6:2 5:1 4:1|3:16||');
  system('~2:2 0:2 ~0:8 -3:2 -4:2|-3:8 0:2 2:4 1:2|~1:2 1:2 ~1:8 -3:2 -4:2|-3:8 -1#:2 1:4 0:2',
    '_:2 4:2 2:2 3:1 2:1 0:8||_:2 3:2 2:2 0:2 0:8|');
  system('~0:2 0:2 ~0:12|'+letterBar+'|0:16|'+memory,
    '_:4 _:2 4:2 3:2 4:2 9:2 8:2|7:16||');
  system('4:16|_:2 3:2 3:2 4:2 0:2 0:4 -1:2|0:2 1:2 1:2 0:1 2:1 -3:2 -3:4 -4:2|-3:6 -3:2 -4:2 -3:2 -5:2 -4:1 -3:1','|||');
  system('~-3:2 0:2 ~0:12|_:2 3:2 3:2 4:2 0:2 0:4 -1:2|0:2 1:2 1:2 0:1 2:1 -3:2 -3:4 -4:2|-3:6 -3:2 -4:2 -3:2 -5:4',
    '|_:8 _:2 3:2 2:2 1:2|0:16|_:2 4:1 5:1 6:2 5:1 4:1 4:8');
  system('~-5:8 -3:8|0:16||||','|7:1 8:1 9:2 9:4 _:2 4:2 7:2 6:2|5:8 _:1 4:1 5:1 6:1 7:1 6:1 5:1 4:1|4:6 4:2 6#:2 6#:2 8:2 8:2|7:4 _:t 6:t 5:t 4:t 3:t 2:t 1:4|0:16');

  const printedChords = [
    '- Em Em', 'Am Am Em', 'B7 Em Em', 'Em Em G', 'Am Em B7', 'B7 B7 Em', 'Em G Am',
    'Em B7 Em', 'Em Am Em', 'Bm Em Em', 'Am B7 Em', 'Em Em Em', 'G Am Em', 'B7 -',
    'Em Em Em G', 'Am Em B7 Em', 'Em Am Em Bm', 'Em Em Am B7', 'Em Em Em Em',
    'G Am Em B7', 'Em Am Em B7', 'B7 Em Am B7 Em Em'
  ].flatMap(row => row.split(' '));
  function score() {
    const notes = [];
    let measure = 1;
    const previous = [null, null];
    for (const parts of systems) {
      if (parts[0].length !== parts[1].length) throw Error('Số ô nhịp hai dòng khác nhau.');
      parts.forEach((part, side) => part.forEach((bar, index) => {
        let ticks = 0;
        for (const token of bar.split(/\s+/)) {
          const [symbol, length] = token.split(':');
          const units = length === 't' ? 4 / 3 : Number(length);
          if (symbol !== '_') {
            const degree = 30 + parseInt(symbol.replace('~',''), 10);
            const step = degree % 7;
            const pitch = 12 * (1 + Math.floor(degree / 7)) + [0,2,4,6,7,9,11][step] + Number(symbol.includes('#'));
            const start = 4 * (measure + index - 1) + ticks / 4;
            const last = previous[side];
            if (symbol.startsWith('~') && last?.pitch === pitch && last.start + last.duration === start) last.duration += units / 4;
            else {
              const note = { start, duration: units / 4, pitch, hand: side ? 'left' : 'right', measure: measure + index };
              notes.push(note);
              previous[side] = note;
            }
          }
          ticks += units;
        }
        if (Math.abs(ticks - 16) > .001) throw Error('Sai trường độ ở ô nhịp ' + (measure + index));
      }));
      measure += parts[0].length;
    }
    const harmonies = printedChords.flatMap((label, i) => {
      const chord = PianoMusic.readChord(label);
      return chord ? [{ ...chord, at: i * 4, measure: i + 1 }] : [];
    });
    return { title: 'Thư tình em gái', format: 'PNG', notes, harmonies, tempos: [{at: 0, bpm: 67}], end: (measure - 1) * 4,
      notices: ['Dùng bản chép riêng cho ảnh này. Chọn dòng Ca hoặc Đàn để tập riêng. Tay trái đệm các hợp âm ghi trên ảnh.'] };
  }
  globalThis.ThuTinhScore = { score, bytes: 381516, sha256: '020b49de888c2ba3def12d0c474e331ba80945acbc2d0129e22bcda5165d1f84' };
})();
