#!/usr/bin/env python3
"""Validate migration archives and trees without following filesystem links."""

from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tarfile
from typing import BinaryIO, Iterator, NoReturn


MAX_ARCHIVE_BYTES = 10 * 1024**4
MAX_MEMBER_COUNT = 1_000_000
MAX_EXPANDED_BYTES = 10 * 1024**4
AT_FDCWD = -100
RENAME_EXCHANGE = 2


class ArchiveDataError(ValueError):
    """Raised when migration data crosses the regular-file-only boundary."""


def die(message: str) -> NoReturn:
    print(f"archive-data: {message}", file=sys.stderr)
    raise SystemExit(2)


def _has_control(value: str) -> bool:
    return any(ord(character) < 0x20 or ord(character) == 0x7F for character in value)


def _open_private_archive(path: Path, allowed_uids: set[int]) -> tuple[int, os.stat_result]:
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise ArchiveDataError(f"cannot safely open archive {path}: {error.strerror}") from error

    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise ArchiveDataError(f"archive is not a regular file: {path}")
        if metadata.st_uid not in allowed_uids:
            raise ArchiveDataError(f"archive owner is not approved: {path}")
        if stat.S_IMODE(metadata.st_mode) & 0o077:
            raise ArchiveDataError(f"archive must not be accessible by group/other: {path}")
        if metadata.st_size <= 0 or metadata.st_size > MAX_ARCHIVE_BYTES:
            raise ArchiveDataError(f"archive size is outside the supported bound: {path}")
        return descriptor, metadata
    except BaseException:
        os.close(descriptor)
        raise


def _normalized_member_name(member: tarfile.TarInfo) -> str:
    raw = member.name
    if not raw or _has_control(raw) or raw.startswith("/"):
        raise ArchiveDataError(f"unsafe archive member name: {raw!r}")

    while raw.startswith("./"):
        raw = raw[2:]
    if member.isdir():
        raw = raw.rstrip("/")
    if raw in {"", "."}:
        if member.isdir():
            return "."
        raise ArchiveDataError("archive root member must be a directory")

    parts = raw.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise ArchiveDataError(f"archive member is not a normalized relative path: {member.name!r}")
    return "/".join(parts)


def command_validate_archive(arguments: argparse.Namespace) -> int:
    path = Path(arguments.archive)
    descriptor, _ = _open_private_archive(path, set(arguments.allowed_uid))
    seen: set[str] = set()
    count = 0
    expanded_size = 0

    try:
        with os.fdopen(descriptor, "rb", closefd=True) as source:
            try:
                archive = tarfile.open(fileobj=source, mode="r:*")
            except (tarfile.TarError, OSError) as error:
                raise ArchiveDataError(f"invalid tar archive: {path}") from error
            with archive:
                for member in archive:
                    count += 1
                    if count > MAX_MEMBER_COUNT:
                        raise ArchiveDataError("archive contains too many members")
                    normalized = _normalized_member_name(member)
                    if normalized in seen:
                        raise ArchiveDataError(f"duplicate archive member: {normalized}")
                    seen.add(normalized)

                    if not (member.isdir() or member.isfile()):
                        raise ArchiveDataError(
                            f"archive member is not a regular file or directory: {normalized}"
                        )
                    if member.isfile():
                        if member.size < 0:
                            raise ArchiveDataError(f"archive member has a negative size: {normalized}")
                        expanded_size += member.size
                        if expanded_size > MAX_EXPANDED_BYTES:
                            raise ArchiveDataError("archive expands beyond the supported bound")
    except BaseException:
        # fdopen owns the descriptor after successful construction.  If it did
        # not take ownership, closing an already-closed descriptor is harmless.
        try:
            os.close(descriptor)
        except OSError:
            pass
        raise
    return 0


