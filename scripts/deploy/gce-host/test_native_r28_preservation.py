import copy
import unittest
import native_r28_preservation as contract
import native_backup_controller as backup

NOW = '2026-09-28T10:00:00'


def fixture():
    before = {name: {} for name in ('users', 'roles', 'user_roles', 'local_credentials', 'workflow_tasks',
                                   'recurring_tasks', 'audit_logs', 'notifications', 'notification_digest_items', 'reminder_scan_states')}
    before['roles'] = {'engineer': {'id': 'engineer', 'code': 'process_engineer', 'status': 'ACTIVE'}}
    before['users'] = {'old': {'id': 'old', 'status': 'DISABLED', 'departmentId': 'd'},
                       'valid': {'id': 'valid', 'status': 'ACTIVE', 'departmentId': 'e'}}
    before['local_credentials'] = {'valid': {'userId': 'valid', 'passwordHash': 'synthetic-not-a-real-hash'}}
    before['user_roles'] = {'grant': {'userId': 'valid', 'roleId': 'engineer'}}
    task = {'id': 'open', 'projectId': 'project', 'nodeCode': 'PAINT_DEVELOPMENT', 'nodeName': '油漆开发',
            'status': 'IN_PROGRESS', 'isActive': True, 'assigneeUserId': 'old', 'assigneeDepartmentId': 'd',
            'assignmentEpoch': 0, 'requiredRoleCode': 'process_engineer', 'updatedAt': '2026-09-20T10:00:00',
            'payload': {'historicalAuthor': 'old'}, 'completedAt': None}
    before['workflow_tasks'] = {'open': task, 'completed': {**task, 'id': 'completed', 'status': 'COMPLETED',
                                'completedAt': '2026-09-21T10:00:00', 'requiredRoleCode': None}}
    before['audit_logs'] = {'history': {'id': 'history', 'actorUserId': 'old', 'action': 'SIGNED', 'metadata': {'keep': True}}}
    after = copy.deepcopy(before)
    after['workflow_tasks']['open'].update(assigneeUserId='valid', assigneeDepartmentId='e', assignmentEpoch=1, status='READY', updatedAt=NOW)
    after['audit_logs']['new'] = {'id': 'new', 'createdAt': NOW, 'actorUserId': None, 'projectId': 'project',
        'targetType': 'WORKFLOW_TASK', 'targetId': 'open', 'action': 'TEAM_TASK_REASSIGNED', 'nodeCode': 'PAINT_DEVELOPMENT', 'summary': None,
        'beforeData': {'assigneeUserId': 'old', 'assignmentEpoch': 0},
        'afterData': {'assigneeUserId': 'valid', 'assignmentEpoch': 1}, 'metadata': {'reason': contract.REASON}}
    after['notifications']['notice'] = {'id': 'notice', 'createdAt': NOW, 'updatedAt': NOW, 'userId': 'valid',
        'projectId': 'project', 'taskId': 'open', 'notificationType': 'TASK_ASSIGNED', 'reminderKind': 'ACTIVATE',
        'assignmentEpoch': 1, 'stageTaskId': 'open', 'title': '待办：油漆开发', 'content': '任务已分配给你，请在我的工作中处理。',
        'linkPath': '/projects/project/tasks/open', 'sendChannel': 'IN_APP', 'sendStatus': 'SENT',
        'dedupeKey': 'ACTIVATE:ordinary:open:valid', 'businessDate': None, 'recurringTaskId': None,
        'isRead': False, 'readAt': None, 'retryCount': 0, 'metadata': None}
    return before, after


class PreservationTests(unittest.TestCase):
    def test_exact_transfer_and_idempotent_second_pass(self):
        before, after = fixture()
        contract.verify_reconcile(before, after)
        contract.verify_reconcile(after, after)

    def test_wrong_owner_epoch_status_auth_or_history_is_not_an_allowed_difference(self):
        mutations = [('workflow_tasks', 'open', 'assigneeUserId', 'admin'),
                     ('workflow_tasks', 'open', 'assignmentEpoch', 2),
                     ('workflow_tasks', 'open', 'status', 'COMPLETED'),
                     ('workflow_tasks', 'completed', 'assigneeUserId', 'valid'),
                     ('workflow_tasks', 'completed', 'completedAt', NOW),
                     ('local_credentials', 'valid', 'passwordHash', 'changed'),
                     ('users', 'valid', 'isSystemAdmin', True),
                     ('audit_logs', 'history', 'actorUserId', 'valid'),
                     ('audit_logs', 'new', 'actorUserId', 'valid'),
                     ('notifications', 'notice', 'userId', 'old')]
        for table, key, column, value in mutations:
            with self.subTest(table=table, column=column):
                before, after = fixture(); after[table][key][column] = value
                with self.assertRaises(backup.Failure): contract.verify_reconcile(before, after)

    def test_missing_or_extra_audit_and_task_reminders_rejected(self):
        for table in ('audit_logs', 'notifications'):
            for add in (False, True):
                with self.subTest(table=table, add=add):
                    before, after = fixture(); key = 'new' if table == 'audit_logs' else 'notice'
                    if add: after[table]['extra'] = {**after[table][key], 'id': 'extra'}
                    else: after[table].pop(key)
                    with self.assertRaises(backup.Failure): contract.verify_reconcile(before, after)

    def test_valid_owner_and_unclaimable_null_tasks_preserve_whole_row(self):
        before, _ = fixture()
        before['workflow_tasks']['open']['assigneeUserId'] = 'valid'
        contract.verify_reconcile(before, before)
        before['workflow_tasks']['open']['assigneeUserId'] = None
        before['user_roles'] = {}
        # This stale department and IN_PROGRESS state are intentionally untouched.
        contract.verify_reconcile(before, before)
        after = copy.deepcopy(before); after['workflow_tasks']['open']['assigneeDepartmentId'] = None
        with self.assertRaises(backup.Failure): contract.verify_reconcile(before, after)

    def test_migration_rejects_changed_credential_or_new_grants_before_mapping(self):
        before, _ = fixture()
        for index in range(52 - len(before)): before['synthetic_' + str(index)] = {}
        before.pop('notification_digest_items'); before.pop('reminder_scan_states')
        before['synthetic_50'] = {}; before['synthetic_51'] = {}
        after = copy.deepcopy(before); after['notification_digest_items'] = {}; after['reminder_scan_states'] = {}
        after['local_credentials']['valid']['passwordHash'] = 'changed'
        with self.assertRaisesRegex(backup.Failure, 'historical column'): contract.verify_migration(before, after, {})


if __name__ == '__main__': unittest.main()
