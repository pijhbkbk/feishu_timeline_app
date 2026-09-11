"""Policy tests with fake host effects; not signature-engine or deployment proof."""
from dataclasses import replace
import unittest
from scanner_update_policy import (
    DatabaseFile, DownloadFailure, MAX_SIGNATURE_AGE, RunningSet,
    UpdateFailure, VerifiedSet, update,
)

NOW = 2_000_000_000


def databases(digest='a', age=3600):
    return VerifiedSet(tuple(DatabaseFile(name + '.cvd', digest * 64, 1024, 1234)
                             for name in ('main', 'daily', 'bytecode')), 1234, NOW - age)


class FakeHost:
    def __init__(self):
        self.clock = NOW
        self.active = RunningSet(databases(), 'old-process', 'pinned-image', 'pinned-config')
        self.floor = self.active.databases
        self.live_candidate = False
        self.promoted = False
        self.stop_calls = 0
        self.fail_second_stop = False
        self.candidate = databases('b')
        self.events = []
        self.fail_at = None
        self.download_error = None
        self.change_during_download = False
        self.loaded_mismatch = False
        self.reuse_process = False
        self.opened = True
        self.results = []

    def event(self, name):
        self.events.append(name)
        if self.fail_at == name:
            raise UpdateFailure(name)

    def now(self): return self.clock
    def approved_active(self):
        self.event('approved_active')
        return self.active
    def version_floor(self): return self.floor
    def verify_active(self, expected):
        self.event('verify_active')
        return self.active
    def prepare_candidate(self, active):
        self.event('prepare_candidate')
        return 'private-candidate'
    def download(self, candidate):
        self.event('download')
        if self.change_during_download:
            self.active = replace(self.active, process_start_identity='unexpected-process')
        if self.download_error:
            raise self.download_error
    def verify_candidate(self, candidate):
        self.event('verify_candidate')
        return self.candidate
    def close_admission(self):
        self.event('close_admission')
        self.opened = False
    def stop_and_prove_exit(self):
        self.stop_calls += 1
        if self.fail_second_stop and self.stop_calls == 2:
            raise UpdateFailure('exit not proved')
        self.event('stop_and_prove_exit')
        assert not self.opened
        self.live_candidate = False
    def start_candidate(self, candidate, verified):
        self.live_candidate = True
        self.event('start_candidate')
        assert not self.opened
        return RunningSet(verified, 'old-process' if self.reuse_process else 'new-process',
                          'pinned-image', 'pinned-config')
    def verify_loaded(self, expected):
        self.event('verify_loaded')
        return replace(expected, config_identity='changed') if self.loaded_mismatch else expected
    def approve_active(self, running):
        self.event('approve_active')
        self.active = running
        self.floor = running.databases
        self.promoted = True
    def open_admission(self, expected):
        self.event('open_admission')
        assert self.active == expected
        self.opened = True
    def record_result(self, result):
        self.event('record_result')
        self.results.append(result)
    def invalidate_approval(self):
        self.event('invalidate_approval')
        self.active = None
    def cleanup_candidate(self, candidate):
        assert not self.live_candidate or self.promoted, 'candidate referenced by unapproved process'
        self.event('cleanup_candidate')