def _copy_or_hash_regular_file(
    source_directory_fd: int,
    name: str,
    expected: os.stat_result,
    target_directory_fd: int | None,
    uid: int | None,
    gid: int | None,
) -> tuple[str, int]:
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(name, flags, dir_fd=source_directory_fd)
    except OSError as error:
        raise ArchiveDataError(f"cannot safely read tree file {name!r}: {error.strerror}") from error

    digest = hashlib.sha256()
    total = 0
    target_descriptor: int | None = None
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise ArchiveDataError(f"tree entry changed type while opening: {name!r}")
        if (before.st_dev, before.st_ino) != (expected.st_dev, expected.st_ino):
            raise ArchiveDataError(f"tree entry changed while opening: {name!r}")
        if target_directory_fd is not None:
            target_flags = (
                os.O_WRONLY
                | os.O_CREAT
                | os.O_EXCL
                | getattr(os, "O_CLOEXEC", 0)
            )
            if hasattr(os, "O_NOFOLLOW"):
                target_flags |= os.O_NOFOLLOW
            target_descriptor = os.open(
                name,
                target_flags,
                0o600,
                dir_fd=target_directory_fd,
            )
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            total += len(chunk)
            if target_descriptor is not None:
                view = memoryview(chunk)
                while view:
                    written = os.write(target_descriptor, view)
                    if written <= 0:
                        raise ArchiveDataError(f"short write while snapshotting: {name!r}")
                    view = view[written:]
        after = os.fstat(descriptor)
        identity_before = (
            before.st_dev,
            before.st_ino,
            before.st_size,
            before.st_mtime_ns,
            before.st_ctime_ns,
        )
        identity_after = (
            after.st_dev,
            after.st_ino,
            after.st_size,
            after.st_mtime_ns,
            after.st_ctime_ns,
        )
        if identity_before != identity_after or total != after.st_size:
            raise ArchiveDataError(f"tree file changed while hashing: {name!r}")
        if target_descriptor is not None:
            os.fchmod(target_descriptor, 0o600)
            if uid is not None or gid is not None:
                os.fchown(
                    target_descriptor,
                    -1 if uid is None else uid,
                    -1 if gid is None else gid,
                )
            os.fsync(target_descriptor)
        return digest.hexdigest(), total
    finally:
        os.close(descriptor)
        if target_descriptor is not None:
            os.close(target_descriptor)


def _open_directory(path: Path) -> tuple[int, os.stat_result]:
    def open_components(candidate: Path) -> tuple[int, os.stat_result]:
        if ".." in candidate.parts:
            raise ArchiveDataError(f"tree path contains a parent segment: {candidate}")
        flags = (
            os.O_RDONLY
            | getattr(os, "O_CLOEXEC", 0)
            | getattr(os, "O_DIRECTORY", 0)
            | getattr(os, "O_NOFOLLOW", 0)
        )
        descriptor = os.open("/" if candidate.is_absolute() else ".", flags)
        parts = candidate.parts[1:] if candidate.is_absolute() else candidate.parts
        try:
            for component in parts:
                if component in {"", "."}:
                    continue
                next_descriptor = os.open(component, flags, dir_fd=descriptor)
                os.close(descriptor)
                descriptor = next_descriptor
            metadata = os.fstat(descriptor)
            if not stat.S_ISDIR(metadata.st_mode):
                raise ArchiveDataError(f"tree root is not a directory: {candidate}")
            return descriptor, metadata
        except BaseException:
            os.close(descriptor)
            raise

    try:
        return open_components(path)
    except OSError as error:
        # macOS exposes /tmp and /var as root-controlled aliases into /private.
        # The production Ubuntu path has no such alias; this narrow fallback
        # keeps local tests portable without accepting user-controlled links.
        if sys.platform == "darwin" and path.is_absolute() and len(path.parts) > 1:
            alias = Path("/") / path.parts[1]
            try:
                alias_metadata = alias.lstat()
                root_metadata = Path("/").lstat()
            except OSError:
                alias_metadata = None
                root_metadata = None
            alias_target = Path(os.path.realpath(alias))
            allowed_prefix = Path("/private") / path.parts[1]
            # Resolve only the root-controlled /tmp or /var alias.  Resolving
            # the complete candidate here would also follow an attacker-owned
            # symlink in a later component and defeat the component walk.
            resolved = alias_target.joinpath(*path.parts[2:])
            if (
                alias_metadata is not None
                and root_metadata is not None
                and path.parts[1] in {"tmp", "var"}
                and stat.S_ISLNK(alias_metadata.st_mode)
                and alias_metadata.st_uid == 0
                and root_metadata.st_uid == 0
                and not stat.S_IMODE(root_metadata.st_mode) & 0o022
                and alias_target == allowed_prefix
            ):
                try:
                    return open_components(resolved)
                except OSError as resolved_error:
                    error = resolved_error
        raise ArchiveDataError(
            f"cannot safely open tree directory {path}: {error.strerror}"
        ) from error


