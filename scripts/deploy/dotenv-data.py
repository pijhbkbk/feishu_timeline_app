#!/usr/bin/env python3
"""Parse production dotenv files as data without invoking a shell.

The accepted format is intentionally smaller than the many incompatible
"dotenv" dialects: blank lines, whole-line comments, and one UTF-8
``UPPER_CASE_KEY=value`` assignment per line.  Values are preserved literally;
quotes, dollar signs, backticks, semicolons, and backslashes never gain shell
meaning.  Callers must select an explicit runtime profile, which also rejects
unknown keys.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
from typing import NoReturn
from urllib.parse import parse_qsl, unquote, urlsplit


MAX_FILE_BYTES = 1024 * 1024
KEY_RE = re.compile(r"[A-Z][A-Z0-9_]*\Z")
SAFE_EXEC_INHERIT = (
    "HOME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "PATH",
    "TZ",
)
SAFE_POSTGRES_QUERY_ENV = {
    "application_name": "PGAPPNAME",
    "channel_binding": "PGCHANNELBINDING",
    "connect_timeout": "PGCONNECT_TIMEOUT",
    "gssencmode": "PGGSSENCMODE",
    "sslmode": "PGSSLMODE",
    "target_session_attrs": "PGTARGETSESSIONATTRS",
}
IGNORED_PRISMA_POSTGRES_QUERY_KEYS = frozenset({"schema"})
POSTGRES_DATABASE_SELECTOR_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,62}\Z")

API_KEYS = frozenset(
    {
        "ATTACHMENT_STORAGE_ACTOR_MAX_BYTES",
        "ATTACHMENT_STORAGE_ACTOR_MAX_OBJECTS",
        "ATTACHMENT_STORAGE_ACTOR_WINDOW_MS",
        "ATTACHMENT_STORAGE_GLOBAL_MAX_BYTES",
        "ATTACHMENT_STORAGE_GLOBAL_MAX_OBJECTS",
        "ATTACHMENT_STORAGE_MIN_FREE_BYTES",
        "ATTACHMENT_STORAGE_PROJECT_MAX_BYTES",
        "ATTACHMENT_STORAGE_PROJECT_MAX_OBJECTS",
        "ATTACHMENT_STORAGE_PURGED_METADATA_RETENTION_MS",
        "ATTACHMENT_STORAGE_RECONCILE_BATCH_SIZE",
        "ATTACHMENT_STORAGE_RECONCILE_INTERVAL_MS",
        "ATTACHMENT_STORAGE_RECONCILIATION_LEASE_MS",
        "ATTACHMENT_STORAGE_RECONCILIATION_RETRY_MS",
        "ATTACHMENT_STORAGE_RESERVATION_TTL_MS",
        "AUTH_MOCK_ENABLED",
        "BUILD_TIME",
        "CLAMAV_HOST",
        "CLAMAV_MAX_SIGNATURE_AGE_HOURS",
        "CLAMAV_PORT",
        "CLAMAV_TIMEOUT_MS",
        "DATABASE_URL",
        "DEPLOYMENT_ENV",
        "DOWNLOAD_ADMISSION_GLOBAL_LIMIT",
        "DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT",
        "DOWNLOAD_ADMISSION_PER_TARGET_LIMIT",
        "DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS",
        "DOWNLOAD_ADMISSION_RATE_WINDOW_MS",
        "EXPECTED_BUILD_TIME",
        "EXPECTED_RELEASE",
        "EXPECTED_SOURCE_COMMIT",
        "EXPECTED_SOURCE_TREE",
        "FEISHU_APP_ID",
        "FEISHU_APP_SECRET",
        "FEISHU_AUTHORIZATION_ENDPOINT",
        "FEISHU_OAUTH_MAX_CONCURRENT_REQUESTS",
        "FEISHU_OAUTH_OVERALL_TIMEOUT_MS",
        "FEISHU_REDIRECT_URI",
        "FRONTEND_URL",
        "HOST",
        "MALWARE_SCANNER_PROVIDER",
        "NATIVE_AUTH_TRUSTED_PROXY_IP",
        "NODE_ENV",
        "NOTIFICATION_JOB_MAX_BYTES",
        "NOTIFICATION_MAX_RETRIES",
        "NOTIFICATION_MEMORY_DEDUPE_MAX_KEYS",
        "NOTIFICATION_MEMORY_QUEUE_MAX_JOBS",
        "NOTIFICATION_OVERDUE_SCAN_MS",
        "NOTIFICATION_QUEUE_ENABLED",
        "NOTIFICATION_QUEUE_POLL_MS",
        "NOTIFICATION_REDIS_QUEUE_MAX_JOBS",
        "NOTIFICATION_RETRY_DELAY_MS",
        "NOTIFICATION_SCAN_BATCH_SIZE",
        "NOTIFICATION_SCAN_MAX_ITEMS",
        "OAUTH_PROVIDER",
        "OBJECT_STORAGE_ACCESS_KEY",
        "OBJECT_STORAGE_BUCKET",
        "OBJECT_STORAGE_ENDPOINT",
        "OBJECT_STORAGE_LOCAL_ROOT",
        "OBJECT_STORAGE_PROVIDER",
        "OBJECT_STORAGE_SECRET_KEY",
        "PORT",
        "REDIS_URL",
        "RELEASE",
        "RUNTIME_COMMIT",
        "SESSION_COOKIE_NAME",
        "SESSION_TTL_SECONDS",
        "SUPPLIER_CATALOG_MAX_ITEMS",
        "SUPPLIER_MUTATION_MAX_REQUESTS",
        "SUPPLIER_MUTATION_WINDOW_MS",
        "UI_VERSION",
        "UPLOAD_ADMISSION_GLOBAL_LIMIT",
        "UPLOAD_ADMISSION_PER_ACTOR_LIMIT",
        "UPLOAD_ADMISSION_PER_TARGET_LIMIT",
        "UPLOAD_ADMISSION_RATE_MAX_REQUESTS",
        "UPLOAD_ADMISSION_RATE_WINDOW_MS",
    }
)

WEB_KEYS = frozenset(
    {
        "BUILD_TIME",
        "DEPLOYMENT_ENV",
        "EXPECTED_BUILD_TIME",
        "EXPECTED_RELEASE",
        "EXPECTED_SOURCE_COMMIT",
        "EXPECTED_SOURCE_TREE",
        "HOSTNAME",
        "NEXT_PUBLIC_API_BASE_URL",
        "NEXT_PUBLIC_APP_NAME",
        "NEXT_PUBLIC_ENABLE_MOCK_LOGIN",
        "NEXT_PUBLIC_FEISHU_APP_ID",
        "NEXT_PUBLIC_R26_V2_DATA_MODE",
        "NEXT_PUBLIC_R26_V2_PROTOTYPE",
        "NEXT_PUBLIC_UI_DATA_MODE",
        "NEXT_PUBLIC_UI_VERSION",
        "NODE_ENV",
        "PORT",
        "RELEASE",
        "RUNTIME_COMMIT",
        "V1_FALLBACK_ENABLED",
    }
)

STAGING_KEYS = API_KEYS | WEB_KEYS | frozenset(
    {
        "API_IMAGE_REPO",
        "API_MEM_LIMIT",
        "API_OPS_IMAGE_REPO",
        "API_PIDS_LIMIT",
        "COMPOSE_PROJECT_NAME",
        "POSTGRES_DB",
        "POSTGRES_PASSWORD",
        "POSTGRES_USER",
        "REDIS_PASSWORD",
        "STAGING_API_PORT",
        "STAGING_HTTP_PORT",
        "STAGING_POSTGRES_PORT",
        "STAGING_REDIS_PORT",
        "STAGING_WEB_PORT",
        "WEB_IMAGE_REPO",
    }
)

RELEASE_KEYS = frozenset(
    {
        "API_IMAGE_ID",
        "API_IMAGE_REPO",
        "API_OPS_IMAGE_ID",
        "API_OPS_IMAGE_REPO",
        "GIT_DIRTY",
        "GIT_SHA",
        "IMAGE_TAG",
        "NGINX_IMAGE",
        "NGINX_IMAGE_ID",
        "OCI_CREATED",
        "OCI_SOURCE",
        "OCI_VERSION",
        "POSTGRES_IMAGE_ID",
        "POSTGRES_IMAGE_REPO",
        "REDIS_IMAGE",
        "REDIS_IMAGE_ID",
        "RELEASED_AT",
        "ROLLED_BACK_AT",
        "WEB_IMAGE_ID",
        "WEB_IMAGE_REPO",
    }
)

PROFILES = {
    "api": API_KEYS,
    "release": RELEASE_KEYS,
    "staging": STAGING_KEYS,
    "web": WEB_KEYS,
}


class DotenvError(ValueError):
    """Raised when a dotenv file violates the strict data contract."""


def die(message: str) -> NoReturn:
    print(f"dotenv-data: {message}", file=sys.stderr)
    raise SystemExit(2)


def _read_regular_file(path: Path) -> bytes:
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
    except OSError as error:
        raise DotenvError(f"cannot safely open {path}: {error.strerror}") from error

    try:
        metadata = os.fstat(fd)
        if not stat.S_ISREG(metadata.st_mode):
            raise DotenvError(f"not a regular file: {path}")
        if metadata.st_size > MAX_FILE_BYTES:
            raise DotenvError(f"file exceeds {MAX_FILE_BYTES} bytes: {path}")
        chunks: list[bytes] = []
        remaining = MAX_FILE_BYTES + 1
        while remaining > 0:
            chunk = os.read(fd, min(65536, remaining))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        raw = b"".join(chunks)
        if len(raw) > MAX_FILE_BYTES:
            raise DotenvError(f"file exceeds {MAX_FILE_BYTES} bytes: {path}")
        return raw
    finally:
        os.close(fd)


def _check_value(value: str, *, label: str) -> None:
    if value != value.strip(" "):
        raise DotenvError(f"{label}: leading or trailing spaces are not allowed")
    for character in value:
        codepoint = ord(character)
        if codepoint < 0x20 or codepoint == 0x7F:
            raise DotenvError(f"{label}: control characters are not allowed")


def parse(path: Path, allowed_keys: frozenset[str]) -> tuple[dict[str, str], list[str]]:
    raw = _read_regular_file(path)
    if b"\x00" in raw:
        raise DotenvError(f"NUL bytes are not allowed: {path}")
    try:
        text = raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise DotenvError(f"file is not valid UTF-8: {path}") from error
    if "\r" in text:
        raise DotenvError(f"carriage returns are not allowed: {path}")
    for character in text:
        codepoint = ord(character)
        if character != "\n" and (codepoint < 0x20 or codepoint == 0x7F):
            raise DotenvError(f"control characters are not allowed: {path}")

    data: dict[str, str] = {}
    lines = text.split("\n")
    for line_number, line in enumerate(lines, start=1):
        if line == "" or line.startswith("#"):
            continue
        if "=" not in line:
            raise DotenvError(f"{path}:{line_number}: expected KEY=value")
        key, value = line.split("=", 1)
        if not KEY_RE.fullmatch(key):
            raise DotenvError(f"{path}:{line_number}: invalid key")
        if key not in allowed_keys:
            raise DotenvError(f"{path}:{line_number}: key is not allowed by profile: {key}")
        if key in data:
            raise DotenvError(f"{path}:{line_number}: duplicate key: {key}")
        _check_value(value, label=f"{path}:{line_number}:{key}")
        data[key] = value
    return data, lines


def profile_keys(name: str) -> frozenset[str]:
    try:
        return PROFILES[name]
    except KeyError as error:
        raise DotenvError(f"unknown profile: {name}") from error


def command_validate(arguments: argparse.Namespace) -> int:
    parse(Path(arguments.file), profile_keys(arguments.profile))
    return 0


def command_get(arguments: argparse.Namespace) -> int:
    allowed = profile_keys(arguments.profile)
    if arguments.key not in allowed:
        raise DotenvError(f"requested key is not allowed by profile: {arguments.key}")
    data, _ = parse(Path(arguments.file), allowed)
    if arguments.key not in data:
        raise DotenvError(f"requested key is missing: {arguments.key}")
    sys.stdout.write(data[arguments.key])
    return 0


def command_exec(arguments: argparse.Namespace) -> NoReturn:
    if not arguments.command:
        raise DotenvError("exec requires a command after --")
    command = arguments.command
    if command[0] == "--":
        command = command[1:]
    if not command:
        raise DotenvError("exec requires a command after --")
    data, _ = parse(Path(arguments.file), profile_keys(arguments.profile))
    # The profile is the authority for application configuration.  Do not let
    # an operator/root shell silently supplement it with API secrets,
    # NODE_OPTIONS, language-runtime preload controls, or other ambient data.
    environment = {
        key: os.environ[key]
        for key in SAFE_EXEC_INHERIT
        if key in os.environ
    }
    environment.update(data)
    os.execvpe(command[0], command, environment)


def _decode_uri_component(value: str, *, label: str, allow_empty: bool = False) -> str:
    if re.search(r"%(?![0-9A-Fa-f]{2})", value):
        raise DotenvError(f"{label}: invalid percent escape")
    try:
        decoded = unquote(value, encoding="utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise DotenvError(f"{label}: invalid UTF-8 percent encoding") from error
    if not allow_empty and not decoded:
        raise DotenvError(f"{label}: value is required")
    for character in decoded:
        codepoint = ord(character)
        if codepoint < 0x20 or codepoint == 0x7F:
            raise DotenvError(f"{label}: control characters are not allowed")
    return decoded


def _check_decoded_uri_component(value: str, *, label: str) -> None:
    for character in value:
        codepoint = ord(character)
        if codepoint < 0x20 or codepoint == 0x7F:
            raise DotenvError(f"{label}: control characters are not allowed")


def _safe_subprocess_environment() -> dict[str, str]:
    return {
        key: os.environ[key]
        for key in SAFE_EXEC_INHERIT
        if key in os.environ
    }


def _normalize_child_command(arguments: argparse.Namespace, allowed_names: set[str]) -> list[str]:
    command = list(arguments.command)
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise DotenvError("credential-safe exec requires a command after --")
    if Path(command[0]).name not in allowed_names:
        raise DotenvError("credential-safe exec received an unsupported client program")
    return command


def _parse_postgres_url(
    value: str,
    *,
    database_override: str | None = None,
) -> tuple[dict[str, str], str]:
    if any(character.isspace() for character in value):
        raise DotenvError("DATABASE_URL contains whitespace")
    parsed = urlsplit(value)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise DotenvError("DATABASE_URL must use the postgres or postgresql scheme")
    if parsed.fragment:
        raise DotenvError("DATABASE_URL fragments are not allowed")
    if parsed.hostname is None:
        raise DotenvError("DATABASE_URL must include an explicit host")
    try:
        port = parsed.port or 5432
    except ValueError as error:
        raise DotenvError("DATABASE_URL contains an invalid port") from error
    if not 1 <= port <= 65535:
        raise DotenvError("DATABASE_URL port is outside the valid range")

    username = _decode_uri_component(parsed.username or "", label="DATABASE_URL username")
    password = _decode_uri_component(
        parsed.password or "",
        label="DATABASE_URL password",
        allow_empty=True,
    )
    host = _decode_uri_component(parsed.hostname, label="DATABASE_URL host")
    database_raw = parsed.path[1:] if parsed.path.startswith("/") else parsed.path
    database = _decode_uri_component(database_raw, label="DATABASE_URL database")
    if "/" in database:
        raise DotenvError("DATABASE_URL database must be one path component")
    if database_override is not None:
        if not POSTGRES_DATABASE_SELECTOR_RE.fullmatch(database_override):
            raise DotenvError(
                "postgres-exec database selector must be a bounded PostgreSQL identifier"
            )
        database = database_override

    environment = {
        "PGDATABASE": database,
        "PGHOST": host,
        "PGPORT": str(port),
        "PGUSER": username,
    }
    seen_query_keys: set[str] = set()
    try:
        query_items = parse_qsl(
            parsed.query,
            keep_blank_values=True,
            strict_parsing=True,
            encoding="utf-8",
            errors="strict",
            max_num_fields=32,
        )
    except (UnicodeDecodeError, ValueError) as error:
        raise DotenvError("DATABASE_URL contains an invalid query string") from error
    for key, query_value in query_items:
        if key in seen_query_keys:
            raise DotenvError(f"DATABASE_URL contains a duplicate query key: {key}")
        seen_query_keys.add(key)
        _check_decoded_uri_component(key, label="DATABASE_URL query key")
        _check_decoded_uri_component(query_value, label=f"DATABASE_URL query value {key}")
        if key in IGNORED_PRISMA_POSTGRES_QUERY_KEYS:
            continue
        try:
            environment[SAFE_POSTGRES_QUERY_ENV[key]] = query_value
        except KeyError as error:
            raise DotenvError(f"DATABASE_URL query key is not allowed for maintenance tools: {key}") from error

    def pgpass_escape(component: str) -> str:
        return component.replace("\\", "\\\\").replace(":", "\\:")

    pgpass = ":".join(
        pgpass_escape(component)
        for component in (host, str(port), database, username, password)
    ) + "\n"
    return environment, pgpass


def command_postgres_exec(arguments: argparse.Namespace) -> int:
    command = _normalize_child_command(arguments, {"pg_dump", "pg_restore", "psql"})
    for argument in command[1:]:
        if argument in {"-d", "-h", "-p", "-U", "--dbname", "--host", "--port", "--username"} \
            or re.match(r"^-[dhpU].+", argument) \
            or re.match(r"^--(?:dbname|host|port|username)=", argument):
            raise DotenvError("postgres-exec command must not override the validated connection identity")

    allowed = profile_keys(arguments.profile)
    if arguments.key not in allowed:
        raise DotenvError(f"requested key is not allowed by profile: {arguments.key}")
    data, _ = parse(Path(arguments.file), allowed)
    if arguments.key not in data:
        raise DotenvError(f"requested key is missing: {arguments.key}")
    postgres_environment, pgpass_content = _parse_postgres_url(
        data[arguments.key],
        database_override=arguments.database,
    )
    environment = _safe_subprocess_environment()
    environment.update(postgres_environment)

    descriptor, pgpass_name = tempfile.mkstemp(prefix="feishu-timeline-pgpass-", dir="/tmp")
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb", closefd=True) as pgpass_file:
            pgpass_file.write(pgpass_content.encode("utf-8"))
            pgpass_file.flush()
            os.fsync(pgpass_file.fileno())
        environment["PGPASSFILE"] = pgpass_name
        completed = subprocess.run(
            [command[0], "--no-password", *command[1:]],
            env=environment,
            check=False,
        )
        return completed.returncode
    finally:
        try:
            os.close(descriptor)
        except OSError:
            pass
        try:
            os.unlink(pgpass_name)
        except FileNotFoundError:
            pass


def _parse_redis_url(value: str) -> tuple[list[str], str]:
    if any(character.isspace() for character in value):
        raise DotenvError("REDIS_URL contains whitespace")
    parsed = urlsplit(value)
    if parsed.scheme not in {"redis", "rediss"}:
        raise DotenvError("REDIS_URL must use the redis or rediss scheme")
    if parsed.fragment or parsed.query:
        raise DotenvError("REDIS_URL query strings and fragments are not allowed")
    if parsed.hostname is None:
        raise DotenvError("REDIS_URL must include an explicit host")
    try:
        port = parsed.port or 6379
    except ValueError as error:
        raise DotenvError("REDIS_URL contains an invalid port") from error
    if not 1 <= port <= 65535:
        raise DotenvError("REDIS_URL port is outside the valid range")
    host = _decode_uri_component(parsed.hostname, label="REDIS_URL host")
    username = _decode_uri_component(
        parsed.username or "",
        label="REDIS_URL username",
        allow_empty=True,
    )
    password = _decode_uri_component(
        parsed.password or "",
        label="REDIS_URL password",
        allow_empty=True,
    )
    database_raw = parsed.path[1:] if parsed.path.startswith("/") else parsed.path
    database = _decode_uri_component(
        database_raw or "0",
        label="REDIS_URL database",
    )
    if not database.isdigit() or not 0 <= int(database) <= 65535:
        raise DotenvError("REDIS_URL database must be a bounded non-negative integer")
    connection_arguments = ["-h", host, "-p", str(port), "-n", database]
    if username:
        connection_arguments.extend(["--user", username])
    if parsed.scheme == "rediss":
        connection_arguments.append("--tls")
    return connection_arguments, password


def command_redis_exec(arguments: argparse.Namespace) -> int:
    command = _normalize_child_command(arguments, {"redis-cli"})
    forbidden = {"-a", "--pass", "-u", "--uri", "-h", "-p", "-n", "--user", "--tls"}
    for argument in command[1:]:
        if argument in forbidden or re.match(r"^(?:-a|-u|-h|-p|-n).+", argument):
            raise DotenvError("redis-exec command must not override the validated connection identity")
    allowed = profile_keys(arguments.profile)
    if arguments.key not in allowed:
        raise DotenvError(f"requested key is not allowed by profile: {arguments.key}")
    data, _ = parse(Path(arguments.file), allowed)
    if arguments.key not in data:
        raise DotenvError(f"requested key is missing: {arguments.key}")
    connection_arguments, password = _parse_redis_url(data[arguments.key])
    environment = _safe_subprocess_environment()
    if password:
        environment["REDISCLI_AUTH"] = password
    completed = subprocess.run(
        [command[0], *connection_arguments, *command[1:]],
        env=environment,
        check=False,
    )
    return completed.returncode


def command_env0(arguments: argparse.Namespace) -> int:
    """Write validated key/value pairs separated by NUL bytes.

    This format is intended for a shell reader that assigns each already
    validated key and value with ``printf -v``.  It never emits shell program
    text, and values cannot contain the NUL delimiter.
    """

    data, _ = parse(Path(arguments.file), profile_keys(arguments.profile))
    output = sys.stdout.buffer
    for key, value in data.items():
        output.write(key.encode("ascii"))
        output.write(b"\x00")
        output.write(value.encode("utf-8"))
        output.write(b"\x00")
    output.flush()
    return 0


def command_keys0(arguments: argparse.Namespace) -> int:
    """Write every allowed profile key separated by NUL bytes."""

    output = sys.stdout.buffer
    for key in sorted(profile_keys(arguments.profile)):
        output.write(key.encode("ascii"))
        output.write(b"\x00")
    output.flush()
    return 0


def _parse_updates(items: list[str], allowed: frozenset[str]) -> dict[str, str]:
    updates: dict[str, str] = {}
    for item in items:
        if "=" not in item:
            raise DotenvError("--set values must use KEY=value")
        key, value = item.split("=", 1)
        if key not in allowed:
            raise DotenvError(f"updated key is not allowed by profile: {key}")
        if key in updates:
            raise DotenvError(f"duplicate --set key: {key}")
        _check_value(value, label=f"--set:{key}")
        updates[key] = value
    return updates


def _write_atomic(
    target: Path,
    content: bytes,
    *,
    mode: int,
    uid: int | None,
    gid: int | None,
    require_secure_parent: bool,
) -> None:
    parent = target.parent
    parent_metadata = os.lstat(parent)
    if not stat.S_ISDIR(parent_metadata.st_mode):
        raise DotenvError(f"target parent is not a directory: {parent}")
    if require_secure_parent:
        if parent_metadata.st_uid != 0:
            raise DotenvError(f"target parent is not root-owned: {parent}")
        if stat.S_IMODE(parent_metadata.st_mode) & 0o022:
            raise DotenvError(f"target parent is group/other writable: {parent}")
    try:
        target_metadata = os.lstat(target)
    except FileNotFoundError:
        target_metadata = None
    if target_metadata is not None and not stat.S_ISREG(target_metadata.st_mode):
        raise DotenvError(f"target is not a regular file: {target}")

    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=parent)
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, mode)
        if uid is not None or gid is not None:
            os.fchown(descriptor, -1 if uid is None else uid, -1 if gid is None else gid)
        with os.fdopen(descriptor, "wb", closefd=True) as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
        directory_fd = os.open(parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        raise


def command_rewrite(arguments: argparse.Namespace) -> int:
    allowed = profile_keys(arguments.profile)
    data, lines = parse(Path(arguments.source), allowed)
    updates = _parse_updates(arguments.set_values, allowed)
    if arguments.set_stdin is not None:
        if arguments.set_stdin not in allowed:
            raise DotenvError(
                f"stdin-updated key is not allowed by profile: {arguments.set_stdin}"
            )
        if arguments.set_stdin in updates:
            raise DotenvError(f"duplicate updated key: {arguments.set_stdin}")
        stdin_value = sys.stdin.buffer.read(MAX_FILE_BYTES + 1)
        if len(stdin_value) > MAX_FILE_BYTES:
            raise DotenvError("stdin value exceeds the size limit")
        if b"\x00" in stdin_value:
            raise DotenvError("stdin value contains NUL data")
        try:
            decoded_stdin_value = stdin_value.decode("utf-8", errors="strict")
        except UnicodeDecodeError as error:
            raise DotenvError("stdin value is not valid UTF-8") from error
        _check_value(decoded_stdin_value, label=f"--set-stdin:{arguments.set_stdin}")
        updates[arguments.set_stdin] = decoded_stdin_value
    deletes = set(arguments.delete)
    unknown_deletes = deletes - allowed
    if unknown_deletes:
        raise DotenvError(f"deleted key is not allowed by profile: {sorted(unknown_deletes)[0]}")

    output: list[str] = []
    seen_updates: set[str] = set()
    for line in lines:
        if line and not line.startswith("#") and "=" in line:
            key = line.split("=", 1)[0]
            if key in deletes:
                continue
            if key in updates:
                output.append(f"{key}={updates[key]}")
                seen_updates.add(key)
                continue
        output.append(line)
    while output and output[-1] == "":
        output.pop()
    for key, value in updates.items():
        if key not in seen_updates and key not in deletes:
            output.append(f"{key}={value}")

    rendered = ("\n".join(output) + "\n").encode("utf-8")
    # Reparse the exact bytes before replacing a managed file.
    temporary_validation_fd, temporary_validation_name = tempfile.mkstemp()
    try:
        with os.fdopen(temporary_validation_fd, "wb", closefd=True) as validation_file:
            validation_file.write(rendered)
        parse(Path(temporary_validation_name), allowed)
    finally:
        try:
            Path(temporary_validation_name).unlink()
        except FileNotFoundError:
            pass

    _write_atomic(
        Path(arguments.target),
        rendered,
        mode=int(arguments.mode, 8),
        uid=arguments.uid,
        gid=arguments.gid,
        require_secure_parent=arguments.require_secure_parent,
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    validate_parser = subparsers.add_parser("validate")
    validate_parser.add_argument("--profile", choices=sorted(PROFILES), required=True)
    validate_parser.add_argument("file")
    validate_parser.set_defaults(handler=command_validate)

    get_parser = subparsers.add_parser("get")
    get_parser.add_argument("--profile", choices=sorted(PROFILES), required=True)
    get_parser.add_argument("file")
    get_parser.add_argument("key")
    get_parser.set_defaults(handler=command_get)

    exec_parser = subparsers.add_parser("exec")
    exec_parser.add_argument("--profile", choices=sorted(PROFILES), required=True)
    exec_parser.add_argument("file")
    exec_parser.add_argument("command", nargs=argparse.REMAINDER)
    exec_parser.set_defaults(handler=command_exec)

    postgres_exec_parser = subparsers.add_parser("postgres-exec")
    postgres_exec_parser.add_argument("--profile", choices=sorted(PROFILES), required=True)
    postgres_exec_parser.add_argument("--key", default="DATABASE_URL")
    postgres_exec_parser.add_argument("--database")
    postgres_exec_parser.add_argument("file")
    postgres_exec_parser.add_argument("command", nargs=argparse.REMAINDER)
    postgres_exec_parser.set_defaults(handler=command_postgres_exec)

    redis_exec_parser = subparsers.add_parser("redis-exec")
    redis_exec_parser.add_argument("--profile", choices=sorted(PROFILES), required=True)
    redis_exec_parser.add_argument("--key", default="REDIS_URL")
    redis_exec_parser.add_argument("file")
    redis_exec_parser.add_argument("command", nargs=argparse.REMAINDER)
    redis_exec_parser.set_defaults(handler=command_redis_exec)

    env0_parser = subparsers.add_parser("env0")
    env0_parser.add_argument("--profile", choices=sorted(PROFILES), required=True)
    env0_parser.add_argument("file")
    env0_parser.set_defaults(handler=command_env0)

    keys0_parser = subparsers.add_parser("keys0")
    keys0_parser.add_argument("--profile", choices=sorted(PROFILES), required=True)
    keys0_parser.set_defaults(handler=command_keys0)

    rewrite_parser = subparsers.add_parser("rewrite")
    rewrite_parser.add_argument("--profile", choices=sorted(PROFILES), required=True)
    rewrite_parser.add_argument("--source", required=True)
    rewrite_parser.add_argument("--target", required=True)
    rewrite_parser.add_argument("--set", dest="set_values", action="append", default=[])
    rewrite_parser.add_argument("--set-stdin")
    rewrite_parser.add_argument("--delete", action="append", default=[])
    rewrite_parser.add_argument("--mode", default="0640")
    rewrite_parser.add_argument("--uid", type=int)
    rewrite_parser.add_argument("--gid", type=int)
    rewrite_parser.add_argument("--require-secure-parent", action="store_true")
    rewrite_parser.set_defaults(handler=command_rewrite)
    return parser


def main() -> int:
    arguments = build_parser().parse_args()
    try:
        return arguments.handler(arguments)
    except DotenvError as error:
        die(str(error))
    except OSError as error:
        die(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
