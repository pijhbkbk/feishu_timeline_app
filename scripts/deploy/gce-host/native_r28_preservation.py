"""Pure, fixed 37→41 data-difference contract. Never changes a database."""
from copy import deepcopy
import re
import native_backup_controller as backup

require = backup.require
NODES = dict(zip((
    'PROJECT_INITIATION', 'DEVELOPMENT_REPORT', 'PAINT_DEVELOPMENT', 'SAMPLE_COLOR_CONFIRMATION',
    'COLOR_NUMBERING', 'PAINT_PROCUREMENT', 'STANDARD_BOARD_PRODUCTION', 'BOARD_DETAIL_UPDATE',
    'PERFORMANCE_TEST', 'FIRST_UNIT_PRODUCTION_PLAN', 'TRIAL_PRODUCTION', 'CAB_REVIEW',
    'DEVELOPMENT_ACCEPTANCE', 'COLOR_CONSISTENCY_REVIEW', 'MASS_PRODUCTION_PLAN', 'MASS_PRODUCTION',
    'VISUAL_COLOR_DIFFERENCE_REVIEW', 'PROJECT_CLOSED'), (
    'project_manager', 'project_manager', 'process_engineer', 'reviewer', 'process_engineer',
    'purchaser', 'process_engineer', 'process_engineer', 'quality_engineer', 'production_operator',
    'process_engineer', 'reviewer', 'finance', 'reviewer', 'production_operator', 'production_operator',
    'quality_engineer', 'project_manager')))
ROLE_NAMES = {'project_manager': '项目协调', 'process_engineer': '工艺', 'purchaser': '采购',
              'quality_engineer': '质量试验', 'reviewer': '评审', 'production_operator': '生产', 'finance': '财务'}
PERMISSIONS = {'project.read', 'workflow.transition', 'attachment.manage', 'dashboard.read'}
OPEN = {'PENDING', 'READY', 'IN_PROGRESS', 'RETURNED'}
MONTHLY_OPEN = {'PENDING', 'IN_PROGRESS', 'OVERDUE'}
NEW_TABLES = {'notification_digest_items', 'reminder_scan_states'}
REASON = 'R28 受控版本迁移：未完任务改用已存在的有效团队角色；保留历史署名'


def timestamp(value):
    require(isinstance(value, str) and re.fullmatch(r'\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)?', value),
            'Invalid generated timestamp')


def without(row, *keys):
    return {key: value for key, value in row.items() if key not in keys}


