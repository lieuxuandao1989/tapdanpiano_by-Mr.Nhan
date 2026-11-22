(() => {
  'use strict';

  const rowFor = (item, rows) => rows.find(row => item.x >= row.left - .004 && item.x <= row.right &&
    item.y >= row.top - row.gap * 3.6 && item.y <= row.top + row.gap * .08);

  // Read text glyphs at the printed harmony line. Keep lyric text and
  // rehearsal letters out of the candidate list.
  async function textSymbols(doc, pageNumber, rows) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const text = await page.getTextContent();
    return text.items.flatMap(item => {
      if (!item.str || !item.transform) return [];
      const [x, baseline] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      const str = item.str.trim();
      if (!str) return [];
      const label = { x: x / viewport.width, y: baseline / viewport.height,
        width: item.width / viewport.width, height: item.height / viewport.height, str };
      const row = rowFor(label, rows);
      return row && label.height > .38 * row.gap && label.height < 2.8 * row.gap ? [label] : [];
    }).sort((a,b) => a.x-b.x);
  }

  function symbolsToChanges(score, layout) {
    const changes = [];
    for (const page of layout) {
      const notes = [...score.notes, ...(score.anchors || [])].filter(n => n.scoreBox?.[0] === page.page);
      for (const row of page.rows) {
        const melody = notes.filter(n => n.scoreBox[2] >= row.top - row.gap * 2.25 &&
          n.scoreBox[2] <= row.bottom + row.gap * 2.25);
        if (!melody.length) continue;
        for (const item of page.symbols.filter(symbol => rowFor(symbol, page.rows) === row)) {
          const chord = PianoMusic.readChord(item.str);
          if (!chord) continue;
          const x = item.x;
          const onset = melody.reduce((best, note) => {
            if (Math.abs(x - note.scoreBox[1]) < Math.abs(x - best.scoreBox[1])) return note;
            return best;
          });
          if (Math.abs(onset.scoreBox[1] - x) > (item.reviewed ? .085 : .044)) continue;
          changes.push({ ...chord, at: onset.start, measure: onset.measure,
            scoreBox: [page.page, x + item.width / 2, item.y - item.height / 2, item.width, item.height] });
        }
      }
    }
    return changes;
  }

  async function apply(score, doc, data) {
    if (score.hasBassClef) return score;
    if (score.harmonies?.some(chord => chord.pitches.length)) {
      return PianoMusic.withAccompaniment(score, score.harmonies.map(chord => {
        const anchor = score.notes.find(n => n.start >= chord.at && n.scoreBox);
        return { ...chord, scoreBox: anchor?.scoreBox };
      }));
    }
    if (!data?.length) return score;
    const layout = await Promise.all(data.map(async page => {
      if (page.reviewed) return page;
      let text = [];
      try { text = await textSymbols(doc, page.page, page.rows); } catch {}
      const symbols = (page.symbols || []).filter(item => {
        const row = rowFor(item, page.rows);
        return row && (item.reviewed || item.x >= row.left + row.gap * 2.6);
      });
      const candidates = [...symbols];
      const read = text.filter(item => PianoMusic.readChord(item.str));
      // A single letter alone may be a section label. Require support
      // from other chord symbols in the same PDF before using such tokens.
      for (const item of read) if (!symbols.some(other =>
        Math.abs(other.x-item.x) < .013 && Math.abs(other.y-item.y) < .013)) candidates.push(item);
      return { ...page, symbols: candidates };
    }));
    const changes = symbolsToChanges(score, layout);
    const curated = layout.some(page => page.symbols.some(item => item.reviewed));
    const qualified = changes.some(chord => !/^[A-G]$/.test(chord.label));
    if (!curated && !qualified && new Set(changes.map(chord => chord.label)).size < 2) return score;
    return PianoMusic.withAccompaniment(score, changes);
  }

  globalThis.PianoPDFChords = { apply, symbolsToChanges };
})();
