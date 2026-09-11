"""Cold-activation policy; not a root adapter, installer or execution authorization.

A separately reviewed root-owned adapter must prove all effects, validate root-owned
inputs and hold one exclusive operation lock. No other supervisor may activate clamd.
"""
from dataclasses import dataclass
import re
from typing import Protocol

MAX_SIGNATURE_AGE = 48 * 60 * 60


class UpdateFailure(RuntimeError):
    pass


class DownloadFailure(UpdateFailure):
    """Download/check failure only, never signature, identity or loading failure."""


@dataclass(frozen=True)
class DatabaseFile:
    name: str
    sha256: str
    size: int
    version: int


@dataclass(frozen=True)
class VerifiedSet:
    files: tuple[DatabaseFile, ...]
    daily_version: int
    daily_stime: int

    def validate(self, now: int) -> None:
        stems = set()
        total = 0
        if len(self.files) != 3:
            raise UpdateFailure('Incomplete or additional signature databases')
        for file in self.files:
            match = re.fullmatch(r'(main|daily|bytecode)\.(cvd|cld)', file.name)
            if not match or match[1] in stems:
                raise UpdateFailure('Unexpected or ambiguous database selection')
            stems.add(match[1])
            if type(file.version) is not int or file.version <= 0:
                raise UpdateFailure('Invalid signed database version')
            if not re.fullmatch(r'[0-9a-f]{64}', file.sha256):
                raise UpdateFailure('Invalid signature content identity')
            if type(file.size) is not int or not 512 <= file.size <= 512 * 1024 * 1024:
                raise UpdateFailure('Database file outside bounded size')
            total += file.size
        if total > 1024 * 1024 * 1024:
            raise UpdateFailure('Database set outside bounded size')
        if type(self.daily_version) is not int or self.daily_version <= 0:
            raise UpdateFailure('Invalid daily database version')
        daily = next(file for file in self.files if file.name.startswith('daily.'))
        if daily.version != self.daily_version:
            raise UpdateFailure('Daily file and runtime version metadata differ')
        if type(self.daily_stime) is not int or self.daily_stime <= 0 or not 0 <= now - self.daily_stime < MAX_SIGNATURE_AGE:
            raise UpdateFailure('Daily signatures stale or from the future')

    def content_identity(self):
        return tuple(sorted((file.name, file.sha256, file.size) for file in self.files))

    def version_identity(self):
        return tuple(sorted((file.name, file.version) for file in self.files))


@dataclass(frozen=True)
class RunningSet:
    databases: VerifiedSet
    process_start_identity: str
    image_identity: str
    config_identity: str


class Host(Protocol):
    """Every method fails when its claimed proof is unavailable.

    close_admission stops both proxy socket/service and proves all connections ended.
    open_admission rechecks signature age at the actual opening, under the lock.
    No Unix socket or alternative listener may bypass admission. verify_candidate
    verifies the official signatures and freezes the complete selected set, including
    rejecting extra loadable files. Runtime verification binds the pinned image,
    configuration, read-only mounts, complete files and actual process start identity.
    cleanup_candidate removes only unpromoted temporary state, never an active set.
    Version floors are persisted independently of admission approval, and atomically
    advanced by approve_active. invalidate_approval must never delete that floor.
    """
    def now(self) -> int: ...
    def approved_active(self) -> RunningSet | None: ...
    def version_floor(self) -> VerifiedSet | None: ...
    def verify_active(self, expected: RunningSet) -> RunningSet: ...
    def prepare_candidate(self, active: RunningSet | None) -> object: ...
    def download(self, candidate: object) -> None: ...
    def verify_candidate(self, candidate: object) -> VerifiedSet: ...
    def close_admission(self) -> None: ...
    def stop_and_prove_exit(self) -> None: ...
    def start_candidate(self, candidate: object, verified: VerifiedSet) -> RunningSet: ...
    def verify_loaded(self, expected: RunningSet) -> RunningSet: ...
    def approve_active(self, running: RunningSet) -> None: ...
    def open_admission(self, expected: RunningSet) -> None: ...
    def record_result(self, result: str) -> None: ...
    def invalidate_approval(self) -> None: ...
    def cleanup_candidate(self, candidate: object) -> None: ...


def same_running(actual: RunningSet, expected: RunningSet) -> None:
    if actual != expected or not all((actual.process_start_identity, actual.image_identity, actual.config_identity)):
        raise UpdateFailure('Running scanner identity differs from approved state')