def _walk_tree(
    root: Path,
    *,
    target: Path | None = None,
    uid: int | None = None,
    gid: int | None = None,
) -> Iterator[dict[str, object]]:
    root_fd, root_metadata = _open_directory(root)
    target_root_fd: int | None = None
    if target is not None:
        target_root_fd, target_metadata = _open_directory(target)
        if (root_metadata.st_dev, root_metadata.st_ino) == (
            target_metadata.st_dev,
            target_metadata.st_ino,
        ):
            os.close(root_fd)
            os.close(target_root_fd)
            raise ArchiveDataError("tree snapshot source and target must be different directories")
        if os.listdir(target_root_fd):
            os.close(root_fd)
            os.close(target_root_fd)
            raise ArchiveDataError(f"tree snapshot target must be empty: {target}")
        os.fchmod(target_root_fd, 0o700)
        if uid is not None or gid is not None:
            os.fchown(
                target_root_fd,
                -1 if uid is None else uid,
                -1 if gid is None else gid,
            )

    root_device = root_metadata.st_dev
    member_count = 0
    expanded_size = 0

    def walk(
        source_directory_fd: int,
        target_directory_fd: int | None,
        relative: str,
    ) -> Iterator[dict[str, object]]:
        nonlocal member_count, expanded_size
        before = os.fstat(source_directory_fd)
        try:
            names = sorted(os.listdir(source_directory_fd))
        except OSError as error:
            raise ArchiveDataError(f"cannot enumerate tree directory {relative or '.'}: {error.strerror}") from error

        for name in names:
            if _has_control(name) or name in {".", ".."}:
                raise ArchiveDataError(f"unsafe tree entry name: {name!r}")
            member_count += 1
            if member_count > MAX_MEMBER_COUNT:
                raise ArchiveDataError("tree contains too many entries")
            child_relative = f"{relative}/{name}" if relative else name
            metadata = os.stat(
                name,
                dir_fd=source_directory_fd,
                follow_symlinks=False,
            )
            if metadata.st_dev != root_device:
                raise ArchiveDataError(f"tree entry crosses a filesystem boundary: {child_relative}")
            mode = metadata.st_mode
            if stat.S_ISDIR(mode):
                source_child_flags = (
                    os.O_RDONLY
                    | getattr(os, "O_CLOEXEC", 0)
                    | getattr(os, "O_DIRECTORY", 0)
                )
                if hasattr(os, "O_NOFOLLOW"):
                    source_child_flags |= os.O_NOFOLLOW
                source_child_fd = os.open(
                    name,
                    source_child_flags,
                    dir_fd=source_directory_fd,
                )
                opened = os.fstat(source_child_fd)
                if (opened.st_dev, opened.st_ino) != (metadata.st_dev, metadata.st_ino):
                    os.close(source_child_fd)
                    raise ArchiveDataError(f"tree directory changed while opening: {child_relative}")
                target_child_fd: int | None = None
                if target_directory_fd is not None:
                    os.mkdir(name, 0o700, dir_fd=target_directory_fd)
                    target_child_fd = os.open(
                        name,
                        os.O_RDONLY
                        | getattr(os, "O_CLOEXEC", 0)
                        | getattr(os, "O_DIRECTORY", 0)
                        | getattr(os, "O_NOFOLLOW", 0),
                        dir_fd=target_directory_fd,
                    )
                    os.fchmod(target_child_fd, 0o700)
                    if uid is not None or gid is not None:
                        os.fchown(
                            target_child_fd,
                            -1 if uid is None else uid,
                            -1 if gid is None else gid,
                        )
                yield {"path": child_relative, "type": "directory"}
                try:
                    yield from walk(source_child_fd, target_child_fd, child_relative)
                finally:
                    os.close(source_child_fd)
                    if target_child_fd is not None:
                        os.fsync(target_child_fd)
                        os.close(target_child_fd)
            elif stat.S_ISREG(mode):
                digest, size = _copy_or_hash_regular_file(
                    source_directory_fd,
                    name,
                    metadata,
                    target_directory_fd,
                    uid,
                    gid,
                )
                expanded_size += size
                if expanded_size > MAX_EXPANDED_BYTES:
                    raise ArchiveDataError("tree exceeds the supported size bound")
                yield {
                    "path": child_relative,
                    "sha256": digest,
                    "size": size,
                    "type": "file",
                }
            else:
                raise ArchiveDataError(
                    f"tree entry is not a regular file or directory: {child_relative}"
                )

        after = os.fstat(source_directory_fd)
        before_identity = (
            before.st_dev,
            before.st_ino,
            before.st_mtime_ns,
            before.st_ctime_ns,
        )
        after_identity = (
            after.st_dev,
            after.st_ino,
            after.st_mtime_ns,
            after.st_ctime_ns,
        )
        if before_identity != after_identity:
            raise ArchiveDataError(f"tree directory changed while snapshotting: {relative or '.'}")

    try:
        yield from walk(root_fd, target_root_fd, "")
        if target_root_fd is not None:
            os.fsync(target_root_fd)
    finally:
        os.close(root_fd)
        if target_root_fd is not None:
            os.close(target_root_fd)


