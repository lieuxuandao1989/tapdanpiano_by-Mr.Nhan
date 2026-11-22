"""Prepare staff bands for detecting chords in PDFs without a bass clef."""
import hashlib
import json
import runpy
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageOps

cursor = runpy.run_path(str(Path(__file__).with_name("build-score-cursors.py")))
ROOT, JOBS, SCORES = (cursor[key] for key in ("ROOT", "JOBS", "SCORES"))
out = ROOT / ".omr-runtime" / "chords"
out.mkdir(parents=True, exist_ok=True)
manifest = {}
for file in (ROOT / "Sheet Music").glob("*.pdf"):
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    movements = list(SCORES.glob(f"{digest}*.mxl"))
    if not movements or any(clef.text == "F" for move in movements
                            for clef in cursor["musicxml"](move).findall(".//clef/sign")):
        continue
    book_path = JOBS / f"{digest}.omr"
    if not book_path.is_file():
        continue
    with cursor["ZipFile"](book_path) as book:
        book_xml = cursor["ET"].fromstring(book.read("book.xml"))
        pages = {}
        for score in book_xml.findall("score"):
            for page, (width, height), gap, system in cursor["source_systems"](book, score):
                for staff in system.findall("part/staff")[:1]:
                    bounds = cursor["staff_geometry"](staff)
                    if not bounds:
                        continue
                    top, bottom = bounds
                    row = {"left": float(staff.get("left")) / width, "right": float(staff.get("right")) / width,
                           "top": top / height, "bottom": bottom / height, "gap": gap / height}
                    pages.setdefault(page, []).append(row)
    data = []
    for page, rows in sorted(pages.items()):
        image_path = out / f"{digest}-{page}.png"
        with tempfile.TemporaryDirectory(prefix="piano-chord-") as temp:
            prefix = str(Path(temp) / "page")
            subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-scale-to", "2500",
                            "-singlefile", "-png", str(file), prefix], check=True)
            with Image.open(prefix + ".png") as image:
                strips = []
                offset = 0
                for row in rows:
                    top = max(0, round((row["top"] - row["gap"] * 3.65) * image.height))
                    bottom = min(image.height, round((row["top"] + row["gap"] * .08) * image.height))
                    if bottom <= top:
                        continue
                    band = ImageOps.autocontrast(ImageOps.grayscale(image.crop((0, top, image.width, bottom))), cutoff=1)
                    strips.append((band, offset))
                    row["crop"] = [offset, top, band.height, image.width, image.height]
                    offset += band.height + 40
                if strips:
                    composite = Image.new("L", (image.width, offset), 255)
                    for band, y in strips:
                        composite.paste(band, (0, y))
                    composite.save(image_path)
        data.append({"page": page, "rows": rows, "symbols": []})
    manifest[digest] = {"name": file.name, "pages": data}
(out / "bands.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
