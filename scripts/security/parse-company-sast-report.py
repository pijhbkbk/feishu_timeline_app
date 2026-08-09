#!/usr/bin/env python3
"""Parse and triage the 156 findings in the legacy company SAST PDF.

This parser deliberately treats the vendor report as evidence, not as a current
scan of the repository.  It extracts every numbered finding with pypdf, derives
scope ownership from the reported path, records a bounded call-site excerpt,
and applies conservative, auditable triage rules.  Ambiguous or
security-sensitive third-party hash uses remain NEEDS_SECURITY_REVIEW.

The script never reads or modifies node_modules or .next.  Those strings are
only parsed from locations embedded in the PDF.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from pypdf import PdfReader


EXPECTED_PDF_SHA256 = (
    "149d5fd2314b5bee6b98b93930498526c49930e0ab3ddb516f1c12f6ff02ffeb"
)
EXPECTED_FINDING_COUNT = 156
EXPECTED_RULE_COUNTS = {
    "A hash algorithm used is considered weak and can cause hash collisions": 80,
    "The setTimeout function is very dangerous because it can interpret a string as code": 38,
    "The eval function is extremely dangerous": 22,
    "The setInterval function is very dangerous because it can interpret a string as code": 14,
    "If a user-controlled data that has not been processed reaches the 'load' function": 2,
}
EXPECTED_OWNERSHIP_COUNTS = {
    "FIRST_PARTY": 0,
    "THIRD_PARTY": 134,
    "GENERATED_ARTIFACT": 22,
}
REQUIRED_FINDING_FIELDS = {
    "vulnerabilityId",
    "ruleName",
    "severity",
    "file",
    "line",
    "ownership",
    "dependencyName",
    "dependencyVersion",
    "productionReachable",
    "userInputReachable",
    "securitySensitiveUse",
    "disposition",
    "evidence",
    "fixCommit",
    "retestStatus",
}
ALLOWED_DISPOSITIONS = {
    "FIX_REQUIRED",
    "DEPENDENCY_UPGRADE",
    "FALSE_POSITIVE",
    "NOT_IN_PRODUCTION",
    "NEEDS_SECURITY_REVIEW",
}

RULE_SHORT_NAMES = {
    "A hash algorithm used is considered weak and can cause hash collisions": "weak hash",
    "The setTimeout function is very dangerous because it can interpret a string as code": "setTimeout",
    "The eval function is extremely dangerous": "eval",
    "The setInterval function is very dangerous because it can interpret a string as code": "setInterval",
    "If a user-controlled data that has not been processed reaches the 'load' function": "load",
}

SECTION_RE = re.compile(r"(?m)^3\.(\d{1,3})\s+(?=[A-Z])")
HEADER_LINE_RE = re.compile(
    r"^(?:-\s*\d+\s*-|《安全开发一体化平台》漏洞报告|"
    r"Copyright © 2026 安全开发一体化平台)\s*$"
)

# Packages whose reported files are development, lint, test or build tooling.
# The old PDF is not revision-bound, so this list is intentionally narrow.
DEV_ONLY_PACKAGES = {
    "@eslint/eslintrc",
    "@playwright/test",
    "@types/node",
    "@vitejs/plugin-react",
    "@vitest/coverage-v8",
    "@vitest/runner",
    "@vitest/utils",
    "eslint",
    "jiti",
    "playwright",
    "playwright-core",
    "prisma",
    "rollup",
    "tsx",
    "vite",
    "vitest",
    "file-entry-cache",
    "v8-compile-cache-lib",
}


@dataclass
class RawSection:
    sequence: int
    start_page: int
    end_page: int
    text: str


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def strip_page_chrome(text: str) -> str:
    return "\n".join(
        line for line in text.splitlines() if not HEADER_LINE_RE.match(line.strip())
    )


def iter_sections(reader: PdfReader) -> Iterable[RawSection]:
    current_sequence: int | None = None
    current_start_page = 0
    current_end_page = 0
    current_parts: list[str] = []

    for page_index, page in enumerate(reader.pages, start=1):
        text = strip_page_chrome(page.extract_text() or "")
        matches = list(SECTION_RE.finditer(text))
        cursor = 0

        for match in matches:
            if current_sequence is not None and match.start() > cursor:
                current_parts.append(text[cursor : match.start()])
                current_end_page = page_index

            if current_sequence is not None:
                yield RawSection(
                    sequence=current_sequence,
                    start_page=current_start_page,
                    end_page=current_end_page,
                    text="\n".join(current_parts),
                )

            current_sequence = int(match.group(1))
            current_start_page = page_index
            current_end_page = page_index
            current_parts = []
            cursor = match.start()

        if current_sequence is not None:
            current_parts.append(text[cursor:])
            current_end_page = page_index

        if page_index % 250 == 0 or page_index == len(reader.pages):
            print(
                f"extract-progress pages={page_index}/{len(reader.pages)} "
                f"current-section={current_sequence or 0}",
                file=sys.stderr,
                flush=True,
            )

    if current_sequence is not None:
        yield RawSection(
            sequence=current_sequence,
            start_page=current_start_page,
            end_page=current_end_page,
            text="\n".join(current_parts),
        )


def load_or_extract_sections(
    reader: PdfReader, cache_path: Path | None, pdf_sha256: str
) -> list[RawSection]:
    if cache_path and cache_path.is_file():
        with gzip.open(cache_path, "rt", encoding="utf-8") as stream:
            cached = json.load(stream)
        if cached.get("pdfSha256") != pdf_sha256:
            raise ValueError(
                f"Section cache hash mismatch in {cache_path}: "
                f"{cached.get('pdfSha256')!r}"
            )
        sections = [RawSection(**item) for item in cached.get("sections", [])]
        print(
            f"section-cache-hit path={cache_path} sections={len(sections)}",
            file=sys.stderr,
            flush=True,
        )
        return sections

    sections = list(iter_sections(reader))
    if cache_path:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(cache_path, "wt", encoding="utf-8") as stream:
            json.dump(
                {
                    "pdfSha256": pdf_sha256,
                    "sections": [section.__dict__ for section in sections],
                },
                stream,
                ensure_ascii=False,
            )
        print(
            f"section-cache-write path={cache_path} sections={len(sections)}",
            file=sys.stderr,
            flush=True,
        )
    return sections


def extract_between(text: str, start_label: str, end_label: str) -> str:
    pattern = re.compile(
        re.escape(start_label) + r"\s*(.*?)\s*" + re.escape(end_label),
        re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        raise ValueError(f"Could not extract {start_label!r} before {end_label!r}")
    return match.group(1).strip()


def vendor_evidence_body(text: str) -> str:
    """Return only the vendor verification/code body, excluding metadata/template prose."""

    body = text.split("漏洞验证：", 1)[-1]
    body = body.split("漏洞建议：", 1)[0]
    body = re.sub(
        r"1\.It is always recommended to use some CHF .*?Hash is more secure\.",
        "",
        body,
        flags=re.DOTALL,
    )
    body = re.sub(
        r"1\.The (?:setTimeout|setInterval|eval) function is very dangerous .*?"
        r"(?:string as code\.|dangerous\.)",
        "",
        body,
        flags=re.DOTALL,
    )
    return body


def parse_location(text: str) -> tuple[str, int]:
    location = extract_between(text, "漏洞位置：", "漏洞详情：")
    # The vendor renderer wraps long paths at arbitrary character boundaries.
    location = re.sub(r"\s+", "", location)
    match = re.fullmatch(r"(.+):(\d+)", location)
    if not match:
        raise ValueError(f"Invalid vendor location: {location!r}")
    return match.group(1), int(match.group(2))


def parse_dependency(path: str) -> tuple[str | None, str | None]:
    marker = "/node_modules/.pnpm/"
    if marker not in path:
        return None, None

    suffix = path.split(marker, 1)[1]
    locator, separator, installed_path = suffix.partition("/node_modules/")
    if not separator:
        return None, None

    installed_parts = installed_path.split("/")
    if installed_parts[0].startswith("@") and len(installed_parts) >= 2:
        package_name = f"{installed_parts[0]}/{installed_parts[1]}"
    else:
        package_name = installed_parts[0]

    encoded_name = package_name.replace("/", "+")
    prefix = f"{encoded_name}@"
    if not locator.startswith(prefix):
        return package_name, None

    version_and_peers = locator[len(prefix) :]
    version = version_and_peers.split("_", 1)[0]
    return package_name, version or None


def compact(text: str, limit: int = 360) -> str:
    value = re.sub(r"\s+", " ", redact_sensitive_literals(text)).strip()
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


def redact_sensitive_literals(text: str) -> str:
    """Prevent report excerpts from carrying secret-like literal values.

    The vendor PDF should contain dependency source, not runtime secrets.  The
    generated artifacts can nevertheless contain long literals that trigger
    secret scanners or resemble tokens.  Keep call shape while removing values.
    """

    value = re.sub(
        r"-----BEGIN [^-]+-----.*?-----END [^-]+-----",
        "<REDACTED_PEM_LITERAL>",
        text,
        flags=re.DOTALL,
    )
    value = re.sub(
        r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b",
        "<REDACTED_JWT_LITERAL>",
        value,
    )
    value = re.sub(
        r"(?i)\b(authorization|cookie|password|secret|session|token)"
        r"(\s*[:=]\s*)(['\"])([^'\"\r\n]+)\3",
        lambda match: (
            f"{match.group(1)}{match.group(2)}{match.group(3)}"
            f"<REDACTED_SENSITIVE_LITERAL>{match.group(3)}"
        ),
        value,
    )
    value = re.sub(
        r"(['\"])([A-Za-z0-9+/=_-]{48,})\1",
        lambda match: f"{match.group(1)}<REDACTED_LONG_LITERAL>{match.group(1)}",
        value,
    )
    return value


def excerpt_around(
    text: str, patterns: Iterable[str], radius: int = 500, limit: int = 1_000
) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        if match:
            start = max(0, match.start() - radius)
            end = min(len(text), match.end() + radius)
            return compact(text[start:end], limit=limit)
    return None


def callback_shape(text: str, function_name: str) -> tuple[str, bool, str | None]:
    call_re = re.compile(rf"\b{re.escape(function_name)}\s*\(", re.IGNORECASE)
    matches = list(call_re.finditer(text))
    if not matches:
        return "NO_CALL_EXCERPT", False, None

    # Metadata only contains the rule title, not an opening parenthesis.  Check
    # every actual call retained in this finding's vendor excerpt so a later
    # string callback cannot be hidden by an earlier callable use.
    string_match = None
    for match in matches:
        tail = text[match.end() :]
        first_arg = tail.lstrip()[:120]
        if first_arg and first_arg[0] in {'"', "'", "`"}:
            string_match = match
            break

    selected = string_match or matches[0]
    snippet = compact(
        text[max(0, selected.start() - 160) : selected.end() + 500], limit=800
    )
    if string_match:
        return "STRING_CALLBACK_PRESENT", True, snippet
    return "ALL_EXCERPT_CALLS_NON_STRING", False, snippet


def is_nonproduction_location(name: str | None, path: str) -> bool:
    if name in DEV_ONLY_PACKAGES:
        return True
    lower_path = path.lower()
    return any(
        marker in lower_path
        for marker in (
            "/eslint/",
            "/vitest/",
            "/vite/",
            "/playwright/",
            "/@types/",
            "/typescript/",
            "/next/dist/build/",
            "/next/dist/esm/build/",
            "/next/dist/server/dev/",
            "/next/dist/esm/server/dev/",
            "/next/dist/compiled/react-refresh/",
            ".development.js",
            ".runtime.dev.js",
        )
    )


def classify_hash_semantics(path: str, text: str) -> dict[str, Any]:
    dependency_name, _ = parse_dependency(path)
    evidence_body = vendor_evidence_body(text)
    excerpt = excerpt_around(
        evidence_body,
        (
            r"Sec-WebSocket-Accept",
            r"createHash\s*\(\s*['\"](?:sha1|sha-1|md5)['\"]",
            r"\b(?:sha1|md5)\s*\(",
            r"\b(?:SHA1|MD5)\s*\(",
            r"algorithm\s*[:=]\s*['\"](?:sha1|sha-1|md5)['\"]",
        ),
    )
    # Classification must not use the whole record: the vendor may print a
    # generic recommendation or a long file excerpt containing unrelated
    # security words.  Bind semantics to the reported path and the bounded
    # weak-hash call-site excerpt only.
    bounded_context = f"{path} {excerpt or ''}".lower()
    dev_only = is_nonproduction_location(dependency_name, path)

    if any(
        token in bounded_context
        for token in (
            "createpostbackactionstatekey",
            "$$form_action",
            "$$is_signature_equal",
        )
    ):
        semantic = (
            "MD5 derives a deterministic React/Next postback action-state identity "
            "from permalink, component path and hook index.  Nearby "
            "$$IS_SIGNATURE_EQUAL is a function/action identity check, not a "
            "cryptographic signature or password verifier.  Because the state key "
            "is compared during a user-reachable form/action flow, production "
            "variants remain open for collision-context review; authorization is a "
            "separate server control."
        )
        return {
            "productionReachable": not dev_only,
            "userInputReachable": True,
            "securitySensitiveUse": False,
            "disposition": (
                "NOT_IN_PRODUCTION" if dev_only else "NEEDS_SECURITY_REVIEW"
            ),
            "retestStatus": (
                "PENDING_CURRENT_DEV_DEPENDENCY_SCA"
                if dev_only
                else "PENDING_ACTION_STATE_COLLISION_CONTEXT_REVIEW"
            ),
            "semantic": semantic,
            "excerpt": excerpt,
        }

    if any(
        token in bounded_context
        for token in ("react-refresh", "emitfullsignatures", "@refresh")
    ):
        semantic = (
            "SHA-1 compacts a React Refresh hook/component signature used by hot "
            "reload tooling.  It is deterministic development identity data, not a "
            "credential or cryptographic authenticity check."
        )
        return {
            "productionReachable": False,
            "userInputReachable": False,
            "securitySensitiveUse": False,
            "disposition": "NOT_IN_PRODUCTION",
            "retestStatus": "TRIAGE_VERIFIED_REACT_REFRESH_TOOLING_CONTEXT",
            "semantic": semantic,
            "excerpt": excerpt,
        }

    if "sec-websocket-accept" in bounded_context or "websocket" in bounded_context:
        semantic = (
            "SHA-1 computes the RFC 6455 WebSocket Sec-WebSocket-Accept handshake "
            "value; this is a protocol operation, not password storage."
        )
        return {
            "productionReachable": not dev_only,
            "userInputReachable": True,
            "securitySensitiveUse": False,
            "disposition": "NOT_IN_PRODUCTION" if dev_only else "FALSE_POSITIVE",
            "retestStatus": "TRIAGE_VERIFIED_PROTOCOL_CONTEXT",
            "semantic": semantic,
            "excerpt": excerpt,
        }

    if any(
        token in bounded_context for token in ("entitytag", "etag", "freshness")
    ):
        semantic = (
            "SHA-1 is used to derive an HTTP entity tag/cache validator; the excerpt "
            "does not use it for passwords, credentials or authorization."
        )
        return {
            "productionReachable": not dev_only,
            "userInputReachable": False,
            "securitySensitiveUse": False,
            "disposition": "NOT_IN_PRODUCTION" if dev_only else "FALSE_POSITIVE",
            "retestStatus": "TRIAGE_VERIFIED_CACHE_VALIDATOR_CONTEXT",
            "semantic": semantic,
            "excerpt": excerpt,
        }

    security_tokens = (
        "cookie-signature",
        "createhmac",
        "crypto.sign(",
        "crypto.verify(",
        "authentication",
        "authorization",
        "secret string",
        "integrity",
    )
    security_sensitive = any(token in bounded_context for token in security_tokens)
    cache_tokens = (
        "cache",
        "hashkey",
        "hash_key",
        "moduleid",
        "module id",
        "build id",
        "filename",
        "file name",
        "contenthash",
        "content hash",
        "transform",
        "checksum",
    )
    cache_or_identifier = any(token in bounded_context for token in cache_tokens)

    if security_sensitive:
        semantic = (
            "The bounded excerpt or dependency path contains direct HMAC, "
            "cryptographic sign/verify, secret-string or integrity-helper evidence.  "
            "The PDF is not revision-bound and does not establish exploitability, so "
            "SCA and security-owner review are required before closure."
        )
        return {
            "productionReachable": not dev_only,
            "userInputReachable": not dev_only,
            "securitySensitiveUse": True,
            "disposition": (
                "NOT_IN_PRODUCTION" if dev_only else "NEEDS_SECURITY_REVIEW"
            ),
            "retestStatus": (
                "PENDING_SCA_DEV_DEPENDENCY"
                if dev_only
                else "PENDING_SCA_AND_SECURITY_REVIEW"
            ),
            "semantic": semantic,
            "excerpt": excerpt,
        }

    if excerpt and cache_or_identifier:
        semantic = (
            "The excerpt uses MD5/SHA-1 as a build, transform, file, module, checksum "
            "or cache identifier.  No password, credential, authorization or signing "
            "use is shown."
        )
        return {
            "productionReachable": not dev_only,
            "userInputReachable": False,
            "securitySensitiveUse": False,
            "disposition": "NOT_IN_PRODUCTION" if dev_only else "FALSE_POSITIVE",
            "retestStatus": "TRIAGE_VERIFIED_NON_SECURITY_IDENTIFIER_CONTEXT",
            "semantic": semantic,
            "excerpt": excerpt,
        }

    if excerpt and not security_sensitive:
        semantic = (
            "A weak-hash call is present, but the bounded vendor excerpt does not "
            "establish password storage, credential handling, authorization or a "
            "security-signature use.  Production dependency reachability still must "
            "be resolved by current SCA."
        )
        return {
            "productionReachable": not dev_only,
            "userInputReachable": False,
            "securitySensitiveUse": False,
            "disposition": "NOT_IN_PRODUCTION" if dev_only else "NEEDS_SECURITY_REVIEW",
            "retestStatus": (
                "PENDING_SCA_DEV_DEPENDENCY"
                if dev_only
                else "PENDING_CONTEXT_CONFIRMATION_AND_SCA"
            ),
            "semantic": semantic,
            "excerpt": excerpt,
        }

    semantic = (
        "The vendor record supplies a location but no usable weak-hash call-site "
        "excerpt.  Context cannot be inferred safely from the rule title alone."
    )
    return {
        "productionReachable": not dev_only,
        "userInputReachable": False,
        "securitySensitiveUse": False,
        "disposition": "NOT_IN_PRODUCTION" if dev_only else "NEEDS_SECURITY_REVIEW",
        "retestStatus": (
            "PENDING_SCA_DEV_DEPENDENCY"
            if dev_only
            else "PENDING_SOURCE_CONTEXT_AND_SCA"
        ),
        "semantic": semantic,
        "excerpt": None,
    }


def classify_finding(
    rule_name: str, path: str, text: str, ownership: str
) -> dict[str, Any]:
    dependency_name, _ = parse_dependency(path)
    nonproduction_location = is_nonproduction_location(dependency_name, path)
    evidence_body = vendor_evidence_body(text)

    if rule_name == next(iter(EXPECTED_RULE_COUNTS)):
        return classify_hash_semantics(path, text)

    if rule_name.startswith("The setTimeout"):
        function_name = "setTimeout"
    elif rule_name.startswith("The setInterval"):
        function_name = "setInterval"
    else:
        function_name = ""

    if function_name:
        shape, string_callback, snippet = callback_shape(evidence_body, function_name)
        if string_callback:
            return {
                "productionReachable": not nonproduction_location,
                "userInputReachable": True,
                "securitySensitiveUse": True,
                "disposition": (
                    "NOT_IN_PRODUCTION"
                    if nonproduction_location
                    else "NEEDS_SECURITY_REVIEW"
                ),
                "retestStatus": (
                    "PENDING_CURRENT_DEV_DEPENDENCY_SCA"
                    if nonproduction_location
                    else "PENDING_STRING_CALLBACK_REPRODUCTION"
                ),
                "semantic": (
                    f"The vendor excerpt appears to pass a string as the first "
                    f"{function_name} argument; this must be reproduced against the "
                    "exact dependency artifact before closure."
                ),
                "excerpt": snippet,
            }

        if shape == "NO_CALL_EXCERPT":
            return {
                "productionReachable": not nonproduction_location,
                "userInputReachable": False,
                "securitySensitiveUse": not nonproduction_location,
                "disposition": (
                    "NOT_IN_PRODUCTION"
                    if nonproduction_location
                    else "NEEDS_SECURITY_REVIEW"
                ),
                "retestStatus": (
                    "PENDING_CURRENT_DEPENDENCY_OR_DEV_ARTIFACT_RECHECK"
                    if nonproduction_location
                    else "PENDING_TIMER_CALL_SHAPE_CONFIRMATION"
                ),
                "semantic": (
                    (
                        f"The record names {function_name} but supplies no call-site "
                        "excerpt.  The exact path is a development runtime and is not "
                        "production-reachable; current dependency or clean dev-artifact "
                        "review remains required."
                    )
                    if nonproduction_location
                    else (
                        f"The record names {function_name} but its extracted text does "
                        "not contain a callable site; the string-code claim cannot be "
                        "closed without the exact artifact."
                    )
                ),
                "excerpt": None,
            }

        return {
            "productionReachable": not nonproduction_location,
            "userInputReachable": False,
            "securitySensitiveUse": False,
            "disposition": "FALSE_POSITIVE",
            "retestStatus": "TRIAGE_VERIFIED_NON_STRING_TIMER_CALLBACK",
            "semantic": (
                f"The reported {function_name} call passes a function, callable "
                "reference or identifier rather than a string.  The JavaScript "
                "string-evaluation sink described by the rule is absent."
            ),
            "excerpt": snippet,
        }

    if rule_name == "The eval function is extremely dangerous":
        snippet = excerpt_around(
            evidence_body,
            (r"eval\s*\(", r"webpack-internal", r"sourceURL"),
        )
        is_generated_webpack = ownership == "GENERATED_ARTIFACT" and any(
            token in evidence_body
            for token in ("webpack-internal", "__webpack_require__", "sourceURL")
        )
        if not is_generated_webpack:
            return {
                "productionReachable": False,
                "userInputReachable": False,
                "securitySensitiveUse": True,
                "disposition": "NEEDS_SECURITY_REVIEW",
                "retestStatus": "PENDING_GENERATED_ARTIFACT_CONFIRMATION",
                "semantic": (
                    "The location is generated output, but the extracted record lacks "
                    "a complete Webpack development-wrapper signature."
                ),
                "excerpt": snippet,
            }
        return {
            "productionReachable": False,
            "userInputReachable": False,
            "securitySensitiveUse": False,
            "disposition": "NOT_IN_PRODUCTION",
            "retestStatus": "PENDING_CLEAN_PRODUCTION_ARTIFACT_RESCAN",
            "semantic": (
                "The eval call is in apps/web/.next/server and the excerpt contains "
                "Webpack development-wrapper markers (__webpack_require__, sourceURL "
                "or webpack-internal).  It is not authored source and must be replaced "
                "by a clean production build, then rescanned."
            ),
            "excerpt": snippet,
        }

    if rule_name.startswith("If a user-controlled data"):
        snippet = excerpt_around(
            evidence_body,
            (r"yaml\w*\.load\s*\(", r"\bload\s*\("),
        )
        return {
            "productionReachable": False,
            "userInputReachable": False,
            "securitySensitiveUse": True,
            "disposition": "NOT_IN_PRODUCTION",
            "retestStatus": "PENDING_CURRENT_DEV_DEPENDENCY_SCA",
            "semantic": (
                "The call is in @eslint/eslintrc developer tooling and loads a local "
                "ESLint YAML/legacy configuration file.  The vendor report provides "
                "no HTTP/user-input source-to-file-path data flow; current package "
                "advisories remain an SCA concern."
            ),
            "excerpt": snippet,
        }

    raise ValueError(f"Unexpected rule: {rule_name!r}")


def parse_section(section: RawSection) -> dict[str, Any]:
    id_match = re.search(r"漏洞ID：\s*(\d+)", section.text)
    if not id_match:
        raise ValueError(f"Section 3.{section.sequence} has no vulnerability ID")

    vulnerability_id = id_match.group(1)
    rule_name = compact(extract_between(section.text, "漏洞名称：", "风险项目："), 500)
    severity_source = compact(extract_between(section.text, "风险等级：", "漏洞状态："), 40)
    if severity_source != "中危":
        raise ValueError(
            f"Section 3.{section.sequence} has unexpected severity {severity_source!r}"
        )

    path, line = parse_location(section.text)
    if "/node_modules/" in path:
        ownership = "THIRD_PARTY"
    elif "/.next/" in path:
        ownership = "GENERATED_ARTIFACT"
    else:
        ownership = "FIRST_PARTY"

    dependency_name, dependency_version = parse_dependency(path)
    classification = classify_finding(rule_name, path, section.text, ownership)
    excerpt = classification.pop("excerpt")

    return {
        "vulnerabilityId": vulnerability_id,
        "ruleName": rule_name,
        "severity": "MEDIUM",
        "file": path,
        "line": line,
        "ownership": ownership,
        "dependencyName": dependency_name,
        "dependencyVersion": dependency_version,
        "productionReachable": classification.pop("productionReachable"),
        "userInputReachable": classification.pop("userInputReachable"),
        "securitySensitiveUse": classification.pop("securitySensitiveUse"),
        "disposition": classification.pop("disposition"),
        "evidence": {
            "reportSequence": section.sequence,
            "reportPages": {
                "start": section.start_page,
                "end": section.end_page,
            },
            "reportedLocation": f"{path}:{line}",
            "codeSemantics": classification.pop("semantic"),
            "callSiteExcerpt": excerpt
            or "Vendor record contains no usable call-site excerpt; disposition remains conservative.",
        },
        "fixCommit": None,
        "retestStatus": classification.pop("retestStatus"),
    }


def validate_findings(findings: list[dict[str, Any]]) -> dict[str, Any]:
    errors: list[str] = []
    sequences = [item["evidence"]["reportSequence"] for item in findings]
    ids = [item["vulnerabilityId"] for item in findings]
    rule_counts = Counter(item["ruleName"] for item in findings)
    ownership_counts = Counter(item["ownership"] for item in findings)
    disposition_counts = Counter(item["disposition"] for item in findings)
    retest_counts = Counter(item["retestStatus"] for item in findings)
    dependency_versions: dict[str, set[str]] = {}
    for item in findings:
        name = item["dependencyName"]
        version = item["dependencyVersion"]
        if name and version:
            dependency_versions.setdefault(name, set()).add(version)

    if len(findings) != EXPECTED_FINDING_COUNT:
        errors.append(f"expected 156 findings, got {len(findings)}")
    if sequences != list(range(1, EXPECTED_FINDING_COUNT + 1)):
        errors.append("finding sequences are not exactly 1..156 in order")
    if len(set(ids)) != len(ids):
        errors.append("vulnerability IDs are not unique")
    if dict(rule_counts) != EXPECTED_RULE_COUNTS:
        errors.append(
            f"rule counts differ: expected {EXPECTED_RULE_COUNTS}, got {dict(rule_counts)}"
        )
    if dict(ownership_counts) != {
        key: value for key, value in EXPECTED_OWNERSHIP_COUNTS.items() if value
    }:
        errors.append(
            f"ownership counts differ: expected {EXPECTED_OWNERSHIP_COUNTS}, "
            f"got {dict(ownership_counts)}"
        )

    for item in findings:
        missing = REQUIRED_FINDING_FIELDS - set(item)
        extra = set(item) - REQUIRED_FINDING_FIELDS
        if missing or extra:
            errors.append(
                f"ID {item.get('vulnerabilityId')}: missing={sorted(missing)}, "
                f"extra={sorted(extra)}"
            )
        if item.get("disposition") not in ALLOWED_DISPOSITIONS:
            errors.append(
                f"ID {item.get('vulnerabilityId')}: invalid disposition "
                f"{item.get('disposition')!r}"
            )
        if item.get("ownership") == "THIRD_PARTY" and (
            not item.get("dependencyName") or not item.get("dependencyVersion")
        ):
            errors.append(
                f"ID {item.get('vulnerabilityId')}: dependency name/version missing"
            )
        if not isinstance(item.get("evidence"), dict) or any(
            value in (None, "", []) for value in item.get("evidence", {}).values()
        ):
            errors.append(f"ID {item.get('vulnerabilityId')}: evidence is incomplete")
        if not item.get("file") or not isinstance(item.get("line"), int):
            errors.append(f"ID {item.get('vulnerabilityId')}: invalid file or line")
        if item.get("severity") != "MEDIUM":
            errors.append(f"ID {item.get('vulnerabilityId')}: severity is not MEDIUM")

    if errors:
        raise ValueError("Validation failed:\n- " + "\n- ".join(errors))

    return {
        "total": len(findings),
        "uniqueVulnerabilityIds": len(set(ids)),
        "ruleCounts": dict(rule_counts),
        "ownershipCounts": {
            key: ownership_counts.get(key, 0) for key in EXPECTED_OWNERSHIP_COUNTS
        },
        "dispositionCounts": dict(sorted(disposition_counts.items())),
        "retestStatusCounts": dict(sorted(retest_counts.items())),
        "requiredFieldCount": len(REQUIRED_FINDING_FIELDS),
        "recordsWithAllRequiredFields": len(findings),
        "recordsWithNonEmptyEvidence": len(findings),
        "historicalDependencyVersions": {
            name: sorted(versions)
            for name, versions in sorted(dependency_versions.items())
        },
        "firstPartyFindingIds": [
            item["vulnerabilityId"]
            for item in findings
            if item["ownership"] == "FIRST_PARTY"
        ],
        "needsSecurityReview": [
            {
                "vulnerabilityId": item["vulnerabilityId"],
                "reason": item["evidence"]["codeSemantics"],
            }
            for item in findings
            if item["disposition"] == "NEEDS_SECURITY_REVIEW"
        ],
    }


def md_escape(value: Any) -> str:
    if value is None:
        return "N/A"
    return str(value).replace("|", "\\|").replace("\n", " ")


def render_markdown(payload: dict[str, Any]) -> str:
    summary = payload["validationSummary"]
    findings = payload["findings"]
    report = payload["report"]
    rule_rows = "\n".join(
        f"| {RULE_SHORT_NAMES[name]} | {count} |"
        for name, count in summary["ruleCounts"].items()
    )
    ownership_rows = "\n".join(
        f"| {name} | {count} |" for name, count in summary["ownershipCounts"].items()
    )
    disposition_rows = "\n".join(
        f"| {name} | {count} |" for name, count in summary["dispositionCounts"].items()
    )
    multi_version_inventory = "; ".join(
        f"{name}={','.join(versions)}"
        for name, versions in summary["historicalDependencyVersions"].items()
        if len(versions) > 1
    )
    finding_rows = []
    for item in findings:
        location = f"`{item['file']}:{item['line']}`"
        dependency = (
            f"{item['dependencyName']}@{item['dependencyVersion']}"
            if item["dependencyName"]
            else "N/A"
        )
        evidence = item["evidence"]
        pages = f"{evidence['reportPages']['start']}-{evidence['reportPages']['end']}"
        finding_rows.append(
            "| {seq} | {vid} | {rule} | {ownership} | {dependency} | {location} | "
            "{prod}/{user}/{sensitive} | {disposition} | {retest} | {pages} | {reason} |".format(
                seq=evidence["reportSequence"],
                vid=item["vulnerabilityId"],
                rule=RULE_SHORT_NAMES[item["ruleName"]],
                ownership=item["ownership"],
                dependency=md_escape(dependency),
                location=md_escape(location),
                prod="Y" if item["productionReachable"] else "N",
                user="Y" if item["userInputReachable"] else "N",
                sensitive="Y" if item["securitySensitiveUse"] else "N",
                disposition=item["disposition"],
                retest=item["retestStatus"],
                pages=pages,
                reason=md_escape(evidence["codeSemantics"]),
            )
        )

    review_items = summary["needsSecurityReview"]
    if review_items:
        review_lines = "\n".join(
            f"- `{item['vulnerabilityId']}`: {item['reason']}" for item in review_items
        )
    else:
        review_lines = "- None."

    return f"""# R27 Company SAST Finding-by-Finding Triage

