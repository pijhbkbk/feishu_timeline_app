"""Synthetic, in-memory security tests. No real workbook content is included."""

from dataclasses import replace
import io
import stat
import struct
import types
import unittest
from unittest.mock import patch
import warnings
import zipfile

import source_guard as guard


NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
CONTENT_TYPES = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>'
WORKBOOK = '<workbook xmlns="' + NS + '"><sheets/></workbook>'
WORKSHEET = '<worksheet xmlns="' + NS + '"><dimension ref="A1"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>safe</t></is></c></row></sheetData></worksheet>'


def make_package(extra=(), worksheet=WORKSHEET, content_types=CONTENT_TYPES):
    stream = io.BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, value in [("[Content_Types].xml", content_types), ("xl/workbook.xml", WORKBOOK), ("xl/worksheets/sheet1.xml", worksheet), *extra]:
                archive.writestr(name, value)
    return stream.getvalue()


class _MemoryStream(io.BytesIO):
    def fileno(self):
        return 123


class _MemorySource:
    def __init__(self, blob):
        self.blob = blob

    def open(self, _mode):
        return _MemoryStream(self.blob)

    def stat(self):
        return types.SimpleNamespace(st_mode=stat.S_IFREG, st_size=len(self.blob), st_dev=1, st_ino=1, st_mtime_ns=0, st_ctime_ns=0)


