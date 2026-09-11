"""Bounded durable scanner state, for a separately authorized Linux host adapter.

The adapter supplies an already securely opened root-owned directory FD, obtained
without following symlinks through writable ancestors. Installation provisions
state.json and operation.lock exactly once. Runtime NEVER initializes missing state.
This module alone neither validates path ancestors nor authorizes root execution.
"""
from contextlib import contextmanager
from dataclasses import asdict, dataclass
import fcntl
import json
import os
import re
import stat
import uuid

from scanner_update_policy import DatabaseFile, RunningSet, UpdateFailure, VerifiedSet

MAX_STATE_BYTES = 16384


def exact_keys(value, keys):
    if type(value) is not dict or set(value) != set(keys):
        raise UpdateFailure('Unexpected scanner state structure')


def decode_set(value):
    exact_keys(value, ('files', 'daily_version', 'daily_stime'))
    if type(value['files']) is not list or len(value['files']) != 3:
        raise UpdateFailure('Invalid database list')
    files = []
    for item in value['files']:
        exact_keys(item, ('name', 'sha256', 'size', 'version'))
        if type(item['name']) is not str or type(item['sha256']) is not str:
            raise UpdateFailure('Invalid database identity')
        files.append(DatabaseFile(**item))
    result = VerifiedSet(tuple(files), value['daily_version'], value['daily_stime'])
    result.validate(result.daily_stime)
    return result


def decode_running(value):
    exact_keys(value, ('databases', 'process_start_identity', 'image_identity', 'config_identity'))
    process = value['process_start_identity']
    if type(process) is not str or not re.fullmatch(r'[\x21-\x7e]{1,512}', process):
        raise UpdateFailure('Invalid scanner process identity')
    for key in ('image_identity', 'config_identity'):
        if type(value[key]) is not str or not re.fullmatch(r'(?:sha256:)?[0-9a-f]{64}', value[key]):
            raise UpdateFailure('Invalid scanner artifact identity')
    return RunningSet(decode_set(value['databases']), process,
                      value['image_identity'], value['config_identity'])


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise UpdateFailure('Duplicate scanner state key')
        result[key] = value
    return result


