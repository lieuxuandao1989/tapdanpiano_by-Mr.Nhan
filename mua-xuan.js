// Checked against the supplied two-page PDF. Page 2 contains lyrics.
// Each bar is 2/4. Tokens encode horizontal position on a 990-unit page,
// diatonic steps above treble E4, and duration in sixteenths. "~" is a tie.
(() => {
  const rows = [
    '_:3 210/3:1 240/3:1 269/1:2 316/0:1 | 383/3:3 436/3:1 468/4:1 501/3:2 547/4:.5 569/5:.5 | 605/0:3 670/-2:1 708/-1:1 741/-2:2 795/-1:1 | 836/0:.125 845/1:.125 855/0:7.75',
    '~138/0:2 _:1 194/-2:1 230/-1:1 256/0:2 281/1:1 | 318/-2:3 362/0:1 398/1:1 433/0:2 469/1:1 | 516/5:3 558/5:1 590/0:1 620/1:2 654/0:1 | 704/4:8 | ~761/4:2 _:1 815/3:1 845/3:1 870/1:2 903/0:1',
    '149/3:3 193/3:1 229/4:1 261/3:2 299/4:.5 315/5:.5 | 348/0:3 389/-2:1 414/-1:1 442/-2:2 475/-1:1 | 508/0:.125 518/1:.125 528/0:7.75 | ~579/0:2 _:1 635/-2:1 661/-1:1 700/0:2 737/1:1 | 779/-2:3 816/0:1 848/1:1 878/0:2 908/1:1',
    '147/5:3 203/4:1 239/5:1 276/1:2 322/2:1 | 369/3:8 | ~436/3:2 470/3:2 506/-2:2 541/-1:1 564/0:1 | 606/3:8 | ~674/3:2 716/-2:2 755/-1:2 796/0:1 821/1:1 | 873/-2:8',
    '~138/-2:2 173/0:2 209/3:2 244/0:1 277/3:1 | 312/4:.125 321/5:.125 332/4:7.75 | ~389/4:2 429/1:2 468/4:2 508/3:1 532/4:1 | 561/5:.125 571/7:.125 582/5:7.75 | ~644/5:3 689/5:1 727/7:2 773/5:1 818/5:1 | 878/1:8',
    '~138/1:2 177/4:2 217/5:2 256/4:1 281/4:1 | 327/0:8 | ~399/0:2 440/1:2 481/1:2 521/-2:1 548/1:1 | 605/3:8 | ~686/3:2 724/4:2 762/5:2 800/1:1 824/4:1 | 870/4:8',
    '~138/4:2 _:1 186/3:1 216/3:1 242/1:2 269/0:1 | 326/3:3 365/3:1 389/4:1 414/3:2 447/4:.5 471/5:.5 | 508/0:3 551/-2:1 583/-1:1 609/-2:2 644/-1:1 | 678/0:.125 689/1:.125 700/0:7.75 | ~759/0:2 _:1 811/-2:1 843/-1:1 874/0:2 907/1:1',
    '146/-2:3 189/0:1 214/1:1 249/0:2 277/1:1 | 325/5:3 363/5:1 391/0:1 420/1:2 450/0:1 | 495/4:8 | ~552/4:2 _:1 605/3:1 636/3:1 661/1:2 692/0:1 | 745/3:3 789/3:1 826/4:1 854/3:2 893/4:.5 912/5:.5',
    '144/0:3 185/-2:1 219/-1:1 251/-2:2 284/-1:1 | 315/0:.125 325/1:.125 335/0:7.75 | ~386/0:2 _:1 443/-2:1 475/-1:1 502/0:2 536/1:1 | 585/-2:3 625/0:1 655/1:1 687/0:2 717/1:1 | 754/5:3 799/4:1 834/5:1 870/1:2 907/2:1',
    '145/3:8 | ~193/3:2 _:1 243/3:1 272/3:1 298/1:2 326/0:1 | 389/3:8 | ~437/3:3 473/3:1 502/3:1 529/1:2 556/0:1 | 609/3:8 | ~665/3:2 _:1 708/3:1 738/3:2 765/1:1 801/0:1 | 849/5,7:8 | ~888/5,7:4 _:4'
  ];
  const bars = [];
  rows.forEach((line, staff) => line.split('|').forEach(bar => {
    bars.push({ staff, tokens: bar.trim().split(/\s+/) });
  }));
  function notesFor(staff) {
    const order = bars.map((_, i) => i).filter(i => staff == null || bars[i].staff === staff);
    if (staff == null) order.splice(49, 0, ...order.slice(1, 47));
    let start = 0;
    const notes = [], previous = new Map();
    for (const index of order) {
      const bar = bars[index];
      let length = 0;
      for (const token of bar.tokens) {
        const [head, ticks] = token.split(':');
        const duration = Number(ticks) / 4;
        if (head !== '_') {
          const [x, steps] = head.replace('~', '').split('/');
          for (const offset of steps.split(',').map(Number)) {
            const degree = 30 + offset;
            const pitch = 12 * (1 + Math.floor(degree / 7)) + [1,2,4,6,8,9,11][degree % 7];
            const last = previous.get(pitch);
            if (head.startsWith('~') && last && last.start + last.duration === start) {
              last.duration += duration;
              (last.cursorMarks ||= []).push({ at: start, note: { staff: bar.staff, x: Number(x) / 990, steps: offset } });
            }
            else {
              const note = { pitch, duration, start, hand: 'right', measure: index + 1, staff: bar.staff, x: Number(x) / 990, steps: offset };
              notes.push(note); previous.set(pitch, note);
            }
          }
        }
        length += duration; start += duration;
      }
      if (length !== 2) throw Error('Sai trường độ ở ô nhịp ' + (index + 1));
    }
    return { notes, end: start, tempos: [{ at: 0, bpm: 63 }], meters: [{ at: 0, count: 2, denominator: 4 }] };
  }
  globalThis.MuaXuan = { notesFor, hash: 'cc7487e7a3dbf3a03879b734b5682b3cc8b030b5c94c59b50e00a37a95546233' };
})();