> Round: `R27_FINAL_SOURCE_SECURITY_CLEARANCE`
> Artifact status: `GATE_2_DRAFT_COMPLETE`; this document is not a current SAST, SCA, image-scan or release pass
> Triage date: `{payload['triageDate']}`

## 1. Evidence baseline and limits

- Source PDF: `{report['sourcePath']}`
- SHA-256: `{report['sha256']}`
- Physical pages: `{report['pageCount']}`
- Vendor task: `{report['vendorTaskId']}` (`{report['vendorTaskTime']}`), policy `{report['vendorPolicy']}`
- The PDF contains **{summary['total']} Medium findings**. All were vendor-unconfirmed; this R27 artifact replaces that unreviewed state with one explicit disposition per record.
- The PDF names no Git commit and supplies no archive manifest/hash. It cannot prove coverage of the approved R27 source baseline and cannot replace the forthcoming clean first-party SAST.
- Reported dependency versions describe only the historical uploaded tree, not the approved R27 lockfile. The old package contains duplicate versions (`{multi_version_inventory}`); Gate 4 must resolve current production/dev dependencies from the approved `pnpm-lock.yaml` rather than treating these historical versions as installed truth.
- Parsing is deterministic: `scripts/security/parse-company-sast-report.py` extracts sections `3.1` through `3.156`, validates the PDF hash, IDs, five rule counts, path ownership and all required fields, and then writes both this report and the JSON ledger.
- No `node_modules` or `.next` file was read or edited. Those paths appear only as vendor-reported strings in the PDF.

