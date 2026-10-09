"""Bounded, read-only OOXML preflight. No workbook values are returned."""

from __future__ import annotations

import hashlib
import math
import os
from pathlib import Path
import re
import stat
import struct
import zlib
from dataclasses import dataclass, fields
from urllib.parse import unquote, urlsplit
from xml.parsers import expat
import zipfile


class SourceValidationError(ValueError):
    """An invalid or unsupported source; messages deliberately omit source data."""


@dataclass(frozen=True)
class SourceLimits:
    max_file_bytes: int = 32 * 1024 * 1024
    max_zip_entries: int = 2048
    max_central_directory_bytes: int = 2 * 1024 * 1024
    max_entry_uncompressed_bytes: int = 32 * 1024 * 1024
    max_total_uncompressed_bytes: int = 128 * 1024 * 1024
    max_compression_ratio: float = 200.0
    max_xml_depth: int = 128
    max_xml_attributes: int = 64
    max_attribute_characters: int = 32767
    max_worksheet_rows: int = 100000
    max_worksheet_columns: int = 16384
    max_cells_per_worksheet: int = 100000
    max_total_cells: int = 200000
    max_dimension_cells_per_worksheet: int = 100000
    max_total_dimension_cells: int = 200000
    max_merge_cells_per_worksheet: int = 100000
    max_total_merge_cells: int = 200000
    max_shared_strings: int = 200000
    max_string_characters: int = 32767
    max_text_node_characters: int = 1024 * 1024
    max_total_text_characters: int = 16 * 1024 * 1024


_SHEET_NS = {
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "http://purl.oclc.org/ooxml/spreadsheetml/main",
}
_CELL = re.compile(r"([A-Z]{1,3})([1-9][0-9]{0,6})\Z")
_OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_DANGEROUS = ("macro", "vba", "oleobject", "activex", "externallink", "connections")


def _fail(message: str) -> None:
    raise SourceValidationError(message)


def _safe_name(name: str, *, directory: bool = False) -> str:
    if not name or "\\" in name or any(ord(c) < 32 or ord(c) == 127 for c in name):
        _fail("Unsafe package entry name.")
    parts = name[:-1].split("/") if directory and name.endswith("/") else name.split("/")
    if any(p in ("", ".", "..") or ":" in p for p in parts):
        _fail("Unsafe package entry path.")
    return "/".join(parts)


def _check_dangerous_name(name: str) -> None:
    lowered = name.casefold()
    segments = set(lowered.split("/"))
    if segments & {"embeddings", "activex", "externallinks", "macrosheets", "dialogsheets"}:
        _fail("Embedded, macro, or external workbook content is not permitted.")
    if "vba" in lowered.rsplit("/", 1)[-1] or lowered.endswith("/connections.xml"):
        _fail("Embedded, macro, or external workbook content is not permitted.")


def _check_central_directory(stream, size: int, limits: SourceLimits) -> int:
    """Count directory records before ZipFile can allocate its entry objects."""
    tail_size = min(size, 65557)
    stream.seek(size - tail_size)
    tail = stream.read(tail_size)
    pos = tail.rfind(b"PK\x05\x06")
    if pos < 0 or len(tail) - pos < 22:
        _fail("Source is not a supported ZIP workbook.")
    _, disk, directory_disk, disk_count, entry_count, directory_size, directory_offset, comment_size = struct.unpack_from("<4s4H2IH", tail, pos)
    eocd_offset = size - tail_size + pos
    if pos + 22 + comment_size != len(tail):
        _fail("Invalid ZIP directory structure.")
    if disk or directory_disk or disk_count != entry_count:
        _fail("Multi-part ZIP workbooks are not supported.")
    if entry_count == 65535 or directory_size == 0xFFFFFFFF or directory_offset == 0xFFFFFFFF:
        _fail("ZIP64 workbooks are not supported by this preflight.")
    if not 0 < entry_count <= limits.max_zip_entries:
        _fail("ZIP entry count exceeds the allowed limit.")
    if directory_size > limits.max_central_directory_bytes:
        _fail("ZIP directory size exceeds the allowed limit.")
    if directory_offset + directory_size != eocd_offset:
        _fail("Invalid ZIP directory bounds.")
    stream.seek(directory_offset)
    end = directory_offset + directory_size
    counted = 0
    while stream.tell() < end:
        header = stream.read(46)
        if len(header) != 46 or header[:4] != b"PK\x01\x02":
            _fail("Invalid ZIP directory entry.")
        name_size, extra_size, comment_size = struct.unpack_from("<3H", header, 28)
        next_offset = stream.tell() + name_size + extra_size + comment_size
        counted += 1
        if counted > limits.max_zip_entries or next_offset > end:
            _fail("ZIP directory exceeds the allowed bounds.")
        stream.seek(next_offset)
    if counted != entry_count:
        _fail("ZIP directory entry count is inconsistent.")
    return counted


