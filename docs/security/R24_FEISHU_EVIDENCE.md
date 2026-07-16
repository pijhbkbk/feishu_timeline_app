# R24 Feishu Admin Evidence

Observed read-only in the authenticated Feishu developer console on 2026-07-17. The App Secret remained masked and no credential was copied.

## Observed configuration

| Item | Evidence |
|---|---|
| Application | Formal enterprise self-built app, enabled; current changes shown as published |
| App ID | Recorded in masked form as `cli_a940…cc3`; App Secret stayed masked |
| Redirect URLs | `https://timeline.all-too-well.com/login/callback` and `http://localhost:8080/login/callback` |
| API IP allowlist | Production public IP only |
| H5 trusted domain | Empty |
| Desktop homepage | Production `/login/callback` URL |
| Mobile homepage | Empty |
| Published version | `1.1.2`, approved/published 2026-05-18 |
| Release note | Present but generic: application version update |
| Availability | Partial members |
| External bot use | Disabled |
| Associated-organization application sharing | Enabled; requires separate business review |
| Test enterprise/personnel | One test enterprise; 李晓晨 is the only listed test person |

## Enabled permissions

The console showed eight enabled entries across user/application identity for these read-only contact scopes:

- `contact:contact.base:readonly`
- `contact:department.base:readonly`
- `contact:department.organize:readonly`
- `contact:role:readonly`
- `contact:user.base:readonly`

The current repository calls Feishu's OAuth token and user-info endpoints but contains no Contact API call. Therefore the contact/department/role permissions are not justified by current code and fail minimum-permission review as `R24-FEISHU-002`.

## Findings

1. `R24-FEISHU-001` — Medium, open: the formal app still permits a localhost redirect. Production and local testing should use separate apps or the formal app should retain only the production callback.
2. `R24-FEISHU-002` — Medium, open: enabled Contact API scopes exceed the current code's demonstrated need.
3. `R24-FEISHU-003` — configuration blocker: mobile homepage and H5 trusted domain are empty, so mobile/H5 release evidence is incomplete.
4. The one-person test-enterprise delivery method is evidenced, but it cannot provide nine real-person role UAT. R24 used isolated application identities for negative role tests and does not claim nine real Feishu accounts.

No formal Feishu production setting was changed because that would mutate an enabled external production application. Final Feishu result: `EVIDENCE_COMPLETE / CONFIGURATION_FAIL`.