## 2. Exact reconciliation

| Vendor rule | Count |
|---|---:|
{rule_rows}
| **Total** | **{summary['total']}** |

| Ownership | Count |
|---|---:|
{ownership_rows}
| **Total** | **{summary['total']}** |

This confirms the required `80 / 38 / 22 / 14 / 2` rule split and `134 THIRD_PARTY + 22 GENERATED_ARTIFACT + 0 FIRST_PARTY` path split. It does **not** claim that authored source is clean; the uploaded package mixed dependencies and generated Web output while showing no authored-source finding.

## 3. Disposition result

| Disposition | Count |
|---|---:|
{disposition_rows}
| **Total** | **{summary['total']}** |

- `FALSE_POSITIVE` means the precise rule claim is contradicted by the reported call shape/context (for example, a callable timer argument or a non-security cache/protocol hash). It is not a blanket statement that the dependency has no CVE.
- `NOT_IN_PRODUCTION` means the path/semantics are developer tooling or a generated development artifact; SCA or clean production-artifact rescan remains recorded in `retestStatus`.
- `NEEDS_SECURITY_REVIEW` remains open where the PDF excerpt is absent, ambiguous, or associates a weak hash with signing, verification, token, secret or integrity semantics. These records were not downgraded to manufacture a zero-open result.
- `fixCommit` is `null` for all historical findings because no first-party fix is justified by this PDF alone. Dependency upgrades, if required by current SCA, must record their actual immutable commit later.