def verify_migration(before, after, manifest):
    require(len(before) == 52 and set(after) == set(before) | NEW_TABLES, 'Migration table set differs')
    require(all(not after[t] for t in NEW_TABLES), 'New reminder state must start empty')
    for table, rows in before.items():
        require(set(rows) <= set(after[table]), 'Migration removed historical rows: ' + table)
        for key, row in rows.items():
            require({col: after[table][key].get(col) for col in row} == row,
                    'Migration changed a historical column: ' + table)
        if table not in {'roles', 'role_permissions', '_prisma_migrations'}:
            require(set(rows) == set(after[table]), 'Migration inserted unexpected rows: ' + table)
    for table, statuses in [('workflow_tasks', OPEN), ('recurring_tasks', MONTHLY_OPEN)]:
        for row in after[table].values():
            active = row['status'] in statuses and (table != 'workflow_tasks' or row['isActive'])
            role = (NODES.get(row['nodeCode']) if table == 'workflow_tasks' else 'quality_engineer') if active else None
            require(not active or role is not None, 'Unknown active workflow node')
            require(row['requiredRoleCode'] == role and row['assignmentEpoch'] == 0, 'Required-role mapping differs')
    for row in after['notifications'].values():
        metadata = row['metadata']
        legacy = row['taskId'] is not None or metadata == 'recurringTaskId' or (isinstance(metadata, (dict, list)) and 'recurringTaskId' in metadata) or (row['dedupeKey'] or '').startswith('team-monthly:')
        require(row['reminderKind'] == ('LEGACY_TASK' if legacy else None) and
                all(row[k] is None for k in ('assignmentEpoch', 'businessDate', 'recurringTaskId', 'stageTaskId')),
                'Legacy reminder mapping differs')
    old_roles = {r['code']: r for r in before['roles'].values()}
    roles = {r['code']: r for r in after['roles'].values()}
    require(len(roles) == len(after['roles']) and set(roles) == set(old_roles) | set(ROLE_NAMES), 'Role catalog differs')
    for code in set(ROLE_NAMES) - set(old_roles):
        row = roles[code]
        expected = {'id': 'role_production_operator_v1' if code == 'production_operator' else 'role_r28_' + code,
                    'code': code, 'name': ROLE_NAMES[code], 'description': '负责首台计划、排产与批量生产。' if code == 'production_operator' else None,
                    'status': 'ACTIVE', 'isSystem': True}
        require(without(row, 'createdAt', 'updatedAt') == expected, 'Inserted role differs')
        timestamp(row['createdAt']); require(row['createdAt'] == row['updatedAt'], 'Role timestamps differ')
    production_id = roles['production_operator']['id']
    existing = {r['permissionCode'] for r in before['role_permissions'].values() if r['roleId'] == production_id}
    added = [r for key, r in after['role_permissions'].items() if key not in before['role_permissions']]
    require({r['permissionCode'] for r in added} == PERMISSIONS - existing and len(added) == len(PERMISSIONS - existing),
            'Production permission additions differ')
    for row in added:
        expected = {'id': 'permission_production_' + row['permissionCode'].replace('.', '_'), 'roleId': production_id,
                    'permissionCode': row['permissionCode'], 'description': None}
        require(without(row, 'createdAt', 'updatedAt') == expected, 'Inserted production permission differs')
        timestamp(row['createdAt']); require(row['createdAt'] == row['updatedAt'], 'Permission timestamps differ')
    migrations = list(after['_prisma_migrations'].values())
    require(len(migrations) == 41 and {r['migration_name']: r['checksum'] for r in migrations} == manifest and
            all(r['finished_at'] and not r['rolled_back_at'] for r in migrations), 'Fixed migration history differs')


def candidates(snapshot, role_code):
    role_ids = {r['id'] for r in snapshot['roles'].values() if r['code'] == role_code and r['status'] == 'ACTIVE'}
    user_ids = {r['userId'] for r in snapshot['user_roles'].values() if r['roleId'] in role_ids}
    credential_ids = {r['userId'] for r in snapshot['local_credentials'].values()}
    return {key: row for key, row in snapshot['users'].items() if key in user_ids & credential_ids and row['status'] == 'ACTIVE'}