class _XmlInspector:
    def __init__(self, name: str, limits: SourceLimits, counts: dict, xml_names: set, xml_extensions: set):
        self.name, self.limits, self.counts = name, limits, counts
        self.xml_names, self.xml_extensions = xml_names, xml_extensions
        self.stack = []
        self.is_worksheet = False
        self.dimension = None
        self.cells = 0
        self.merge_cells = 0
        self.last_row = 0
        self.current_row = None
        self.last_column = 0
        self.max_actual_column = 0
        self.max_actual_row = 0
        self.string_depth = None
        self.string_characters = 0
        self.parser = expat.ParserCreate(namespace_separator="|")
        self.parser.StartElementHandler = self.start
        self.parser.EndElementHandler = self.end
        self.parser.CharacterDataHandler = self.characters
        self.parser.StartDoctypeDeclHandler = self.reject_declaration
        self.parser.EntityDeclHandler = self.reject_declaration
        self.parser.ExternalEntityRefHandler = self.reject_declaration
        self.parser.SetParamEntityParsing(expat.XML_PARAM_ENTITY_PARSING_NEVER)

    @staticmethod
    def reject_declaration(*_):
        _fail("XML DTD and entity declarations are not permitted.")

    def coordinate(self, value: str):
        match = _CELL.fullmatch(value)
        if not match:
            _fail("Invalid worksheet cell coordinate.")
        column = 0
        for letter in match[1]:
            column = column * 26 + ord(letter) - 64
        row = int(match[2])
        if row > self.limits.max_worksheet_rows or column > self.limits.max_worksheet_columns:
            _fail("Worksheet coordinate exceeds the allowed limit.")
        return column, row

    def relationship(self, attrs: dict):
        mode = attrs.get("TargetMode", "Internal").casefold()
        kind = attrs.get("Type", "").casefold()
        if mode != "internal" or any(token in kind for token in _DANGEROUS) or kind.endswith("/package"):
            _fail("External or embedded workbook relationships are not permitted.")
        target = attrs.get("Target", "")
        if not target or len(target) > self.limits.max_attribute_characters:
            _fail("Invalid workbook relationship target.")
        try:
            target = unquote(target, errors="strict")
            parsed = urlsplit(target)
        except (ValueError, UnicodeError):
            _fail("Invalid workbook relationship target.")
        if parsed.scheme or parsed.netloc or parsed.query or "\\" in target:
            _fail("External workbook relationship target is not permitted.")
        if any(ord(c) < 32 or ord(c) == 127 for c in target):
            _fail("Unsafe workbook relationship target.")
        base = self.name.rsplit("/_rels/", 1)[0].split("/") if "/_rels/" in self.name else []
        if parsed.path.startswith("/"):
            base = []
        for part in parsed.path.split("/"):
            if part in ("", "."):
                continue
            if part == "..":
                if not base:
                    _fail("Workbook relationship escapes the package.")
                base.pop()
            elif ":" in part:
                _fail("Unsafe workbook relationship target.")
            else:
                base.append(part)
        _check_dangerous_name("/".join(base))

    def start(self, qualified: str, attrs: dict):
        namespace, _, local = qualified.rpartition("|")
        if len(self.stack) >= self.limits.max_xml_depth or len(attrs) > self.limits.max_xml_attributes:
            _fail("XML structure exceeds the allowed limit.")
        if any(len(k) > self.limits.max_attribute_characters or len(v) > self.limits.max_attribute_characters for k, v in attrs.items()):
            _fail("XML attribute exceeds the allowed limit.")
        if not self.stack:
            self.is_worksheet = local == "worksheet" and namespace in _SHEET_NS
            if self.is_worksheet:
                self.counts["worksheets"] += 1
        self.stack.append([local, 0])
        if self.name == "[Content_Types].xml" and local in ("Default", "Override"):
            content_type = attrs.get("ContentType", "").casefold()
            if any(token in content_type for token in _DANGEROUS):
                _fail("Macro, embedded, or external content types are not permitted.")
            if content_type.endswith("+xml") or content_type in ("application/xml", "text/xml"):
                if "PartName" in attrs:
                    part = attrs["PartName"]
                    if not part.startswith("/"):
                        _fail("Invalid content type part name.")
                    self.xml_names.add(_safe_name(part[1:]))
                elif "Extension" in attrs:
                    self.xml_extensions.add(attrs["Extension"].casefold())
        if local == "Relationship":
            self.relationship(attrs)
        if namespace in _SHEET_NS and local in ("si", "is"):
            if self.string_depth is not None:
                _fail("Invalid nested workbook string.")
            self.string_depth = len(self.stack)
            self.string_characters = 0
            key = "sharedStrings" if local == "si" else "inlineStrings"
            self.counts[key] += 1
            if self.counts["sharedStrings"] > self.limits.max_shared_strings:
                _fail("Shared string count exceeds the allowed limit.")
        if not self.is_worksheet or namespace not in _SHEET_NS:
            return
        if local == "dimension":
            if self.dimension is not None or "ref" not in attrs:
                _fail("Invalid worksheet dimensions.")
            points = attrs["ref"].split(":")
            if len(points) not in (1, 2):
                _fail("Invalid worksheet dimensions.")
            first = self.coordinate(points[0])
            last = self.coordinate(points[-1])
            if first[0] > last[0] or first[1] > last[1]:
                _fail("Invalid worksheet dimensions.")
            # read-only consumers may iterate from row/column one, regardless of the minimum.
            area = last[0] * last[1]
            self.counts["dimensionCells"] += area
            if area > self.limits.max_dimension_cells_per_worksheet or self.counts["dimensionCells"] > self.limits.max_total_dimension_cells:
                _fail("Declared worksheet dimensions exceed the allowed limit.")
            self.dimension = (*first, *last)
        elif local == "row":
            value = attrs.get("r", str(self.last_row + 1))
            if not re.fullmatch(r"[1-9][0-9]{0,6}", value):
                _fail("Invalid worksheet row index.")
            index = int(value)
            if index <= self.last_row or index > self.limits.max_worksheet_rows or self.current_row is not None:
                _fail("Worksheet row order or bounds are invalid.")
            if self.dimension and index > self.dimension[3]:
                _fail("Worksheet row exceeds its declared dimensions.")
            self.last_row = self.current_row = index
            self.max_actual_row = max(self.max_actual_row, index)
            if self.max_actual_row * self.max_actual_column > self.limits.max_dimension_cells_per_worksheet:
                _fail("Actual worksheet dimensions exceed the allowed limit.")
            self.last_column = 0
        elif local == "c":
            if self.current_row is None:
                _fail("Worksheet cell is outside a row.")
            if "r" in attrs:
                column, row = self.coordinate(attrs["r"])
            else:
                column, row = self.last_column + 1, self.current_row
            if row != self.current_row or column <= self.last_column or column > self.limits.max_worksheet_columns:
                _fail("Worksheet cell order or bounds are invalid.")
            if self.dimension:
                min_col, min_row, max_col, max_row = self.dimension
                if not (min_col <= column <= max_col and min_row <= row <= max_row):
                    _fail("Worksheet cell exceeds its declared dimensions.")
            self.last_column = column
            self.max_actual_column = max(self.max_actual_column, column)
            if self.max_actual_row * self.max_actual_column > self.limits.max_dimension_cells_per_worksheet:
                _fail("Actual worksheet dimensions exceed the allowed limit.")
            self.cells += 1
            self.counts["cells"] += 1
            if self.cells > self.limits.max_cells_per_worksheet or self.counts["cells"] > self.limits.max_total_cells:
                _fail("Worksheet cell count exceeds the allowed limit.")
        elif local == "mergeCell":
            points = attrs.get("ref", "").split(":")
            if len(points) not in (1, 2):
                _fail("Invalid merged cell range.")
            first = self.coordinate(points[0])
            last = self.coordinate(points[-1])
            if first[0] > last[0] or first[1] > last[1]:
                _fail("Invalid merged cell range.")
            area = (last[0] - first[0] + 1) * (last[1] - first[1] + 1)
            self.merge_cells += area
            self.counts["mergedRanges"] += 1
            self.counts["mergedCells"] += area
            if self.merge_cells > self.limits.max_merge_cells_per_worksheet or self.counts["mergedCells"] > self.limits.max_total_merge_cells:
                _fail("Merged cell expansion exceeds the allowed limit.")
            self.max_actual_row = max(self.max_actual_row, last[1])
            self.max_actual_column = max(self.max_actual_column, last[0])
            if self.max_actual_row * self.max_actual_column > self.limits.max_dimension_cells_per_worksheet:
                _fail("Merged worksheet dimensions exceed the allowed limit.")
            if self.dimension and (first[0] < self.dimension[0] or first[1] < self.dimension[1] or last[0] > self.dimension[2] or last[1] > self.dimension[3]):
                _fail("Merged range exceeds its declared worksheet dimensions.")

    def characters(self, value: str):
        length = len(value)
        self.counts["textCharacters"] += length
        if self.counts["textCharacters"] > self.limits.max_total_text_characters:
            _fail("Workbook text exceeds the allowed total limit.")
        if self.stack:
            self.stack[-1][1] += length
            if self.stack[-1][1] > self.limits.max_text_node_characters:
                _fail("XML text node exceeds the allowed limit.")
        if self.string_depth is not None:
            self.string_characters += length
            if self.string_characters > self.limits.max_string_characters:
                _fail("Workbook string exceeds the allowed limit.")

    def end(self, qualified: str):
        namespace, _, local = qualified.rpartition("|")
        if self.string_depth == len(self.stack):
            self.string_depth = None
        if self.is_worksheet and namespace in _SHEET_NS and local == "row":
            self.current_row = None
        if self.is_worksheet and len(self.stack) == 1:
            if self.dimension:
                if self.max_actual_column > self.dimension[2] or self.max_actual_row > self.dimension[3]:
                    _fail("Actual worksheet extent exceeds its declared dimensions.")
            else:
                self.counts["dimensionCells"] += self.max_actual_row * self.max_actual_column
                if self.counts["dimensionCells"] > self.limits.max_total_dimension_cells:
                    _fail("Actual worksheet dimensions exceed the allowed total limit.")
        self.stack.pop()