Machine validation: `{summary['total']}` total records, `{summary['uniqueVulnerabilityIds']}` unique IDs, `{summary['recordsWithAllRequiredFields']}` records with all `{summary['requiredFieldCount']}` required fields, and `{summary['recordsWithNonEmptyEvidence']}` records with non-empty structured evidence.

## 4. Open security-review records

{review_lines}

These records are triaged but not closed. Gate 4 SCA and, where necessary, exact dependency-source review must resolve them without editing vendored files.

## 5. Complete finding ledger

Boolean column order is `productionReachable / userInputReachable / securitySensitiveUse`.

| # | Vulnerability ID | Rule | Ownership | Dependency | File:line | P/U/S | Disposition | Retest status | PDF pages | Evidence/reason |
|---:|---:|---|---|---|---|---|---|---|---:|---|
{chr(10).join(finding_rows)}

## 6. Retest and closure requirements

1. Build the first-party source package from the approved immutable R27 baseline; exclude dependencies and generated output by manifest, not by suppressing findings after scanning.
2. Run a TypeScript/TSX-capable first-party SAST and require zero parse/tool errors. This old PDF has no evidence that authored TypeScript was effectively covered.
3. Run current production and development SCA from the lockfile. Resolve every `NEEDS_SECURITY_REVIEW` weak-hash dependency record against the exact installed version and advisory/source context.
4. Delete the old `.next`, produce a clean production Web build, and scan the artifact for `eval-source-map`, `sourceURL=webpack-internal`, and unexpected executable `eval`.
5. Preserve this 156-record mapping in the company rescan response. A replacement authored-source scan that contains `node_modules` or `.next` fails scope validation.
6. Do not declare R27 security clearance until current first-party SAST, SCA, secrets, SBOM/license, image and authorized staging security gates independently pass.