class ScannerPolicyTests(unittest.TestCase):
    def test_cold_activation_is_ordered_and_requires_verified_new_process(self):
        host = FakeHost()
        self.assertEqual(update(host), 'COLD_ACTIVATION_VERIFIED')
        expected = ['close_admission', 'stop_and_prove_exit', 'start_candidate',
                    'verify_loaded', 'approve_active', 'open_admission']
        self.assertEqual([event for event in host.events if event in expected], expected)
        self.assertTrue(host.opened)

    def test_bootstrap_closes_admission_before_candidate_preparation(self):
        host = FakeHost(); host.active = None
        update(host)
        self.assertLess(host.events.index('close_admission'), host.events.index('prepare_candidate'))

    def test_no_change_keeps_the_original_process_and_signature_date(self):
        host = FakeHost(); host.candidate = host.active.databases
        old = host.active
        self.assertEqual(update(host), 'VERIFIED_UNCHANGED')
        self.assertEqual(host.active, old)
        self.assertNotIn('start_candidate', host.events)
        self.assertNotIn('open_admission', host.events)
        self.assertEqual(host.events.count('verify_active'), 2)

    def test_database_listing_order_does_not_force_a_restart(self):
        host = FakeHost()
        host.candidate = replace(host.active.databases, files=host.active.databases.files[::-1])
        self.assertEqual(update(host), 'VERIFIED_UNCHANGED')

    def test_partial_failed_download_never_promotes_candidate(self):
        host = FakeHost(); host.download_error = DownloadFailure('network check failed')
        old = host.active
        self.assertEqual(update(host), 'DOWNLOAD_FAILED_ACTIVE_UNCHANGED')
        self.assertEqual(host.active, old)
        self.assertTrue(host.opened)
        self.assertNotIn('verify_candidate', host.events)
        self.assertNotIn('approve_active', host.events)
        self.assertEqual(host.events.count('verify_active'), 2)
        self.assertIn('cleanup_candidate', host.events)

    def test_download_error_cannot_preserve_changed_active_identity(self):
        host = FakeHost(); host.change_during_download = True
        host.download_error = DownloadFailure('failed')
        with self.assertRaises(UpdateFailure): update(host)
        self.assertFalse(host.opened)
        self.assertIsNone(host.active)

    def test_non_download_error_never_uses_the_download_fallback(self):
        host = FakeHost(); host.download_error = UpdateFailure('verification failed')
        with self.assertRaises(UpdateFailure): update(host)
        self.assertFalse(host.opened)
        self.assertIsNone(host.active)

    def test_failure_at_each_activation_boundary_closes_and_invalidates(self):
        for point in ('prepare_candidate', 'verify_candidate', 'stop_and_prove_exit',
                      'start_candidate', 'verify_loaded', 'approve_active', 'open_admission'):
            with self.subTest(point=point):
                host = FakeHost(); host.fail_at = point
                with self.assertRaises(UpdateFailure): update(host)
                self.assertFalse(host.opened)
                self.assertIsNone(host.active)

    def test_wrong_runtime_identity_or_reused_process_never_opens(self):
        for flag in ('loaded_mismatch', 'reuse_process'):
            with self.subTest(flag=flag):
                host = FakeHost(); setattr(host, flag, True)
                with self.assertRaises(UpdateFailure): update(host)
                self.assertFalse(host.opened)
                self.assertNotIn('open_admission', host.events)

    def test_signature_age_cannot_be_reset_by_a_successful_check(self):
        for age in (MAX_SIGNATURE_AGE, MAX_SIGNATURE_AGE + 1, -1):
            with self.subTest(age=age):
                host = FakeHost(); host.candidate = databases('b', age)
                with self.assertRaises(UpdateFailure): update(host)
                self.assertFalse(host.opened)
                self.assertNotIn('start_candidate', host.events)

    def test_ambiguous_extra_or_oversized_database_is_rejected(self):
        valid = databases()
        cases = [valid.files[:2], valid.files + (DatabaseFile('extra.ndb', 'c'*64, 1024, 1234),),
                 (valid.files[0], replace(valid.files[0], name='main.cld'), valid.files[2]),
                 (replace(valid.files[0], name='../main.cvd'), *valid.files[1:]),
                 (replace(valid.files[0], size=513*1024*1024), *valid.files[1:]),
                 (replace(valid.files[0], sha256='invalid'), *valid.files[1:])]
        for files in cases:
            with self.subTest(files=files):
                with self.assertRaises(UpdateFailure): replace(valid, files=files).validate(NOW)

    def test_cleanup_failure_cannot_leave_new_admission_open(self):
        host = FakeHost(); host.fail_at = 'cleanup_candidate'
        with self.assertRaises(UpdateFailure): update(host)
        self.assertFalse(host.opened)
        self.assertIsNone(host.active)

    def test_failed_closure_is_not_reported_as_verified_closed(self):
        host = FakeHost(); host.fail_at = 'close_admission'
        with self.assertRaises(UpdateFailure): update(host)
        self.assertIn('FAILED_ADMISSION_CLOSURE_UNVERIFIED', host.results)
        self.assertNotIn('FAILED_CLOSED_VERIFICATION_REQUIRED', host.results)

    def test_a_signed_main_or_bytecode_rollback_is_not_activated(self):
        for index in (0, 1, 2):
            with self.subTest(index=index):
                host = FakeHost(); files = list(host.candidate.files)
                files[index] = replace(files[index], version=1233)
                host.candidate = replace(host.candidate, files=tuple(files))
                with self.assertRaises(UpdateFailure): update(host)
                self.assertFalse(host.opened)
                self.assertNotIn('start_candidate', host.events)

    def test_changed_content_cannot_move_the_signed_daily_time_backwards(self):
        host = FakeHost(); host.candidate = replace(host.candidate, daily_stime=NOW-7200)
        with self.assertRaises(UpdateFailure): update(host)
        self.assertFalse(host.opened)

    def test_signed_version_floor_survives_failed_approval_and_next_attempt(self):
        host = FakeHost(); host.fail_at = 'verify_candidate'
        with self.assertRaises(UpdateFailure): update(host)
        self.assertIsNone(host.active)
        host.fail_at = None
        files = list(host.candidate.files); files[0] = replace(files[0], version=1233)
        host.candidate = replace(host.candidate, files=tuple(files))
        with self.assertRaises(UpdateFailure): update(host)
        self.assertFalse(host.opened)

    def test_identical_file_bytes_cannot_claim_a_new_signed_version(self):
        host = FakeHost(); files = list(host.active.databases.files)
        files[0] = replace(files[0], version=1235)
        host.candidate = replace(host.active.databases, files=tuple(files))
        with self.assertRaises(UpdateFailure): update(host)
        self.assertFalse(host.opened)

    def test_daily_header_and_runtime_version_metadata_must_agree(self):
        with self.assertRaises(UpdateFailure):
            replace(databases(), daily_version=9999).validate(NOW)

    def test_failed_exit_proof_retains_candidate_resources(self):
        host = FakeHost(); host.loaded_mismatch = True; host.fail_second_stop = True
        with self.assertRaises(UpdateFailure): update(host)
        self.assertFalse(host.opened)
        self.assertTrue(host.live_candidate)
        self.assertNotIn('cleanup_candidate', host.events)
        self.assertIn('FAILED_ACTIVATION_RESOURCES_RETAINED', host.results)

    def test_partial_database_change_cannot_disguise_same_byte_metadata_change(self):
        host = FakeHost(); files = list(host.candidate.files)
        files[0] = replace(host.floor.files[0], version=1235)
        host.candidate = replace(host.candidate, files=tuple(files))
        with self.assertRaises(UpdateFailure): update(host)
        self.assertFalse(host.opened)

    def test_download_fallback_rechecks_age_after_the_active_probe(self):
        host = FakeHost(); host.download_error = DownloadFailure('failed')
        original = host.verify_active; calls = 0
        def delayed(expected):
            nonlocal calls
            calls += 1
            if calls == 2: host.clock = expected.databases.daily_stime + MAX_SIGNATURE_AGE
            return original(expected)
        host.verify_active = delayed
        with self.assertRaises(UpdateFailure): update(host)
        self.assertFalse(host.opened)

    def test_approval_crossing_age_limit_never_opens_the_gate(self):
        host = FakeHost(); original = host.approve_active
        def delayed(running):
            original(running)
            host.clock = running.databases.daily_stime + MAX_SIGNATURE_AGE
        host.approve_active = delayed
        with self.assertRaises(UpdateFailure): update(host)
        self.assertFalse(host.opened)
        self.assertNotIn('open_admission', host.events)

    def test_cleanup_crossing_age_limit_cannot_report_success(self):
        host = FakeHost(); original = host.cleanup_candidate
        def delayed(candidate):
            original(candidate)
            host.clock = host.active.databases.daily_stime + MAX_SIGNATURE_AGE
        host.cleanup_candidate = delayed
        with self.assertRaises(UpdateFailure): update(host)
        self.assertFalse(host.opened)

    def test_same_bytes_cannot_claim_a_new_timestamp(self):
        host = FakeHost(); host.candidate = replace(host.active.databases, daily_stime=NOW)
        with self.assertRaises(UpdateFailure): update(host)
        self.assertFalse(host.opened)

    def test_time_expiring_during_load_prevents_admission(self):
        host = FakeHost()
        original = host.verify_loaded
        def delayed(expected):
            host.clock += MAX_SIGNATURE_AGE
            return original(expected)
        host.verify_loaded = delayed
        with self.assertRaises(UpdateFailure): update(host)
        self.assertFalse(host.opened)
        self.assertNotIn('open_admission', host.events)


if __name__ == '__main__':
    unittest.main()
