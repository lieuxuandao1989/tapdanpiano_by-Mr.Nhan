"""Map Audiveris MusicXML notes back to the source PDF's printed noteheads."""
import hashlib
import json
import re
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent
JOBS = Path(tempfile.gettempdir()) / "PhimNhip-Audiveris-jobs"
SCORES = ROOT / "Sheet Scores"
STEPS = "CDEFGAB"
CLEF_PITCH = {"G": 4 * 7 + 4, "F": 3 * 7 + 3, "C": 4 * 7}
CLEF_LINE = {"G": 2, "F": 4, "C": 3}
FALSE_CLEF_HEADS = "mua-xuan-dau-tien-tuan-khanh-truongca.com.pdf"
REVIEWED_BOOKS = {"bai ca dat phuong nam truongca.com.pdf": "phuong-nam-grid.omr"}
# Whole notes missed by Audiveris. Positions are in thousandths of the
# original page width. An insertion also supplies the printed barlines.
REVIEWED_REPAIRS = {
    "Cô Bắc Kỳ Nho Nhỏ.pdf": {
        3: {"after": {17: (881, 942, "F4", 910, 4)}},
        6: {"replace": {29: ("C5", 371, 4), 31: ("D4", 618, 4)},
            "after": {32: (887, 942, "F4", 912, 4)}},
        7: {"replace": {36: ("G4", 578, 4)}},
        9: {"replace": {50: ("F4", 839, 4)}, "after": {50: (885, 942, "F4", 899, 4)}},
    },
    "Phố Xa.pdf": {
        7: {"after": {14: (829, 937, "F4", 859, 4)}},
    },
    "Giáng Ngọc.pdf": {
        1: {"after": {3: (845, 938, "F#4", 871, 4)}},
        3: {"replace": {10: ("E5", 626, 4)}},
        4: {"before": {12: (62, 195, "A4", 119, 4)},
            "after": {14: (839, 938, "A4", 862, 4)}},
        5: {"replace": {16: ("G4", 425, 4)}, "after": {17: (808, 938, "A4", 832, 4)}},
        7: {"before": {23: (62, 227, "E5", 119, 4)},
            "after": {25: (871, 938, "F#4", 891, 4)}},
        8: {"after": {28: (848, 937, "E5", 867, 4)}},
    },
    "bai ca dat phuong nam truongca.com.pdf": {
        1: {"replace": {2: ("C4", 390, 4)}},
        2: {"replace": {8: ("D5", 346, 4), 10: ("Bb4", 600, 4)},
            "after": {11: (858, 940, "C5", 878, 4)}},
        5: {"replace": {23: ("C5", 580, 4)}},
    },
}


def open_book(digest, name):
    return ZipFile(JOBS / REVIEWED_BOOKS.get(name, f"{digest}.omr"))


def musicxml(file):
    with ZipFile(file) as archive:
        c = ET.fromstring(archive.read("META-INF/container.xml"))
        return ET.fromstring(archive.read(c.find(".//{*}rootfile").get("full-path")))


def source_systems(book, score):
    cached = {}
    for reference in score.findall("page"):
        n = int(reference.get("sheet-number"))
        if n not in cached:
            cached[n] = ET.fromstring(book.read(f"sheet#{n}/sheet#{n}.xml"))
        sheet = cached[n]
        page = sheet.find(f"page[@id='{reference.get('sheet-page-id')}']")
        picture = sheet.find("picture")
        gap = float(sheet.find("scale/interline").get("main"))
        dimensions = float(picture.get("width")), float(picture.get("height"))
        for system in page.findall("system"):
            yield n, dimensions, gap, system


def stack_rows(systems, name):
    index = 0
    for page, dimensions, gap, system in systems:
        repairs = REVIEWED_REPAIRS.get(name, {}).get(int(system.get("id")), {}) if page == 1 else {}
        width, _ = dimensions
        row = []
        for stack in system.findall("stack"):
            if stack.get("special") == "CAUTIONARY":
                continue
            index += 1
            for order in ("before", "replace", "after"):
                note = repairs.get(order, {}).get(index)
                if note is None and order != "replace":
                    continue
                if order == "replace":
                    row.append((stack, index, note))
                    continue
                left, right, *note = note
                inserted = ET.Element("stack", left=str(left * width / 1000), right=str(right * width / 1000),
                                      duration="1", expected="1")
                row.append((inserted, None, note))
        yield page, dimensions, gap, system, row


def clefs_at(measure, clefs):
    for clef in measure.findall("attributes/clef"):
        sign = clef.findtext("sign")
        if sign not in CLEF_PITCH:
            continue
        line = int(clef.findtext("line", str(CLEF_LINE[sign])))
        octave = int(clef.findtext("clef-octave-change", "0"))
        clefs[clef.get("number", "1")] = CLEF_PITCH[sign] + 2 * (3 - line) + 7 * octave


def printed_clef(system, staff_id, x):
    eligible = [clef for clef in system.findall("sig/inters/clef")
                if clef.get("staff") == staff_id and float(clef.find("bounds").get("x")) < x]
    if not eligible:
        return None
    clef = max(eligible, key=lambda item: float(item.find("bounds").get("x")))
    shape = clef.get("shape", "")
    anchor = CLEF_PITCH.get(shape[:1])
    if anchor is None:
        return None
    return anchor + float(clef.get("pitch", "0")) + (7 if "8VA" in shape else -7 if "8VB" in shape else 0)


