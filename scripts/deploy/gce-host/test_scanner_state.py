"""Real temporary filesystem tests; no services, database engine or root execution."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scanner_state import MAX_STATE_BYTES, State, StateStore, UpdateFailure
from scanner_update_policy import DatabaseFile, RunningSet, VerifiedSet

NOW = 2_000_000_000


def running(version=100, digest='a', age=3600):
    db = VerifiedSet(tuple(DatabaseFile(stem + '.cvd', digest * 64, 1024, version)
                           for stem in ('main', 'daily', 'bytecode')), version, NOW - age)
    return RunningSet(db, 'container-id/2026-09-11T00:00:00Z', 'sha256:' + 'c' * 64, 'd' * 64)


class StateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='scanner-state-test-')
        self.path = Path(self.temp.name)
        os.chmod(self.path, 0o700)
        self.state = self.path / 'state.json'
        self.write(State(0, None, None).encode())
        self.lock = self.path / 'operation.lock'
        self.lock.touch(mode=0o600)
        self.fd = os.open(self.path, os.O_RDONLY | os.O_DIRECTORY)
        self.store = StateStore(self.fd, owner_uid=os.geteuid())

    def tearDown(self):
        self.store.close()
        os.close(self.fd)
        self.temp.cleanup()

    def write(self, raw):
        self.state.write_bytes(raw)
        os.chmod(self.state, 0o600)

    def test_approval_revoke_and_new_instance_preserve_floor(self):
        with self.store.locked():
            self.store.approve(running(), now=NOW)
            self.store.revoke()
        second = StateStore(self.fd, owner_uid=os.geteuid())
        try:
            with second.locked():
                state = second.read()
                self.assertEqual(state.floor, running().databases)
                self.assertIsNone(state.approved)
                self.assertEqual(state.revision, 2)
                with self.assertRaises(UpdateFailure):
                    second.approve(running(99, 'b'), now=NOW)
                self.assertEqual(second.read(), state)
        finally:
            second.close()

    def test_revoking_pristine_store_remains_explicit_initial_state(self):
        with self.store.locked():
            self.store.revoke()
            self.assertEqual(self.store.read(), State(0, None, None))

    def test_initialized_store_cannot_lose_floor_after_revocation(self):
        with self.store.locked():
            self.store.approve(running(), now=NOW)
            self.store.revoke()
            value = json.loads(self.state.read_bytes())
            value['floor'] = None
            self.write(json.dumps(value).encode())
            with self.assertRaises(UpdateFailure): self.store.read()

    def test_lock_required_and_concurrent_controller_rejected(self):
        with self.assertRaises(UpdateFailure): self.store.read()
        second = StateStore(self.fd, owner_uid=os.geteuid())
        try:
            with self.store.locked():
                with self.assertRaises(BlockingIOError):
                    with second.locked(): self.fail('Concurrent operation admitted')
                self.assertEqual(self.store.read(), State(0, None, None))
        finally:
            second.close()

    def test_missing_corrupt_duplicate_oversized_and_boolean_fail_closed(self):
        with self.store.locked():
            self.state.unlink()
            with self.assertRaises(FileNotFoundError): self.store.read()
            for raw in (b'{', b'{"schema":1,"schema":1}', b'x' * (MAX_STATE_BYTES + 1),
                        b'{"schema":true,"revision":0,"floor":null,"approved":null}'):
                with self.subTest(raw=raw[:50]):
                    self.write(raw)
                    with self.assertRaises(UpdateFailure): self.store.read()

    def test_symlink_hardlink_fifo_and_permissions_rejected(self):
        target = self.path / 'target'
        target.write_bytes(self.state.read_bytes())
        target.chmod(0o600)
        with self.store.locked():
            self.state.unlink()
            self.state.symlink_to(target)
            with self.assertRaises(OSError): self.store.read()
            self.state.unlink()
            os.link(target, self.state)
            with self.assertRaises(UpdateFailure): self.store.read()
            self.state.unlink()
            os.mkfifo(self.state, 0o600)
            with self.assertRaises(UpdateFailure): self.store.read()
            self.state.unlink()
            self.write(State(0, None, None).encode())
            self.state.chmod(0o640)
            with self.assertRaises(UpdateFailure): self.store.read()

    def test_replaced_lock_refuses_mutation(self):
        with self.store.locked():
            self.lock.rename(self.path / 'old-lock')
            self.lock.touch(mode=0o600)
            with self.assertRaises(UpdateFailure): self.store.revoke()

    def test_file_fsync_failure_preserves_previous_state(self):
        with self.store.locked():
            original = self.store.read()
            with patch('scanner_state.os.fsync', side_effect=OSError('synthetic disk failure')):
                with self.assertRaises(OSError): self.store.approve(running(), now=NOW)
            self.assertEqual(self.store.read(), original)
            self.assertEqual(list(self.path.glob('.state-*')), [])

    def test_directory_fsync_failure_is_not_reported_success(self):
        real_fsync = os.fsync
        def fail_directory(fd):
            if os.fstat(fd).st_ino == os.fstat(self.fd).st_ino:
                raise OSError('synthetic directory flush failure')
            return real_fsync(fd)
        with self.store.locked():
            with patch('scanner_state.os.fsync', side_effect=fail_directory):
                with self.assertRaises(OSError): self.store.approve(running(), now=NOW)
            # Rename already happened, so approval and floor must be jointly present.
            state = self.store.read()
            self.assertEqual(state.approved, running())
            self.assertEqual(state.floor, running().databases)
            self.store.revoke()
            self.assertEqual(self.store.read().floor, running().databases)

    def test_short_writes_complete_atomic_state(self):
        real_write = os.write
        with self.store.locked():
            with patch('scanner_state.os.write', side_effect=lambda fd, data: real_write(fd, data[:7])):
                self.store.approve(running(), now=NOW)
            self.assertEqual(self.store.read().approved, running())
            self.assertEqual(self.state.stat().st_mode & 0o777, 0o600)

    def test_stale_future_rollback_and_same_byte_time_changes_rejected(self):
        with self.store.locked():
            self.store.approve(running(), now=NOW)
            self.store.revoke()
            old = self.store.read()
            cases = [running(101, 'b', 172800), running(101, 'b', -1), running(99, 'b'),
                     running(101, 'a'), running(100, 'a', 3500), running(101, 'b', 3700)]
            for candidate in cases:
                with self.subTest(candidate=candidate):
                    with self.assertRaises(UpdateFailure): self.store.approve(candidate, now=NOW)
                    self.assertEqual(self.store.read(), old)
            self.store.approve(running(101, 'b', 3500), now=NOW)
            self.assertEqual(self.store.read().floor.daily_version, 101)

    def test_state_shape_and_approval_floor_mismatch_rejected(self):
        valid = State(1, running().databases, running()).encode()
        for mutate in (lambda v: v.update(extra=1),
                       lambda v: v.update(floor=None),
                       lambda v: v['approved'].update(config_identity='untrusted-tag'),
                       lambda v: v.update(revision=0)):
            value = json.loads(valid)
            mutate(value)
            with self.assertRaises(UpdateFailure): State.decode(json.dumps(value).encode())

    def test_rename_and_zero_write_failures_preserve_state(self):
        with self.store.locked():
            original = self.store.read()
            for method, kwargs in (('rename', {'side_effect': OSError('synthetic rename failure')}),
                                   ('write', {'return_value': 0})):
                with self.subTest(method=method):
                    with patch('scanner_state.os.' + method, **kwargs):
                        with self.assertRaises((OSError, UpdateFailure)):
                            self.store.approve(running(), now=NOW)
                    self.assertEqual(self.store.read(), original)
                    self.assertEqual(list(self.path.glob('.state-*')), [])

    def test_missing_or_symlink_lock_never_recreated(self):
        self.lock.unlink()
        with self.assertRaises(FileNotFoundError):
            with self.store.locked(): self.fail('Missing lock accepted')
        self.assertFalse(self.lock.exists())
        self.lock.symlink_to(self.state)
        with self.assertRaises(OSError):
            with self.store.locked(): self.fail('Symlink lock accepted')

    def test_wrong_directory_owner_or_permissions_rejected(self):
        with self.assertRaises(UpdateFailure): StateStore(self.fd, owner_uid=os.geteuid() + 1)
        self.path.chmod(0o750)
        with self.assertRaises(UpdateFailure): StateStore(self.fd, owner_uid=os.geteuid())


if __name__ == '__main__': unittest.main()