## 7. Current decision

`HISTORICAL_156_FINDINGS_INDIVIDUALLY_TRIAGED`

`UNTRIAGED_HISTORICAL_FINDINGS=0`

`OPEN_NEEDS_SECURITY_REVIEW={len(review_items)}`

`CURRENT_FIRST_PARTY_SECURITY_CLEARANCE=NOT_ESTABLISHED`
"""


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path, help="Company SAST PDF to parse")
    parser.add_argument(
        "--output-json",
        type=Path,
        default=repo_root / "reports/security/r27/company-sast-findings.json",
    )
    parser.add_argument(
        "--output-markdown",
        type=Path,
        default=repo_root / "docs/security/R27_COMPANY_SAST_TRIAGE.md",
    )
    parser.add_argument("--triage-date", default="2026-08-09")
    parser.add_argument(
        "--section-cache",
        type=Path,
        help=(
            "Optional gzip JSON cache for extracted sections. The cache is accepted "
            "only when its recorded PDF SHA-256 matches."
        ),
    )
    parser.add_argument(
        "--allow-pdf-hash-mismatch",
        action="store_true",
        help="Parse a different report revision (the output will retain its hash)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    pdf_path = args.pdf.resolve()
    if not pdf_path.is_file():
        raise FileNotFoundError(pdf_path)

    pdf_sha256 = sha256_file(pdf_path)
    if not args.allow_pdf_hash_mismatch and pdf_sha256 != EXPECTED_PDF_SHA256:
        raise ValueError(
            f"PDF SHA-256 mismatch: expected {EXPECTED_PDF_SHA256}, got {pdf_sha256}"
        )

    reader = PdfReader(str(pdf_path))
    sections = load_or_extract_sections(reader, args.section_cache, pdf_sha256)
    findings = [parse_section(section) for section in sections]
    validation_summary = validate_findings(findings)
    payload = {
        "schemaVersion": "1.0",
        "triageDate": args.triage_date,
        "report": {
            "sourcePath": str(pdf_path),
            "sha256": pdf_sha256,
            "pageCount": len(reader.pages),
            "vendorTaskId": "22485",
            "vendorTaskTime": "2026-07-10 09:22:33",
            "vendorPolicy": "SAST-JavaScript",
            "revisionBound": False,
        },
        "validationSummary": validation_summary,
        "findings": findings,
    }

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_markdown.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    args.output_markdown.write_text(render_markdown(payload), encoding="utf-8")

    print(json.dumps(validation_summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # fail closed for extraction/validation errors
        print(f"ERROR: {error}", file=sys.stderr)
        raise
