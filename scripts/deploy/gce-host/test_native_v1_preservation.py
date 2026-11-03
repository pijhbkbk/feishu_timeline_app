import copy
import json
import unittest
from unittest.mock import patch
import native_backup_controller as backup
import native_v1_preservation as contract


class PreservationTests(unittest.TestCase):
    def setUp(self):
        self.manifest = {f'2026010100{index:04d}_migration': f'{index:064x}' for index in range(54)}
        self.old = dict(list(self.manifest.items())[:41])
        names = ['users', '_prisma_migrations'] + [f'old_table_{index}' for index in range(52)]
        self.before = {'migrations': self.old, 'tables': {
            name: {'columns': ['id', 'createdAt'], 'projection': {'count': 2, 'sha256': 'a' * 64}}
            for name in names}}

    def verify(self, query=lambda sql: '0'):
        with patch.object(contract, 'tables', return_value=list(self.before['tables']) + sorted(contract.NEW_TABLES)), \
                patch.object(contract, 'migration_rows'), \
                patch.object(contract, 'projection', return_value={'count': 2, 'sha256': 'a' * 64}):
            return contract.verify_after(query, self.before, self.manifest)

    def test_fixed_contract_accepts_only_preserved_history_and_exact_backfill(self):
        result = self.verify()
        self.assertTrue(result['oldColumnsUnchanged'])
        self.assertFalse(result['implicitAdmissionGranted'])

    def test_any_old_column_or_row_difference_is_rejected(self):
        self.before['tables']['users']['projection']['sha256'] = 'b' * 64
        with self.assertRaisesRegex(backup.Failure, 'Historical rows'):
            self.verify()

    def test_new_rows_admission_or_backfill_differences_are_rejected(self):
        for fragment in ['production_bases', 'teamAccessApproved', 'FULL JOIN public.person_profiles']:
            with self.subTest(fragment=fragment), self.assertRaises(backup.Failure):
                self.verify(lambda sql: '1' if fragment in sql else '0')

    def test_changed_old_migration_checksum_is_rejected(self):
        self.manifest[next(iter(self.old))] = 'f' * 64
        with self.assertRaisesRegex(backup.Failure, 'Baseline migration binding'):
            self.verify()

    def test_projection_uses_bounded_old_columns_and_exact_historical_filter(self):
        seen = []
        result = contract.projection(lambda sql: seen.append(sql) or '2:' + 'a' * 64,
                                     '_prisma_migrations', ['migration_name', 'checksum'], list(self.old))
        self.assertEqual(result['count'], 2)
        self.assertIn('LIMIT 50001', seen[0])
        self.assertIn('WHERE migration_name IN', seen[0])
        self.assertNotIn('SELECT *', seen[0])
        for table, columns, history in [('users', ['id'], list(self.old)),
                                        ('users', ['id; DROP TABLE users'], None),
                                        ('users', ['id', 'id'], None)]:
            with self.subTest(table=table, columns=columns), self.assertRaises(backup.Failure):
                contract.projection(lambda sql: self.fail('must reject before SQL'), table, columns, history)

    def test_projection_rejects_sentinel_or_malformed_digest(self):
        for raw in ['50001:' + 'a' * 64, '1:missing', 'x' * 101]:
            with self.subTest(raw=raw), self.assertRaises(backup.Failure):
                contract.projection(lambda sql: raw, 'users', ['id'])

    def test_manifest_requires_exact_names_checksums_and_completed_rows(self):
        rows = [{'migration_name': name, 'checksum': digest, 'finished': True, 'rolled_back': False}
                for name, digest in self.manifest.items()]
        contract.migration_rows(lambda sql: json.dumps(rows), self.manifest)
        for field, value in [('checksum', 'f' * 64), ('finished', False), ('rolled_back', True)]:
            wrong = copy.deepcopy(rows)
            wrong[0][field] = value
            with self.subTest(field=field), self.assertRaises(backup.Failure):
                contract.migration_rows(lambda sql: json.dumps(wrong), self.manifest)


if __name__ == '__main__':
    unittest.main()