@dataclass(frozen=True)
class State:
    revision: int
    floor: VerifiedSet | None
    approved: RunningSet | None

    @classmethod
    def decode(cls, raw):
        if len(raw) > MAX_STATE_BYTES:
            raise UpdateFailure('Scanner state exceeds size bound')
        try:
            value = json.loads(raw, object_pairs_hook=no_duplicate_keys)
            exact_keys(value, ('schema', 'revision', 'floor', 'approved'))
            if type(value['schema']) is not int or value['schema'] != 1:
                raise UpdateFailure('Unsupported scanner state version')
            if type(value['revision']) is not int or not 0 <= value['revision'] < 2 ** 63:
                raise UpdateFailure('Invalid scanner state revision')
            floor = decode_set(value['floor']) if value['floor'] is not None else None
            active = decode_running(value['approved']) if value['approved'] is not None else None
            if active is not None and active.databases != floor:
                raise UpdateFailure('Approval does not match durable version floor')
            if (value['revision'] == 0) != (floor is None):
                raise UpdateFailure('Initial state or persisted version floor is invalid')
            return cls(value['revision'], floor, active)
        except (ValueError, TypeError, KeyError, AttributeError, StopIteration, RecursionError) as error:
            raise UpdateFailure('Malformed scanner state') from error

    def encode(self):
        value = {'schema': 1, 'revision': self.revision,
                 'floor': asdict(self.floor) if self.floor else None,
                 'approved': asdict(self.approved) if self.approved else None}
        raw = (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()
        self.decode(raw)
        return raw


class StateStore:
    """All reads/writes require an exclusive, pre-existing operation.lock.

    Production owner_uid MUST be 0; the explicit UID parameter supports unprivileged
    isolated filesystem tests, not configuration from the application or environment.
    The enclosing adapter must close admission on any exception, including fsync.
    """
    def __init__(self, directory_fd, *, owner_uid=0):
        self.directory = os.dup(directory_fd)
        self.owner_uid = owner_uid
        self.lock_fd = None
        try:
            info = os.fstat(self.directory)
            if not stat.S_ISDIR(info.st_mode) or info.st_uid != owner_uid or stat.S_IMODE(info.st_mode) != 0o700:
                raise UpdateFailure('Scanner state directory is not privately owned')
        except BaseException:
            os.close(self.directory)
            raise

    def close(self):
        if self.lock_fd is not None:
            raise UpdateFailure('Cannot close scanner store while locked')
        if self.directory is not None:
            os.close(self.directory)
            self.directory = None

    def _owned_file(self, name, flags):
        fd = os.open(name, flags | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK,
                     dir_fd=self.directory)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != self.owner_uid or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
                raise UpdateFailure('Scanner state file is not privately owned and regular')
            return fd
        except BaseException:
            os.close(fd)
            raise

    @contextmanager
    def locked(self):
        if self.lock_fd is not None:
            raise UpdateFailure('Nested scanner operation')
        fd = self._owned_file('operation.lock', os.O_RDWR)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.lock_fd = fd
            yield self
        finally:
            self.lock_fd = None
            os.close(fd)

    def _require_lock(self):
        if self.lock_fd is None:
            raise UpdateFailure('Scanner operation lock not held')
        current = os.stat('operation.lock', dir_fd=self.directory, follow_symlinks=False)
        held = os.fstat(self.lock_fd)
        if (current.st_dev, current.st_ino) != (held.st_dev, held.st_ino):
            raise UpdateFailure('Scanner operation lock was replaced')

    def read(self):
        self._require_lock()
        fd = self._owned_file('state.json', os.O_RDONLY)
        try:
            if os.fstat(fd).st_size > MAX_STATE_BYTES:
                raise UpdateFailure('Scanner state exceeds size bound')
            raw = bytearray()
            while len(raw) <= MAX_STATE_BYTES:
                block = os.read(fd, MAX_STATE_BYTES + 1 - len(raw))
                if not block:
                    break
                raw.extend(block)
            return State.decode(bytes(raw))
        finally:
            os.close(fd)

    def _write(self, state):
        self._require_lock()
        raw = state.encode()
        name = '.state-' + uuid.uuid4().hex
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                     0o600, dir_fd=self.directory)
        try:
            # Exact permissions are independent of the caller's umask.
            os.fchmod(fd, 0o600)
            view = memoryview(raw)
            while view:
                written = os.write(fd, view)
                if written <= 0:
                    raise UpdateFailure('Scanner state write made no progress')
                view = view[written:]
            os.fsync(fd)
            self._require_lock()
            os.rename(name, 'state.json', src_dir_fd=self.directory, dst_dir_fd=self.directory)
            os.fsync(self.directory)
        finally:
            os.close(fd)
            try:
                os.unlink(name, dir_fd=self.directory)
            except FileNotFoundError:
                pass

    def revoke(self):
        current = self.read()
        if current.floor is not None:
            self._write(State(current.revision + 1, current.floor, None))

    def approve(self, running, *, now):
        # State validation is not signature or runtime verification: the host adapter
        # must supply those proofs before invoking this durable commit.
        candidate = State.decode(State(1, running.databases, running).encode()).approved
        candidate.databases.validate(now)
        current = self.read()
        if current.floor is not None:
            previous = {item.name.split('.')[0]: item for item in current.floor.files}
            for item in candidate.databases.files:
                old = previous[item.name.split('.')[0]]
                if item.version < old.version:
                    raise UpdateFailure('Scanner database version rollback')
                if item.sha256 == old.sha256 and (item.size, item.version) != (old.size, old.version):
                    raise UpdateFailure('Identical scanner bytes changed metadata')
            old_daily = previous['daily']
            new_daily = next(item for item in candidate.databases.files if item.name.startswith('daily.'))
            if candidate.databases.daily_stime < current.floor.daily_stime:
                raise UpdateFailure('Scanner database time rollback')
            if new_daily.sha256 == old_daily.sha256 and candidate.databases.daily_stime != current.floor.daily_stime:
                raise UpdateFailure('Identical scanner daily bytes changed signed time')
        self._write(State(current.revision + 1, candidate.databases, candidate))
