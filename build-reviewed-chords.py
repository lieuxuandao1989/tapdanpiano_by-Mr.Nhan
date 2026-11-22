"""Align transcribed PDF chord symbols to the Audiveris measure grid."""

import hashlib
import json
import re
import runpy
from collections import defaultdict
from fractions import Fraction
from pathlib import Path

cursor = runpy.run_path(str(Path(__file__).with_name("build-score-cursors.py")))
ROOT, SCORES = (cursor[key] for key in ("ROOT", "SCORES"))
# This edition prints a transposed alto-sax score above the piano part.
PIANO_PARTS = {"Vị Ngọt Đôi Môi.pdf": (1, 80)}


def grid(stack, gap):
    left, right = (float(stack.get(key)) for key in ("left", "right"))
    beats = 4 * Fraction(stack.get("expected", stack.get("duration", "0")))
    slots = [(left + float(slot.get("x-offset")), 4 * Fraction(slot.get("time-offset")))
             for slot in stack.findall("slot") if slot.get("time-offset") is not None]
    if not slots or not beats:
        return [(left, Fraction(0))]
    points = dict(slots)
    if slots[0][1]:
        points[left] = Fraction(0)
    # Some chord changes fall on subdivisions of a held note. Add the
    # regular subdivisions between the actual onset positions and barline.
    for (x0, b0), (x1, b1) in zip(slots, slots[1:] + [(right - min(gap, (right-slots[-1][0]) / 5), beats)]):
        if b1 <= b0:
            continue
        for half in range(int(b0 * 2) + 1, int(b1 * 2 + 1)):
            beat = Fraction(half, 2)
            if b0 < beat < b1:
                points[x0 + (x1-x0) * float((beat-b0) / (b1-b0))] = beat
    return sorted(points.items())


def align_system(row, system, width, gap, alternate):
    changes = defaultdict(list)
    for token in row.split():
        coordinate, label = token.split(":", 1)
        versions = label.split("|")
        label = versions[-1] if alternate else versions[0]
        if not label:
            continue
        label, _, override = label.partition("@")
        x = int(coordinate) * width / 1000
        measure, stack = next(((n, s) for n, s in system if x < float(s.get("right"))), system[-1])
        if not float(stack.get("left")) - 2 * gap <= x <= float(stack.get("right")) + 2 * gap:
            print(f"EDGE chord {token} at measure {measure}")
        changes[measure].append((x, label, override, stack))
    return changes


def align_file(pdf, checked, alternate=False):
    digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
    part, bpm = PIANO_PARTS.get(pdf.name, (0, None))
    result = {"movements": []}
    if bpm is not None:
        result.update(part=part, bpm=bpm)
    if not any(any(rows) for rows in checked.values()):
        return digest, result
    rows_by_page = defaultdict(list)
    movements = sorted(SCORES.glob(f"{digest}.mvt*.mxl"), key=lambda p: int(re.search(r"mvt(\d+)", p.name)[1]))
    if not movements:
        movements = [SCORES / f"{digest}.mxl"]
    output = result["movements"] = [[] for _ in movements]
    with cursor["open_book"](digest, pdf.name) as book:
        scores = cursor["ET"].fromstring(book.read("book.xml")).findall("score")
        for index, file in enumerate(movements):
            measure = 0
            source = cursor["source_systems"](book, scores[index])
            for page, (width, height), gap, system, row in cursor["stack_rows"](source, pdf.name):
                staff = system.findall("part/staff")[part]
                geometry = cursor["staff_geometry"](staff)
                if geometry is None:
                    raise ValueError(f"{pdf.name}: page {page}, no staff")
                stacks = []
                for stack, _, _ in row:
                    measure += 1
                    stacks.append((measure, stack))
                rows_by_page[str(page)].append((index, stacks, width, height, gap, geometry[0]))
            xml = cursor["musicxml"](file)
            if len(xml.findall("part/measure")) // len(xml.findall("part")) != measure:
                raise ValueError(f"{pdf.name}: measure mismatch in movement {index + 1}")
    for page, lines in checked.items():
        if not lines:
            continue
        systems = rows_by_page[page]
        if len(lines) != len(systems):
            raise ValueError(f"{pdf.name}: {len(lines)} reviewed vs {len(systems)} recognized lines on page {page}")
        for line, (index, stacks, width, height, gap, top) in zip(lines, systems):
            for measure, entries in align_system(line, stacks, width, gap, alternate).items():
                positions = grid(entries[0][3], gap)
                taken = set()
                for x, label, override, _ in entries:
                    resolved = min(positions, key=lambda point: abs(point[0]-x))[1]
                    beat = Fraction(override) if override else resolved
                    if beat in taken:
                        raise ValueError(f"{pdf.name}: two chord symbols at measure {measure}, beat {beat}")
                    taken.add(beat)
                    size = (min(len(label), 5) * gap * .5) / width
                    box = [int(page), x / width + size / 2, (top - 2 * gap) / height, size, gap / height]
                    output[index].append([measure, float(beat), label, [box[0], *[round(v, 5) for v in box[1:]]]])
    return digest, result


def build():
    reviewed = json.loads((ROOT / "reviewed-chords.json").read_text(encoding="utf-8"))
    catalog = {}
    for name, pages in reviewed.items():
        pdf = ROOT / "Sheet Music" / name
        digest, score = align_file(pdf, pages)
        if any("|" in line for rows in pages.values() for line in rows):
            _, alternate = align_file(pdf, pages, alternate=True)
            score["alternate"] = alternate["movements"]
        catalog[digest] = score
    out = SCORES / "chord-symbols.js"
    out.write_text("globalThis.PianoReviewedChords = " +
                   json.dumps(catalog, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"{len(catalog)} PDFs, {sum(len(move) for score in catalog.values() for move in score['movements'])} chord symbols")


if __name__ == "__main__":
    build()
