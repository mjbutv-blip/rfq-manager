from __future__ import annotations

import base64
import io
import re
import zipfile
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET

import openpyxl
from PIL import Image, ImageOps


_DISPIMG_RE = re.compile(r'DISPIMG\("([^"]+)"')


def _data_url(raw: bytes) -> str | None:
    try:
        with Image.open(io.BytesIO(raw)) as source:
            image = ImageOps.exif_transpose(source)
            image.thumbnail((480, 480))
            out = io.BytesIO()
            if image.mode in {"RGBA", "LA"}:
                image.save(out, format="PNG", optimize=True)
                mime = "image/png"
            else:
                image.convert("RGB").save(out, format="JPEG", quality=78, optimize=True)
                mime = "image/jpeg"
    except Exception:
        return None
    return f"data:{mime};base64,{base64.b64encode(out.getvalue()).decode('ascii')}"


def _wps_cell_images(file_bytes: bytes) -> dict[str, bytes]:
    """Return WPS/Excel DISPIMG ids mapped to their embedded image bytes."""
    result: dict[str, bytes] = {}
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
            image_xml = ET.fromstring(archive.read("xl/cellimages.xml"))
            rels_xml = ET.fromstring(archive.read("xl/_rels/cellimages.xml.rels"))
            rels = {
                rel.attrib["Id"]: rel.attrib["Target"]
                for rel in rels_xml
                if rel.attrib.get("Id") and rel.attrib.get("Target")
            }
            for cell_image in image_xml:
                name = next((node.attrib.get("name") for node in cell_image.iter() if node.tag.endswith("cNvPr")), None)
                rel_id = next((node.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed") for node in cell_image.iter() if node.tag.endswith("blip")), None)
                target = rels.get(rel_id or "")
                if not name or not target:
                    continue
                path = str(PurePosixPath("xl") / target).replace("xl/../", "")
                result[name] = archive.read(path)
    except (KeyError, zipfile.BadZipFile, ET.ParseError):
        pass
    return result


def extract_excel_row_images(file_bytes: bytes, sheet_names: set[str] | None = None) -> dict[tuple[str, int], str]:
    """Extract one display-ready image per worksheet row.

    Supports both ordinary floating Excel images and WPS/Excel ``DISPIMG``
    in-cell images. The returned key is ``(sheet_name, one_based_row)``.
    """
    try:
        workbook = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=False)
    except Exception:
        return {}
    wps_images = _wps_cell_images(file_bytes)
    result: dict[tuple[str, int], str] = {}
    for sheet in workbook.worksheets:
        if sheet_names and sheet.title not in sheet_names:
            continue
        for image in getattr(sheet, "_images", []):
            anchor = getattr(image, "anchor", None)
            marker = getattr(anchor, "_from", None)
            if marker is None:
                continue
            try:
                encoded = _data_url(image._data())
            except Exception:
                encoded = None
            if encoded:
                result.setdefault((sheet.title, marker.row + 1), encoded)
        if wps_images:
            for cell in sheet._cells.values():
                if not isinstance(cell.value, str):
                    continue
                match = _DISPIMG_RE.search(cell.value)
                if not match:
                    continue
                encoded = _data_url(wps_images.get(match.group(1), b""))
                if encoded:
                    result[(sheet.title, cell.row)] = encoded
    return result


def inquiry_image_from_items(items) -> str | None:
    for item in items:
        extra = item.extra_data or {}
        image = extra.get("image_data_url")
        if isinstance(image, str) and image.startswith("data:image/"):
            return image
    return None
