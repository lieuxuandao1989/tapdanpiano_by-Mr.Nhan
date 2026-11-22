"""Check the generated practice files and pack them for offline use."""
import base64
import csv
import hashlib
import json
import math
import re
import shutil
import tempfile
import time
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile


ROOT = Path(__file__).resolve().parent
SCORES = ROOT / "Sheet Scores"
JOBS = Path(tempfile.gettempdir()) / "PhimNhip-Audiveris-jobs"
CHECKED = "cc7487e7a3dbf3a03879b734b5682b3cc8b030b5c94c59b50e00a37a95546233"
NON_MUSIC_PAGES = {
    "bai ca dat phuong nam truongca.com.pdf": {"3"},
    "ke o mien xa truongca.com.pdf": {"1", "4", "5"},
    "mua-xuan-dau-tien-tuan-khanh-truongca.com.pdf": {"3", "6", "7"},
}
RECOVERED_EXPORTS = {
    "cb35169680b0bc588fed9f7a36796065b05caa7cb9fa0021a7f720a95fcea53b": 12,
    "d42a589d2e09549927e9dfb7f14c9eaed1a57cc8d4ca0eb97d8c4e63bef78b53": 8,
}


def inspect(path):
    with ZipFile(path) as archive:
        container = ET.fromstring(archive.read("META-INF/container.xml"))
        rootfile = container.find(".//{*}rootfile")
        root = ET.fromstring(archive.read(rootfile.attrib["full-path"]))
    parts = root.findall("part")
    measures = root.findall("./part/measure")
    records = root.findall("./part/measure/note")
    pitches = [n for n in records if n.find("pitch") is not None]
    notes = [n for n in pitches if n.find("grace") is None]
    if not parts or not notes:
        raise ValueError("MusicXML không có nốt để tập")
    durations = [float(n.findtext("duration", "0")) for n in notes]
    invalid = sum(not math.isfinite(duration) or duration <= 0 for duration in durations)
    accidentals = sum(bool(float(n.findtext("pitch/alter", "0"))) for n in notes)
    pages = 1 + sum(m.find("print[@new-page='yes']") is not None for m in parts[0].findall("measure")[1:])
    return len(parts), len(measures), len(notes), accidentals, invalid, pages


def skipped_pages(digest, messages):
    found = set(re.findall(r"Sheet \w+#(\d+) flagged as invalid", messages))
    try:
        with ZipFile(JOBS / (digest + ".omr")) as archive:
            book = ET.fromstring(archive.read("book.xml"))
        found.update(sheet.attrib["number"] for sheet in book.findall("sheet[@invalid='true']"))
    except (OSError, BadZipFile, ET.ParseError, KeyError):
        pass
    return sorted(found, key=int)


def replace_file(staging, target):
    for attempt in range(5):
        try:
            staging.replace(target)
            return
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.2)


def main():
    SCORES.mkdir(exist_ok=True)
    bundle = {}
    results = []
    for pdf in sorted((ROOT / "Sheet Music").glob("*.pdf"), key=lambda p: p.name.casefold()):
        digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
        if digest == CHECKED:
            results.append([pdf.name, "Bản chép đã đối chiếu", 1, 55, "", "", 0, 1, "Trang 2 chỉ có lời"])
            continue
        single = SCORES / (digest + ".mxl")
        movements = list(SCORES.glob(digest + ".mvt*.mxl"))
        log = JOBS / (digest + ".run.log")
        if not single.is_file() and not movements and log.is_file():
            candidates = [p for p in JOBS.glob(digest + "*.mxl")
                          if re.fullmatch(digest + r"(?:\.mvt\d+)?\.mxl", p.name)]
            for candidate in candidates:
                target = SCORES / candidate.name
                with tempfile.NamedTemporaryFile(dir=SCORES, suffix=".tmp", delete=False) as temporary:
                    with candidate.open("rb") as source:
                        shutil.copyfileobj(source, temporary)
                replace_file(Path(temporary.name), target)
            movements = list(SCORES.glob(digest + ".mvt*.mxl"))
        paths = [single] if single.is_file() else sorted(movements, key=lambda p: int(p.stem.split(".mvt")[-1]))
        messages = log.read_text(encoding="utf-8", errors="replace") if log.is_file() else ""
        skipped = skipped_pages(digest, messages)
        warnings = []
        non_music = NON_MUSIC_PAGES.get(pdf.name, set())
        recognized_skip = [page for page in skipped if page in non_music]
        other_skip = [page for page in skipped if page not in non_music]
        if recognized_skip:
            warnings.append("Trang ngoài phần ký âm: " + ", ".join(recognized_skip))
        if other_skip:
            warnings.append("Audiveris bỏ qua trang " + ", ".join(other_skip))
        if "No target duration" in messages:
            warnings.append("Có ô nhịp chưa xác định đủ phách")
        recovered = RECOVERED_EXPORTS.get(hashlib.sha256(single.read_bytes()).hexdigest()) if single.is_file() else None
        if recovered:
            warnings.append(f"Xuất lại được {recovered} nốt sau khi bỏ ký hiệu cường độ gây lỗi")
        elif "Error visiting Measure" in messages:
            warnings.append("Audiveris báo lỗi khi xuất ô nhịp")
        remarks = ". ".join(warnings)
        if not paths:
            status = "Audiveris chưa xuất được" if log.is_file() else "Chưa có MusicXML"
            results.append([pdf.name, status, "", "", "", "", "", "", remarks])
            continue
        try:
            stats = [inspect(path) for path in paths]
            parts, measures, notes, accidentals, invalid, pages = map(sum, zip(*stats))
            bundle[digest] = [base64.b64encode(path.read_bytes()).decode("ascii") for path in paths]
            status = "Có trường độ lỗi" if invalid else "Đọc được MusicXML"
            results.append([pdf.name, status, parts, measures, notes, accidentals, invalid, pages, remarks])
        except (BadZipFile, ET.ParseError, ValueError, KeyError, AttributeError) as error:
            results.append([pdf.name, str(error), "", "", "", "", "", "", ""])
    content = "globalThis.PianoOfflineScores = " + json.dumps(bundle, separators=(",", ":")) + ";\n"
    with tempfile.NamedTemporaryFile(mode="w", dir=SCORES, suffix=".tmp", encoding="utf-8", delete=False) as file:
        file.write(content)
    replace_file(Path(file.name), SCORES / "offline.js")
    with tempfile.NamedTemporaryFile(mode="w", dir=SCORES, suffix=".tmp", encoding="utf-8-sig", newline="", delete=False) as file:
        output = csv.writer(file)
        output.writerow(["PDF", "Trạng thái", "Bè", "Ô nhịp theo bè", "Nốt", "Nốt có thăng hoặc giáng",
                         "Trường độ lỗi", "Trang MusicXML", "Ghi chú"])
        output.writerows(results)
    replace_file(Path(file.name), SCORES / "ket-qua.csv")
    print(f"{len(bundle)} readable MusicXML + 1 checked transcription / {len(results)} PDFs")


if __name__ == "__main__":
    main()