def fail_closed(host: Host, stop_started: bool = False) -> None:
    errors = []
    closed = False
    exited = not stop_started
    try:
        host.close_admission()
        closed = True
    except BaseException as error:
        errors.append(error)
    if stop_started:
        try:
            host.stop_and_prove_exit()
            exited = True
        except BaseException as error:
            errors.append(error)
    try:
        host.invalidate_approval()
    finally:
        result = ('FAILED_ADMISSION_CLOSURE_UNVERIFIED' if not closed else
                  'FAILED_ACTIVATION_RESOURCES_RETAINED' if not exited else
                  'FAILED_CLOSED_VERIFICATION_REQUIRED')
        host.record_result(result)
    if errors:
        raise errors[0]


def update(host: Host) -> str:
    """Caller holds the external lock; download success never means readiness."""
    candidate = None
    selected = None
    activation_started = False
    cleanup_allowed = True
    try:
        active = host.approved_active()
        floor = host.version_floor()
        if floor is not None:
            # A historical floor may be old; validate its shape without refreshing it.
            floor.validate(floor.daily_stime)
        if active is not None:
            active.databases.validate(host.now())
            same_running(host.verify_active(active), active)
        else:
            host.close_admission()
        candidate = host.prepare_candidate(active)
        try:
            host.download(candidate)
        except DownloadFailure:
            # A failed FreshClam run can partially change the separate candidate.
            if active is None:
                raise
            active.databases.validate(host.now())
            same_running(host.verify_active(active), active)
            active.databases.validate(host.now())
            selected = active
            host.record_result('DOWNLOAD_FAILED_ACTIVE_UNCHANGED')
            return 'DOWNLOAD_FAILED_ACTIVE_UNCHANGED'

        verified = host.verify_candidate(candidate)
        verified.validate(host.now())
        baseline = floor or (active.databases if active else None)
        if baseline is not None:
            old_files = {file.name.split('.')[0]: file for file in baseline.files}
            previous = {name: file.version for name, file in old_files.items()}
            for file in verified.files:
                old = old_files[file.name.split('.')[0]]
                if file.sha256 == old.sha256 and (file.size, file.version) != (old.size, old.version):
                    raise UpdateFailure('Identical file bytes have inconsistent signed metadata')
            daily = next(file for file in verified.files if file.name.startswith('daily.'))
            if daily.sha256 == old_files['daily'].sha256 and verified.daily_stime != baseline.daily_stime:
                raise UpdateFailure('Identical daily bytes have inconsistent signed time')
            if any(file.version < previous[file.name.split('.')[0]] for file in verified.files):
                raise UpdateFailure('Signed database version rollback')
            if verified.daily_stime < baseline.daily_stime:
                raise UpdateFailure('Signed daily timestamp rollback')
        if active is not None and verified.content_identity() == active.databases.content_identity():
            if (verified.version_identity(), verified.daily_version, verified.daily_stime) != (active.databases.version_identity(), active.databases.daily_version, active.databases.daily_stime):
                raise UpdateFailure('Same content has inconsistent database metadata')
            same_running(host.verify_active(active), active)
            active.databases.validate(host.now())
            selected = active
            host.record_result('VERIFIED_UNCHANGED')
            return 'VERIFIED_UNCHANGED'

        host.close_admission()
        host.stop_and_prove_exit()
        activation_started = True
        running = host.start_candidate(candidate, verified)
        if running.databases != verified:
            raise UpdateFailure('Started scanner has unexpected database set')
        if active is not None and running.process_start_identity == active.process_start_identity:
            raise UpdateFailure('Cold activation did not establish a new process')
        same_running(host.verify_loaded(running), running)
        verified.validate(host.now())
        host.approve_active(running)
        verified.validate(host.now())
        # Adapter rechecks full identity immediately before opening, under the lock.
        # Opening the proxy cannot activate or reload clamd.
        host.open_admission(running)
        selected = running
        host.record_result('COLD_ACTIVATION_VERIFIED')
        return 'COLD_ACTIVATION_VERIFIED'
    except BaseException:
        selected = None
        cleanup_allowed = False
        fail_closed(host, stop_started=activation_started)
        cleanup_allowed = True
        raise
    finally:
        if candidate is not None and cleanup_allowed:
            try:
                host.cleanup_candidate(candidate)
            except BaseException:
                fail_closed(host, stop_started=activation_started)
                raise
        if selected is not None:
            try:
                selected.databases.validate(host.now())
            except BaseException:
                fail_closed(host, stop_started=activation_started)
                raise
