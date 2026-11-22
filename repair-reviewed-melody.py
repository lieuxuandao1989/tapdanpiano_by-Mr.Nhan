"""Restore printed measures required by the reviewed chord timeline."""

import hashlib
import json
import re
import runpy
from base64 import b64encode
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED

cursor = runpy.run_path(str(Path(__file__).with_name("build-score-cursors.py")))
ROOT, JOBS, SCORES, ET, ZipFile = (cursor[key] for key in ("ROOT", "JOBS", "SCORES", "ET", "ZipFile"))


def append_note(measure, note, stack, width, gap, divisions):
    pitch, x, beats = note
    step, sign, octave = re.fullmatch(r"([A-G])([b#]?)(\d)", pitch).groups()
    default_x = (x * width / 1000 - float(stack.get("left"))) / gap * 10 - 5
    element = ET.SubElement(measure, "note", {"default-x": str(round(default_x, 2))})
    written = ET.SubElement(element, "pitch")
    ET.SubElement(written, "step").text = step
    if sign:
        ET.SubElement(written, "alter").text = "1" if sign == "#" else "-1"
    ET.SubElement(written, "octave").text = octave
    ET.SubElement(element, "duration").text = str(beats * divisions)
    ET.SubElement(element, "voice").text = "1"
    ET.SubElement(element, "type").text = "whole"


def repair(name):
    pdf = ROOT / "Sheet Music" / name
    digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
    book_name = cursor["REVIEWED_BOOKS"].get(name, digest + ".omr")
    source = JOBS / book_name.replace(".omr", ".mxl")
    with cursor["open_book"](digest, name) as book:
        score = ET.fromstring(book.read("book.xml")).find("score")
        systems = list(cursor["stack_rows"](cursor["source_systems"](book, score), name))
    xml = cursor["musicxml"](source)
    part = xml.find("part")
    originals = part.findall("measure")
    for measure in originals:
        part.remove(measure)
    divisions = 1
    for _, (width, _), gap, _, row in systems:
        for stack, index, note in row:
            measure = originals[index - 1] if index else ET.Element("measure")
            measure.set("number", str(len(part) + 1))
            divisions = int(measure.findtext("attributes/divisions", str(divisions)))
            if note:
                for previous in measure.findall("note"):
                    measure.remove(previous)
                append_note(measure, note, stack, width, gap, divisions)
            if name in cursor["REVIEWED_BOOKS"]:
                tempo = {1: 88, 25: 120, 29: 130}.get(index)
                if tempo:
                    measure.insert(0, ET.Element("sound", tempo=str(tempo)))
            part.append(measure)
    target = BytesIO()
    with ZipFile(source) as original, ZipFile(target, "w", ZIP_DEFLATED) as repaired:
        container = ET.fromstring(original.read("META-INF/container.xml"))
        root = container.find(".//{*}rootfile").get("full-path")
        for member in original.namelist():
            repaired.writestr(member, ET.tostring(xml, encoding="utf-8", xml_declaration=True)
                              if member == root else original.read(member))
    contents = target.getvalue()
    (SCORES / (digest + ".mxl")).write_bytes(contents)
    print(f"{name}: {len(part)} measures")
    return digest, [b64encode(contents).decode("ascii")]


if __name__ == "__main__":
    updates = {}
    for name in cursor["REVIEWED_REPAIRS"]:
        digest, encoded = repair(name)
        updates[digest] = encoded
    offline = SCORES / "offline.js"
    prefix = "globalThis.PianoOfflineScores = "
    existing = json.loads(offline.read_text(encoding="utf-8").removeprefix(prefix).strip().removesuffix(";"))
    existing.update(updates)
    offline.write_text(prefix + json.dumps(existing, separators=(",", ":")) + ";\n", encoding="utf-8")