def verify_reconcile(before, after):
    require(set(before) == set(after), 'Reconcile table inventory differs')
    expected = deepcopy(before)
    audits = {}
    notifications = {}
    for table, field, statuses in [('workflow_tasks', 'assigneeUserId', OPEN), ('recurring_tasks', 'reviewerId', MONTHLY_OPEN)]:
        for key, row in before[table].items():
            if row['status'] not in statuses or (table == 'workflow_tasks' and not row['isActive']):
                continue
            role = NODES[row['nodeCode']] if table == 'workflow_tasks' else 'quality_engineer'
            eligible = candidates(before, role)
            owner = row[field] if row[field] in eligible else next(iter(eligible)) if len(eligible) == 1 else None
            if row[field] == owner and row['requiredRoleCode'] == role:
                continue
            target = expected[table][key]
            target[field] = owner
            target['requiredRoleCode'] = role
            target['assignmentEpoch'] += 1
            if row['status'] == 'IN_PROGRESS': target['status'] = 'READY' if table == 'workflow_tasks' else 'PENDING'
            if table == 'workflow_tasks' and row[field] not in eligible:
                target['assigneeDepartmentId'] = eligible[owner]['departmentId'] if owner else None
            timestamp(after[table][key]['updatedAt'])
            target['updatedAt'] = after[table][key]['updatedAt']
            monthly = table == 'recurring_tasks'
            audit = {'actorUserId': None, 'projectId': row['projectId'], 'targetType': 'WORKFLOW_TASK', 'targetId': key,
                     'action': 'TEAM_MONTHLY_TASK_REASSIGNED' if monthly else 'TEAM_TASK_REASSIGNED',
                     'nodeCode': 'VISUAL_COLOR_DIFFERENCE_REVIEW' if monthly else row['nodeCode'], 'summary': None,
                     'beforeData': {field: row[field], 'assignmentEpoch': row['assignmentEpoch']},
                     'afterData': {field: owner, 'assignmentEpoch': target['assignmentEpoch']},
                     'metadata': {'reason': REASON, **({'periodIndex': row['periodIndex']} if monthly else {})}}
            audits[(audit['action'], key)] = audit
            if not monthly and row['nodeCode'] != 'VISUAL_COLOR_DIFFERENCE_REVIEW':
                for uid in ([owner] if owner else eligible):
                    dedupe = 'ACTIVATE:ordinary:' + key + ':' + uid
                    notice = {'userId': uid, 'projectId': row['projectId'], 'taskId': key,
                        'notificationType': 'TASK_ASSIGNED', 'reminderKind': 'ACTIVATE', 'assignmentEpoch': target['assignmentEpoch'],
                        'stageTaskId': key, 'title': ('待办' if owner else '可领取') + '：' + row['nodeName'],
                        'content': '任务已分配给你，请在我的工作中处理。' if owner else '角色队列有新任务，领取后即可办理。',
                        'linkPath': '/projects/' + row['projectId'] + '/tasks/' + key, 'sendChannel': 'IN_APP', 'sendStatus': 'SENT',
                        'dedupeKey': dedupe, 'businessDate': None, 'recurringTaskId': None, 'isRead': False, 'readAt': None,
                        'retryCount': 0, 'metadata': None}
                    existing = [n for n in before['notifications'].values() if n['sendChannel'] == 'IN_APP' and n['dedupeKey'] == dedupe]
                    require(len(existing) <= 1, 'Duplicate historical notification key')
                    if existing:
                        old = existing[0]
                        require(all(old[k] == notice[k] for k in ('userId', 'projectId', 'taskId', 'notificationType')), 'Historical notification key collision')
                        updated = expected['notifications'][old['id']]
                        updated['assignmentEpoch'] = target['assignmentEpoch']; updated['stageTaskId'] = key
                        timestamp(after['notifications'][old['id']]['updatedAt'])
                        updated['updatedAt'] = after['notifications'][old['id']]['updatedAt']
                    else:
                        notifications[dedupe] = notice
    for table in before:
        if table not in {'audit_logs', 'notifications'}:
            require(after[table] == expected[table], 'Reconcile changed protected data or assignment mapping: ' + table)
    for table in ('audit_logs', 'notifications'):
        for key, row in before[table].items():
            require(after[table].get(key) == expected[table][key], 'Reconcile rewrote historical rows: ' + table)
    new_audits = [row for key, row in after['audit_logs'].items() if key not in before['audit_logs']]
    require(len(new_audits) == len(audits), 'Reconcile audit count differs')
    seen = set()
    for row in new_audits:
        key = (row['action'], row['targetId'])
        require(key not in seen and without(row, 'id', 'createdAt') == audits.get(key), 'Reconcile audit fact differs')
        seen.add(key); timestamp(row['createdAt'])
    new_notifications = [row for key, row in after['notifications'].items() if key not in before['notifications']]
    require(len(new_notifications) == len(notifications), 'Reconcile notification count differs')
    seen = set()
    for row in new_notifications:
        key = row['dedupeKey']
        require(key not in seen and without(row, 'id', 'createdAt', 'updatedAt') == notifications.get(key), 'Reconcile notification differs')
        seen.add(key); timestamp(row['createdAt']); timestamp(row['updatedAt'])