class SourceGuardTests(unittest.TestCase):
    def validate(self, blob, limits=None):
        source = _MemorySource(blob)
        with patch.object(guard, "Path", lambda _: source), patch.object(guard.os, "fstat", lambda _: source.stat()):
            return guard.validate_workbook_source("synthetic", limits or guard.SourceLimits())

    def reject(self, blob, limits=None):
        with self.assertRaises(guard.SourceValidationError) as caught:
            self.validate(blob, limits)
        self.assertNotIn("synthetic", str(caught.exception))
        self.assertNotIn("example.invalid", str(caught.exception))

    def test_normal_package_and_inert_formula(self):
        result = self.validate(make_package())
        self.assertEqual(result["zipManifest"]["cells"], 1)
        self.assertEqual(result["zipManifest"]["worksheets"], 1)
        self.assertEqual(len(result["sourceSHA"]), 64)
        formula = WORKSHEET.replace('<is><t>safe</t></is>', '<f>HYPERLINK("https://example.invalid","label")</f>')
        self.validate(make_package(worksheet=formula))

    def test_entry_paths_and_duplicates(self):
        for name in ["../evil.xml", "/evil.xml", "x/../../evil.xml", "x\\evil.xml", "C:/evil.xml", "xl/workbook.xml", "XL/WORKBOOK.XML"]:
            with self.subTest(name=name):
                self.reject(make_package([(name, "<x/>")]))
        null_name = make_package([("evilX.xml", "<x/>")]).replace(b"evilX.xml", b"evil\0.xml")
        self.reject(null_name)

    def test_special_zip_entry(self):
        member = zipfile.ZipInfo("linked")
        member.create_system = 3
        member.external_attr = (stat.S_IFLNK | 0o777) << 16
        self.reject(make_package([(member, b"target")]))

    def test_macros_embedded_objects_and_connections(self):
        for name, data in [("xl/vbaProject.bin", b"abc"), ("xl/vbaData.xml", "<x/>"), ("xl/embeddings/data.bin", b"abc"), ("xl/connections.xml", "<x/>"), ("xl/externalLinks/externalLink1.xml", "<x/>"), ("other.bin", guard._OLE_MAGIC + b"abc")]:
            with self.subTest(name=name):
                self.reject(make_package([(name, data)]))
        for content_type in ["application/vnd.ms-excel.sheet.macroEnabled.main+xml", "application/vnd.ms-excel.macrosheet+xml", "application/vnd.ms-excel.vbaData+xml"]:
            with self.subTest(content_type=content_type):
                self.reject(make_package(content_types=CONTENT_TYPES.replace("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml", content_type)))

    def test_external_and_escaping_relationships(self):
        relationship = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="x" Target="https://example.invalid" TargetMode="External"/></Relationships>'
        for value in [relationship, relationship.replace(' TargetMode="External"', ''), relationship.replace('https://example.invalid', '../escape').replace(' TargetMode="External"', ''), relationship.replace('https://example.invalid', '%2e%2e/escape').replace(' TargetMode="External"', '')]:
            with self.subTest(value=value):
                self.reject(make_package([("_rels/.rels", value)]))

    def test_dtd_entities_and_declared_xml_parts(self):
        for value in ['<!DOCTYPE x><x/>', '<?xml version="1.0" encoding="utf-16"?><!DOCTYPE x [<!ENTITY e "x">]><x>&e;</x>']:
            with self.subTest(value=value):
                encoded = value.encode("utf-16") if "utf-16" in value else value
                self.reject(make_package([("custom.xml", encoded)]))
        content_types = CONTENT_TYPES.replace('</Types>', '<Override PartName="/custom.dat" ContentType="application/xml"/></Types>')
        self.reject(make_package([("custom.dat", '<!DOCTYPE x><x/>')], content_types=content_types))

    def test_actual_and_declared_coordinate_limits(self):
        variants = [
            WORKSHEET.replace('ref="A1"', 'ref="A1:A100001"'),
            WORKSHEET.replace('<dimension ref="A1"/>', '').replace('r="1"', 'r="100001"').replace('r="A1"', 'r="A100001"'),
            WORKSHEET.replace('<dimension ref="A1"/>', '').replace('r="A1"', 'r="XFE1"'),
            WORKSHEET.replace('<dimension ref="A1"/>', '').replace('r="A1"', 'r="CV1"').replace('</sheetData>', '<row r="100000"><c r="A100000"><v>1</v></c></row></sheetData>'),
            WORKSHEET.replace('r="A1"', 'r="B1"'),
            WORKSHEET.replace('<dimension ref="A1"/>', '').replace('r="A1"', 'r="B1"').replace('</worksheet>', '<dimension ref="A1"/></worksheet>'),
        ]
        for value in variants:
            with self.subTest(value=value):
                self.reject(make_package(worksheet=value))

    def test_merged_range_expansion_limits(self):
        for merge in ['A1:XFD1048576', 'A1:T30000', 'A1:B1']:
            value = WORKSHEET.replace('</worksheet>', '<mergeCells><mergeCell ref="' + merge + '"/></mergeCells></worksheet>')
            with self.subTest(merge=merge):
                self.reject(make_package(worksheet=value))
        safe = WORKSHEET.replace('ref="A1"', 'ref="A1:B1"').replace('</worksheet>', '<mergeCells><mergeCell ref="A1:B1"/></mergeCells></worksheet>')
        self.validate(make_package(worksheet=safe))

    def test_cell_limits(self):
        one_cell = replace(guard.SourceLimits(), max_total_cells=1, max_cells_per_worksheet=1)
        self.validate(make_package(), one_cell)
        two_cells = WORKSHEET.replace('ref="A1"', 'ref="A1:B1"').replace('</row>', '<c r="B1"><v>1</v></c></row>')
        self.reject(make_package(worksheet=two_cells), one_cell)

    def test_inline_shared_and_total_text_limits(self):
        self.reject(make_package(), replace(guard.SourceLimits(), max_string_characters=3))
        rich = WORKSHEET.replace('<t>safe</t>', '<r><t>abc</t></r><r><t>def</t></r>')
        self.reject(make_package(worksheet=rich), replace(guard.SourceLimits(), max_string_characters=5))
        shared = '<sst xmlns="' + NS + '"><si><r><t>abc</t></r><r><t>def</t></r></si></sst>'
        self.reject(make_package([('xl/sharedStrings.xml', shared)]), replace(guard.SourceLimits(), max_string_characters=5))
        self.reject(make_package(), replace(guard.SourceLimits(), max_total_text_characters=3))

    def test_container_limits(self):
        for option in ["max_file_bytes", "max_zip_entries", "max_entry_uncompressed_bytes", "max_total_uncompressed_bytes", "max_central_directory_bytes"]:
            with self.subTest(option=option):
                self.reject(make_package(), replace(guard.SourceLimits(), **{option: 1}))
        self.reject(make_package([("compressed.bin", b"a" * 200000)]))

    def test_implicit_dimensions_aggregate_limit(self):
        sparse = WORKSHEET.replace('<dimension ref="A1"/>', '').replace('r="1"', 'r="500"').replace('r="A1"', 'r="J500"')
        self.reject(make_package([('xl/worksheets/sheet2.xml', sparse)], worksheet=sparse), replace(guard.SourceLimits(), max_total_dimension_cells=6000))

    def test_empty_rows_cannot_escape_declared_dimensions(self):
        wide = WORKSHEET.replace('ref="A1"', 'ref="A1:Z1"').replace('r="A1"', 'r="Z1"')
        for index in (2, 100000):
            with self.subTest(index=index):
                with_empty_row = wide.replace('</sheetData>', '<row r="' + str(index) + '"/></sheetData>')
                self.reject(make_package(worksheet=with_empty_row))

    def test_source_change_and_corrupt_payload(self):
        blob = make_package()
        source = _MemorySource(blob)
        initial = source.stat()
        changed = source.stat()
        changed.st_mtime_ns = 1
        with patch.object(guard, 'Path', lambda _: source), patch.object(guard.os, 'fstat', side_effect=[initial, changed]):
            with self.assertRaises(guard.SourceValidationError):
                guard.validate_workbook_source('synthetic')
        corrupted = bytearray(blob)
        name_length, extra_length = struct.unpack_from('<HH', corrupted, 26)
        corrupted[30 + name_length + extra_length] ^= 0xFF
        self.reject(bytes(corrupted))

    def test_encryption_and_inconsistent_directory_count(self):
        encrypted = bytearray(make_package())
        for marker, offset in [(b"PK\x03\x04", 6), (b"PK\x01\x02", 8)]:
            index = encrypted.find(marker)
            encrypted[index + offset] |= 1
        self.reject(bytes(encrypted))
        inconsistent = bytearray(make_package())
        index = inconsistent.rfind(b"PK\x05\x06")
        struct.pack_into("<HH", inconsistent, index + 8, 2, 2)
        self.reject(bytes(inconsistent))


if __name__ == "__main__":
    unittest.main()