def command_manifest_tree(arguments: argparse.Namespace) -> int:
    for record in _walk_tree(Path(arguments.root)):
        print(json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    return 0


def command_snapshot_tree(arguments: argparse.Namespace) -> int:
    for record in _walk_tree(
        Path(arguments.source),
        target=Path(arguments.target),
        uid=arguments.uid,
        gid=arguments.gid,
    ):
        print(json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    return 0


def command_directory_identity(arguments: argparse.Namespace) -> int:
    descriptor, metadata = _open_directory(Path(arguments.directory))
    try:
        print(f"{metadata.st_dev}:{metadata.st_ino}")
    finally:
        os.close(descriptor)
    return 0


def command_snapshot_file(arguments: argparse.Namespace) -> int:
    source = Path(arguments.source)
    target = Path(arguments.target)
    if source.name in {"", ".", ".."} or target.name in {"", ".", ".."}:
        raise ArchiveDataError("file snapshot requires explicit source and target names")

    source_parent_fd, _ = _open_directory(source.parent)
    target_parent_fd, _ = _open_directory(target.parent)
    source_fd: int | None = None
    target_fd: int | None = None
    target_identity: tuple[int, int] | None = None
    source_flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    target_flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    try:
        source_fd = os.open(source.name, source_flags, dir_fd=source_parent_fd)
        before = os.fstat(source_fd)
        if not stat.S_ISREG(before.st_mode):
            raise ArchiveDataError(f"snapshot source is not a regular file: {source}")
        if before.st_uid not in set(arguments.allowed_uid):
            raise ArchiveDataError(f"snapshot source owner is not approved: {source}")
        if stat.S_IMODE(before.st_mode) & 0o077:
            raise ArchiveDataError(f"snapshot source must be private: {source}")
        if before.st_size <= 0 or before.st_size > arguments.max_bytes:
            raise ArchiveDataError(f"snapshot source size is outside the supported bound: {source}")

        target_fd = os.open(target.name, target_flags, 0o600, dir_fd=target_parent_fd)
        target_metadata = os.fstat(target_fd)
        target_identity = (target_metadata.st_dev, target_metadata.st_ino)
        digest = hashlib.sha256()
        prefix = b""
        copied = 0
        while True:
            chunk = os.read(source_fd, 1024 * 1024)
            if not chunk:
                break
            if arguments.magic is not None and len(prefix) < len(arguments.magic):
                prefix = (prefix + chunk)[: len(arguments.magic)]
            digest.update(chunk)
            copied += len(chunk)
            view = memoryview(chunk)
            while view:
                written = os.write(target_fd, view)
                if written <= 0:
                    raise ArchiveDataError(f"short write while snapshotting: {target}")
                view = view[written:]

        after = os.fstat(source_fd)
        stable_fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
        if any(getattr(before, field) != getattr(after, field) for field in stable_fields):
            raise ArchiveDataError(f"snapshot source changed while reading: {source}")
        if copied != before.st_size:
            raise ArchiveDataError(f"snapshot source size changed while reading: {source}")
        if arguments.magic is not None and prefix != arguments.magic:
            raise ArchiveDataError(f"snapshot source has an invalid format signature: {source}")
        actual_digest = digest.hexdigest()
        if actual_digest != arguments.sha256:
            raise ArchiveDataError(
                f"snapshot SHA-256 mismatch: expected {arguments.sha256}, actual {actual_digest}"
            )
        os.fchmod(target_fd, arguments.mode)
        os.fchown(
            target_fd,
            -1 if arguments.uid is None else arguments.uid,
            -1 if arguments.gid is None else arguments.gid,
        )
        os.fsync(target_fd)
        linked_target = os.stat(
            target.name,
            dir_fd=target_parent_fd,
            follow_symlinks=False,
        )
        if (linked_target.st_dev, linked_target.st_ino) != target_identity:
            raise ArchiveDataError(f"snapshot target changed while writing: {target}")
        os.fsync(target_parent_fd)
        print(actual_digest)
        return 0
    except BaseException:
        if target_fd is not None:
            os.close(target_fd)
            target_fd = None
        if target_identity is not None:
            try:
                linked_target = os.stat(
                    target.name,
                    dir_fd=target_parent_fd,
                    follow_symlinks=False,
                )
            except FileNotFoundError:
                pass
            else:
                if (linked_target.st_dev, linked_target.st_ino) == target_identity:
                    os.unlink(target.name, dir_fd=target_parent_fd)
        raise
    finally:
        if source_fd is not None:
            os.close(source_fd)
        if target_fd is not None:
            os.close(target_fd)
        os.close(source_parent_fd)
        os.close(target_parent_fd)


def _require_nonsymlink_directory(path: Path) -> None:
    descriptor, _ = _open_directory(path)
    os.close(descriptor)


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(
        path,
        os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_DIRECTORY", 0),
    )
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def command_activate_tree(arguments: argparse.Namespace) -> int:
    """Activate a sibling staging directory without leaving the live name absent.

    Linux ``renameat2(RENAME_EXCHANGE)`` makes the staged tree visible at the
    live path in one namespace operation.  The displaced live tree is then
    moved to the pre-validated rollback path.  There is deliberately no
    two-rename fallback: an unsupported platform must fail closed.
    """

    staging = Path(arguments.staging)
    current = Path(arguments.current)
    previous = Path(arguments.previous)
    if not (staging.parent == current.parent == previous.parent):
        raise ArchiveDataError("staging, current, and previous trees must be siblings")
    if len({staging.name, current.name, previous.name}) != 3:
        raise ArchiveDataError("staging, current, and previous trees must be distinct")

    _require_nonsymlink_directory(staging)
    try:
        previous.lstat()
    except FileNotFoundError:
        pass
    else:
        raise ArchiveDataError(f"previous tree path already exists: {previous}")

    try:
        current.lstat()
    except FileNotFoundError:
        os.rename(staging, current)
        _fsync_directory(current.parent)
        return 0

    _require_nonsymlink_directory(current)
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, "renameat2", None)
    if renameat2 is None:
        raise ArchiveDataError("renameat2(RENAME_EXCHANGE) is unavailable; refusing a non-atomic activation")
    renameat2.argtypes = [
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_uint,
    ]
    renameat2.restype = ctypes.c_int
    result = renameat2(
        AT_FDCWD,
        os.fsencode(staging),
        AT_FDCWD,
        os.fsencode(current),
        RENAME_EXCHANGE,
    )
    if result != 0:
        error_number = ctypes.get_errno()
        raise ArchiveDataError(
            f"atomic tree exchange failed: {os.strerror(error_number)}"
        )
    _fsync_directory(current.parent)
    try:
        os.rename(staging, previous)
    except OSError as preserve_error:
        # The live name already contains the staged tree.  If preservation of
        # the displaced tree fails, exchange the names back before returning
        # an error so callers never observe a successful half-activation.
        rollback_result = renameat2(
            AT_FDCWD,
            os.fsencode(staging),
            AT_FDCWD,
            os.fsencode(current),
            RENAME_EXCHANGE,
        )
        _fsync_directory(current.parent)
        if rollback_result != 0:
            rollback_error = ctypes.get_errno()
            raise ArchiveDataError(
                "cannot preserve the displaced tree and atomic rollback failed: "
                f"{os.strerror(rollback_error)}"
            ) from preserve_error
        raise ArchiveDataError(
            f"cannot preserve displaced tree; activation was rolled back: {preserve_error.strerror}"
        ) from preserve_error
    _fsync_directory(current.parent)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    archive_parser = subparsers.add_parser("validate-archive")
    archive_parser.add_argument("--allowed-uid", type=int, action="append", required=True)
    archive_parser.add_argument("archive")
    archive_parser.set_defaults(handler=command_validate_archive)

    tree_parser = subparsers.add_parser("manifest-tree")
    tree_parser.add_argument("root")
    tree_parser.set_defaults(handler=command_manifest_tree)

    snapshot_parser = subparsers.add_parser("snapshot-tree")
    snapshot_parser.add_argument("--uid", type=int)
    snapshot_parser.add_argument("--gid", type=int)
    snapshot_parser.add_argument("source")
    snapshot_parser.add_argument("target")
    snapshot_parser.set_defaults(handler=command_snapshot_tree)

    identity_parser = subparsers.add_parser("directory-identity")
    identity_parser.add_argument("directory")
    identity_parser.set_defaults(handler=command_directory_identity)

    file_snapshot_parser = subparsers.add_parser("snapshot-file")
    file_snapshot_parser.add_argument("--allowed-uid", type=int, action="append", required=True)
    file_snapshot_parser.add_argument("--sha256", required=True)
    file_snapshot_parser.add_argument("--magic", type=lambda value: value.encode("ascii"))
    file_snapshot_parser.add_argument("--max-bytes", type=int, default=MAX_ARCHIVE_BYTES)
    file_snapshot_parser.add_argument("--mode", type=lambda value: int(value, 8), default=0o600)
    file_snapshot_parser.add_argument("--uid", type=int)
    file_snapshot_parser.add_argument("--gid", type=int)
    file_snapshot_parser.add_argument("source")
    file_snapshot_parser.add_argument("target")
    file_snapshot_parser.set_defaults(handler=command_snapshot_file)

    activate_parser = subparsers.add_parser("activate-tree")
    activate_parser.add_argument("staging")
    activate_parser.add_argument("current")
    activate_parser.add_argument("previous")
    activate_parser.set_defaults(handler=command_activate_tree)
    return parser


def main() -> int:
    arguments = build_parser().parse_args()
    try:
        return arguments.handler(arguments)
    except ArchiveDataError as error:
        die(str(error))
    except (OSError, tarfile.TarError) as error:
        die(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