def staff_geometry(staff):
    if staff is None:
        return None
    lines = staff.findall("lines/line")
    if len(lines) < 2:
        return None
    return tuple(float(line.find("point").get("y")) for line in [lines[0], lines[-1]])


def source_note(part, note, clefs, source, name):
    page, (width, height), gap, system, stack = source
    raw_x = note.get("default-x")
    if raw_x is None:
        return None, False
    x = float(stack.get("left")) + float(raw_x) * gap / 10
    staff_number = note.findtext("staff", "1")
    part_id = part.get("id").removeprefix("P")
    physical_part = system.find(f"part[@id='{part_id}']")
    if physical_part is None and len(system.findall("part")) == 1:
        physical_part = system.find("part")
    staffs = physical_part.findall("staff") if physical_part is not None else []
    staff = staffs[int(staff_number) - 1] if 0 < int(staff_number) <= len(staffs) else None
    staff_id = staff.get("id") if staff is not None else None
    if note.find("rest") is not None:
        geometry = staff_geometry(staff)
        if not geometry or not 0 < x < width:
            return None, False
        top, bottom = geometry
        return [page, round((x + gap * .4) / width, 5), round((top + bottom) / (2 * height), 5),
                round(gap / width, 5), round(gap / height, 5)], False
    step = note.findtext("pitch/step")
    octave = int(note.findtext("pitch/octave"))
    degree = octave * 7 + STEPS.index(step)
    head_pitch = clefs.get(staff_number, CLEF_PITCH["G"] + 2) - degree
    raw_clef = printed_clef(system, staff_id, x)
    raw_pitch = raw_clef - degree if raw_clef is not None else head_pitch
    candidates, raw_candidates, nearby_heads = [], [], []
    for head in system.findall("sig/inters/head"):
        bounds = head.find("bounds")
        if bounds is None or staff_id is not None and head.get("staff") != staff_id:
            continue
        left = float(bounds.get("x"))
        if abs(left - x) > gap * 1.1:
            continue
        difference = abs(float(head.get("pitch", "0")) - head_pitch)
        if difference <= .55 or staff_id is None:
            candidates.append((abs(left - x) + gap * difference, bounds))
        raw_difference = abs(float(head.get("pitch", "0")) - raw_pitch)
        if raw_difference <= .55:
            raw_candidates.append((abs(left - x) + gap * raw_difference, bounds))
        if staff_id is not None and abs(left - x) <= gap * .3:
            nearby_heads.append((abs(left - x), bounds))
    if not candidates:
        candidates = raw_candidates or (nearby_heads if len(nearby_heads) == 1 else [])
    if candidates:
        bounds = min(candidates, key=lambda it: it[0])[1]
        left, top, box_w, box_h = (float(bounds.get(k)) for k in ["x", "y", "w", "h"])
        x, y, w, h = left + box_w / 2, top + box_h / 2, box_w, box_h
    elif (geometry := staff_geometry(staff)) is not None:
        top, bottom = geometry
        y = (top + bottom) / 2 + head_pitch * gap / 2
        # The scan on page 5 contains three false noteheads on the treble clef.
        if name == FALSE_CLEF_HEADS and page == 5 and .085 < x / width < .095 and .41 < y / height < .43:
            return False, False
        x, w, h = x + gap * .55, gap * 1.4, gap
    else:
        return None, False
    if not 0 < x < width or not 0 < y < height:
        return None, False
    box = [page, round(x / width, 5), round(y / height, 5), round(w / width, 5), round(h / height, 5)]
    return box, bool(candidates)


def map_movement(root, systems, name):
    stacks = [(page, dimensions, gap, system, stack)
              for page, dimensions, gap, system, row in stack_rows(systems, name) for stack, _, _ in row]
    result = []
    tracked = matched = total = 0
    for part in root.findall("part"):
        mapping = []
        clefs = {}
        measures = part.findall("measure")
        if len(measures) != len(stacks):
            print("Stack mismatch", part.get("id"), len(measures), len(stacks))
        for index, measure in enumerate(measures):
            clefs_at(measure, clefs)
            row = []
            for note in measure.findall("note"):
                box = None
                if note.find("pitch") is not None:
                    total += 1
                    if index < len(stacks):
                        box, is_match = source_note(part, note, clefs, stacks[index], name)
                        tracked += box is not None
                        matched += is_match
                elif note.find("rest") is not None and index < len(stacks):
                    box, _ = source_note(part, note, clefs, stacks[index], name)
                row.append(box)
            mapping.append(row)
        result.append(mapping)
    return result, (total, tracked, matched)


def build():
    result = {}
    for pdf in (ROOT / "Sheet Music").glob("*.pdf"):
        digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
        files = sorted(SCORES.glob(f"{digest}.mvt*.mxl"), key=lambda p: int(re.search(r"mvt(\d+)", p.name)[1]))
        if (single := SCORES / f"{digest}.mxl").is_file():
            files = [single]
        if not files:
            continue
        with open_book(digest, pdf.name) as book:
            scores = ET.fromstring(book.read("book.xml")).findall("score")
            moves = []
            stats = []
            for index, file in enumerate(files):
                movement, counts = map_movement(musicxml(file), source_systems(book, scores[index]), pdf.name)
                moves.append(movement)
                stats.append(counts)
        total, tracked, matched = map(sum, zip(*stats))
        result[digest] = moves
        print(f"{total:4} {tracked:4} {matched:4}  {pdf.name}")
    (SCORES / "cursors.js").write_text(
        "globalThis.PianoScoreCursors = " + json.dumps(result, separators=(",", ":")) + ";\n", encoding="utf-8")


if __name__ == "__main__":
    build()