def validate_workbook_source(source: Path, limits: SourceLimits = SourceLimits()) -> dict:
    """Validate a stable XLSX snapshot before opening it with a workbook reader.

    The caller must use the same unchanged source after validation. Formula text is
    parsed as inert XML text; this module neither calculates nor returns formulas.
    ZIP64, split ZIPs, embedded objects, macros, external relationships, DTDs and
    entity declarations are deliberately unsupported. No member is extracted.
    """
    if not isinstance(limits, SourceLimits):
        _fail("Invalid source limits.")
    for field in fields(limits):
        value = getattr(limits, field.name)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or (isinstance(value, float) and not math.isfinite(value)) or value <= 0:
            _fail("Source limits must be finite positive numbers.")
        if field.name != "max_compression_ratio" and not isinstance(value, int):
            _fail("Source count and size limits must be integers.")
    counts = dict(entries=0, files=0, compressedBytes=0, uncompressedBytes=0,
                  xmlParts=0, worksheets=0, cells=0, dimensionCells=0,
                  mergedRanges=0, mergedCells=0,
                  sharedStrings=0, inlineStrings=0, textCharacters=0)
    try:
        with Path(source).open("rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= limits.max_file_bytes:
                _fail("Source file type or size is outside the allowed limit.")
            expected_entries = _check_central_directory(stream, before.st_size, limits)
            stream.seek(0)
            digest = hashlib.sha256()
            hashed_bytes = 0
            for block in iter(lambda: stream.read(65536), b""):
                hashed_bytes += len(block)
                if hashed_bytes > limits.max_file_bytes or hashed_bytes > before.st_size:
                    _fail("Source grew during validation.")
                digest.update(block)
            with zipfile.ZipFile(stream) as archive:
                entries = archive.infolist()
                if len(entries) != expected_entries:
                    _fail("ZIP directory entry count is inconsistent.")
                counts["entries"] = len(entries)
                seen = set()
                by_name = {}
                for info in entries:
                    if info.orig_filename != info.filename:
                        _fail("Unsafe ZIP entry name encoding.")
                    name = _safe_name(info.filename, directory=info.is_dir())
                    folded = name.casefold()
                    if folded in seen:
                        _fail("Duplicate or ambiguous ZIP entry.")
                    seen.add(folded)
                    _check_dangerous_name(name)
                    file_type = stat.S_IFMT(info.external_attr >> 16)
                    if file_type not in (0, stat.S_IFREG, stat.S_IFDIR):
                        _fail("Special ZIP entries are not permitted.")
                    if info.flag_bits & 0x41:
                        _fail("Encrypted ZIP entries are not permitted.")
                    if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                        _fail("Unsupported ZIP compression method.")
                    if info.file_size > limits.max_entry_uncompressed_bytes:
                        _fail("ZIP entry size exceeds the allowed limit.")
                    if info.file_size > max(1, info.compress_size) * limits.max_compression_ratio:
                        _fail("ZIP compression ratio exceeds the allowed limit.")
                    counts["compressedBytes"] += info.compress_size
                    counts["uncompressedBytes"] += info.file_size
                    if counts["uncompressedBytes"] > limits.max_total_uncompressed_bytes:
                        _fail("ZIP expanded size exceeds the allowed total limit.")
                    if not info.is_dir():
                        counts["files"] += 1
                        by_name[info.filename] = info
                if "[Content_Types].xml" not in by_name or "xl/workbook.xml" not in by_name:
                    _fail("Required XLSX package parts are missing.")
                xml_names = {"[Content_Types].xml"}
                xml_extensions = {"xml", "rels"}
                order = ["[Content_Types].xml"] + [name for name in by_name if name != "[Content_Types].xml"]
                actual_total = 0
                for name in order:
                    info = by_name[name]
                    is_xml = name in xml_names or name.rsplit(".", 1)[-1].casefold() in xml_extensions
                    inspector = _XmlInspector(name, limits, counts, xml_names, xml_extensions) if is_xml else None
                    if inspector:
                        counts["xmlParts"] += 1
                    actual = 0
                    with archive.open(info) as member:
                        while True:
                            block = member.read(65536)
                            if not block:
                                break
                            if actual == 0 and block.startswith(_OLE_MAGIC):
                                _fail("OLE embedded content is not permitted.")
                            actual += len(block)
                            actual_total += len(block)
                            if actual > min(info.file_size, limits.max_entry_uncompressed_bytes) or actual_total > limits.max_total_uncompressed_bytes:
                                _fail("ZIP expanded data exceeds the allowed limit.")
                            if inspector:
                                inspector.parser.Parse(block, False)
                    if actual != info.file_size:
                        _fail("ZIP expanded entry size is inconsistent.")
                    if inspector:
                        inspector.parser.Parse(b"", True)
            after = os.fstat(stream.fileno())
            current = Path(source).stat()
            identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
            if identity(before) != identity(after) or identity(before) != identity(current):
                _fail("Source changed during validation.")
        return {"sourceSHA": digest.hexdigest(), "bytes": before.st_size, "zipManifest": counts}
    except SourceValidationError:
        raise
    except (OSError, ValueError, TypeError, OverflowError, RuntimeError, UnicodeError, EOFError, struct.error, zlib.error, zipfile.BadZipFile, expat.ExpatError):
        raise SourceValidationError("Source is not a valid supported XLSX package.") from None
