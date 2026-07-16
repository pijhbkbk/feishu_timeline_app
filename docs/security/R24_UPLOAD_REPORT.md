# R24 Upload Security Report

Final commit: `d86c04e8c016a0241172fb7c608f55d8dfcca5c9`

## Format and transport matrix

| Case | Result |
|---|---|
| PDF, JPG/JPEG, PNG | PASS with matching extension, MIME and magic bytes |
| DOCX, XLSX | PASS only with ZIP signature and expected OOXML markers |
| PHP, JSP, HTML, SVG, JavaScript, EXE, shell | REJECTED |
| Generic ZIP/archive | REJECTED |
| Double extension such as `evil.js.pdf` | REJECTED |
| MIME or magic-byte forgery | REJECTED |
| `/`, `\\`, `..` and encoded traversal | REJECTED |
| Markup, quotes, backticks, control characters in filename | REJECTED |
| More than one file, nested fields, excessive parts/headers | REJECTED by shared multipart transport policy |
| File above 20 MiB | REJECTED with 413 before controller |

## Storage, authorization and download

- The binary is stored through the object-storage abstraction under an opaque UUID storage key, outside the Web public tree. Staging uses a dedicated Docker object-storage volume.
- Database rows contain metadata and relationships, not the binary.
- Same-name uploads receive unique keys and do not overwrite an older binary.
- Version replacement records `versionNo` and `replacesAttachmentId`; history is retained.
- Upload, bind, unbind and delete require `attachment.manage` plus project authorization.
- Reads and downloads require project authorization; attachment lookup is project-bound.
- Download responses set `nosniff`, `private, no-store`, same-origin resource policy, encoded filename and `sandbox; default-src 'none'` CSP. Browser-executable formats are never previewable.
- Logical deletion retains binary/history for audit rather than overwriting evidence.

Unit, transport, IDOR, E2E and Playwright upload checks passed. Final upload-security status: `PASS`.
