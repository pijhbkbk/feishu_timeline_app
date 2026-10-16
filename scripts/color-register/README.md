# Private workbook parser proposal

This read-only local CLI extracts an XLSX source and creates a private normalized JSON candidate. It does not calculate formulas, author an XLSX, import database records, advance workflows, or open external links. Source text and policy notes are data, never instructions.

Runtime dependency: Python 3.12 and `openpyxl==3.1.5`; all other imports use the standard library. The proposal was exercised with Python 3.12.14. No network or spreadsheet application is required.

```sh
python3 parse_workbook.py --input /path/to/source.xlsx --output-dir /path/to/new-private-output --mapping workbook-format.mapping.json
python3 -m unittest test_source_guard test_parser_preservation -v
```

The output directory must not exist; its parent must exist. The CLI creates a private staging directory, writes with 0700 directory / 0600 file permissions, validates the mapping, and publishes the directory only after success. Failure removes only that call's staging directory. Existing output is rejected. Direct library callers of `extract_workbook` must supply an equivalent fresh private directory and a shared JSON output budget.

Files suitable for source integration are `parse_workbook.py`, `extract_workbook.py`, `normalize_workbook.py`, `source_guard.py`, `io_utils.py`, `requirements.txt`, and the two synthetic test modules. `workbook-format.mapping.json` is explicit source-layout configuration: worksheet sections, column/header mappings and the authorized shared-hue rule. It contains no source hash, source path, measurement values, production counts, people or vendor records. A different layout requires a reviewed mapping; header mismatch is rejected rather than guessed.

`normalized-candidate.json` uses schema `source-analysis-candidate-v2`. It includes every worksheet, rectangular row/cell, source storage value, formula/cached result, number format, merge anchor, hidden metadata and row preservation ledger, plus base records, multiangle measurements and auxiliary/production candidates. The original ZIP parts are preserved byte-for-byte under `source-ooxml`; styles/shared strings are also embedded. Source hashes and mapping hashes are calculated at runtime.

The identity key is `(sourceSha256, candidate.id)`. Candidate IDs alone are not globally unique. Only explicit `hueRules` group records; all other records remain separate. Even an exact name/base match in a production row is a pending suggestion, not an approved join or standard-board version. Missing values remain missing; explicit zero, slash marker and absent source column remain distinguishable. Actual source merges may supply an effective anchor value; ordinary blanks are never forward-filled. Numbers above a nominal display range are retained for review, never clamped.

The preflight denies macros, embedded OLE/package content, external relationships/connections, XML DTD/entities, encrypted/split/ZIP64 archives, unsafe or duplicate ZIP paths, unsupported compression, invalid coordinates and configured resource-limit violations. Formula strings are inert: even a formula containing a link is retained as text, not evaluated. The SHA comparison and in-memory snapshot bind openpyxl to the validated source bytes.

Default limits are explicit in `SourceLimits`: 32 MiB source / entry, 2,048 ZIP entries, 128 MiB expanded ZIP, 200:1 compression ratio, 100,000 rectangle cells per sheet and 200,000 per workbook; equivalent native-cell and merged-expansion limits; 32,767 characters per shared/inline string and 16 MiB total XML text. XML depth and attributes also have limits. The CLI separately limits mapping JSON to 1 MiB and **combined** emitted JSON to 128 MiB. Limits reject the file; they do not truncate or silently discard rows.

The tests use synthetic OOXML only. They cover rejected containers/links/macros/entities/resource expansion, raw formula plus deliberately different cached result, declared blank extents, merges, implicit vs explicit blanks, dates with hidden time, hidden rows/columns, boolean-vs-number distinction, incomplete retained candidates, literal slash, zero values, output permissions, staging cleanup, existing-output refusal and cumulative JSON limits.

This is an integration proposal. Application authorization, domain import transactions, source-version idempotency, accepted version relationships, audit and user-facing import review still belong to the existing application service.
