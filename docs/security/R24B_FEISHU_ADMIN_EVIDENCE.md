# R24B Feishu Administrator Evidence

## Current status

`PASS — formal configuration, credential rotation, production OAuth and independent test-version staging OAuth all retested`

The formal application's redirect, permission, homepage, availability, publication, and prior OAuth/session/logout controls passed the administrator recheck below. Codex did not change the formal Feishu application.

During later staging-test preparation on 2026-07-17, a local configuration search unintentionally echoed the staging copy of the formal application's App Secret into the tool transcript. The value is not repeated in this evidence. Authenticated testing stopped immediately; the failed temporary capture directory was deleted; no R24B ZAP container remained; and the local environment file was confirmed to be mode `600`, Git-ignored, and untracked. These containment facts do not remove the requirement to rotate the credential.

The formal App Secret was subsequently reset and transferred by the administrator through a one-time localhost handoff page. The value was accepted only through a password input, streamed over IAP standard input, never printed or added to a command argument, and used to update the protected production environment file. The API was restarted, the clipboard was cleared, and only boolean validation results were retained. Staging continues to use the independent test-version App ID and App Secret; neither credential is printed, committed, or copied into evidence.

## Administrator recheck — 2026-07-17

The first read-only recheck after the administrator's update established the redirect, homepage, availability, and publication controls below. A second read-only recheck was performed after the administrator reported the permission cleanup complete.

| Control | Observed result |
|---|---|
| Formal application | Enabled; all current changes published |
| Published version | `1.1.3`; approved and published 2026-07-17 09:07 +08:00 |
| Administrator/publisher | 李晓晨 |
| Redirect list | PASS; only `https://timeline.all-too-well.com/login/callback` remains |
| Formal localhost callback | PASS; removed |
| H5 trusted domain | PASS; `https://timeline.all-too-well.com` |
| Desktop homepage | PASS; `https://timeline.all-too-well.com/` |
| Mobile homepage | PASS; `https://timeline.all-too-well.com/` |
| Desktop/mobile default capability | PASS; Web application |
| Availability | Confirmed as partial members; four explicitly listed individuals |
| External bot use | Disabled for external groups and external-user direct chat |
| Original five Contact scope families | Removed |
| Minimum permission gate | **PASS**; final recheck shows no enabled permission |

The first recheck's nine Contact entries were subsequently removed. The second recheck found eight different Contact entries still enabled. The final recheck after the administrator's second cleanup found an empty permission table with `暂未开通任何权限`; the console also reported `当前修改均已发布`.

All eight Contact entries and the remaining `event:ip_list` entry are now removed. No Feishu API permission is retained.

## Credential-rotation and test-version recheck — 2026-07-17

The administrator supplied sanitized evidence at 10:48 +08:00 showing the **formal application** security page, the exact production callback `https://timeline.all-too-well.com/login/callback`, and `当前修改均已发布`. A fresh production OAuth attempt then reached the formal consent page and requested only the built-in user identifier, proving that redirect validation and the formal App ID were correct after propagation.

The callback returned to the production `/login/callback`, but the application did not establish a session. A read-only IAP check emitted no credential value and established all of the following:

- the production environment file exists;
- the configured App ID is the formal App ID;
- the App Secret field is non-empty;
- the production redirect URI is exact;
- the API service is active and started after the environment file was updated;
- the configured Secret has no outer quotes, CRLF, or edge whitespace;
- Feishu token exchange returned HTTP `400`, and the sanitized upstream classification was `invalid client secret`.

The administrator then recopied the current formal-version Secret through a one-time localhost password handoff. A read-only IAP recheck confirmed the production file was updated within ten minutes, the API started after that update, the service was active, and the production health endpoint returned HTTP 200. A fresh real OAuth flow reached the one-item user-identifier consent page, completed token exchange, established the application session, reached the protected `/projects` page, and logged out. The same protected route then displayed `请先登录`. Credential rotation and post-rotation production regression therefore **PASS**.

Staging was separately verified to use an App ID different from formal, a non-empty test-version Secret, matching frontend/backend App IDs, and the explicit localhost callback. After the test enterprise/person availability was corrected, real test-version OAuth completed. The same person's app-scoped Feishu identifiers then exposed a legitimate cross-application identity collision. Commit `83e5c752fd3cc66faa56c5e9db56933490c1b7c6` reconciled strong identifiers first and then verified email/mobile identifiers, with six regression tests. Staging was rebuilt, real OAuth established the application session, and the final authenticated ZAP used that session without recording its contents.

Feishu's official `authen/v1/user_info` reference states that the endpoint itself requires no scope. These permissions only unlock optional sensitive fields. The repository requires `open_id` and a display name for login; it treats `user_id`, email, and mobile as optional, and does not consume employee information, employee number, gender, search, or work-city data. Therefore the removed Contact entries were not required for the demonstrated authentication flow. `R24-FEISHU-002` is **Fixed / retest pass**.

The final Contact data-range conclusion is `N/A — no Contact permission retained`.

## Verified application use

- Application commit: `f00703ac7834837f9ad573bc11d779a5caa7c02f`
- Production frontend: `https://timeline.all-too-well.com`
- Exact production redirect URI: `https://timeline.all-too-well.com/login/callback`
- Production mock authentication: disabled
- Authorization endpoint: `https://open.feishu.cn/open-apis/authen/v1/index`

The production values were rechecked read-only over the newly restricted IAP administrative path. Only the four non-secret allowlisted configuration fields above were emitted.

### Feishu endpoints called by the repository

| Purpose | Endpoint | Evidence |
|---|---|---|
| Start OAuth authorization | Approved Feishu authorization endpoint `/open-apis/authen/v1/index` | `apps/api/src/common/app-config.ts` and runtime configuration |
| Exchange authorization code | `https://open.feishu.cn/open-apis/authen/v2/oauth/token` | `apps/api/src/modules/feishu/feishu-auth.adapter.ts` |
| Read the authenticated user's OAuth profile | `https://open.feishu.cn/open-apis/authen/v1/user_info` | `apps/api/src/modules/feishu/feishu-auth.adapter.ts` |

No repository caller was found for Contact, department-list, role-list, user-list, or other Contact OpenAPI endpoints. Locally stored departments and roles are application database entities and do not justify Feishu Contact API permission.

## Permission closure checklist

The original R24 Contact entries and the first R24B recheck's additional entries were removed, but the second recheck found eight different unused Contact entries. The administrator must remove every remaining entry unless a separately reviewed code caller and business purpose are supplied:

- [x] Remove user/application entries for `contact:contact.base:readonly`.
- [x] Remove user/application entries for `contact:department.base:readonly`.
- [x] Remove user/application entries for `contact:department.organize:readonly`.
- [x] Remove the application entry for `contact:role:readonly`.
- [x] Remove the user entry for `contact:user.base:readonly`.
- [x] Remove application/user entries for `contact:user.email:readonly`.
- [x] Remove application/user entries for `contact:user.employee:readonly`.
- [x] Remove application/user entries for `contact:user.employee_id:readonly`.
- [x] Remove application/user entries for `contact:user.employee_number:read`.
- [x] Remove the user entry for `contact:user.gender:readonly`.
- [x] Remove the application entry for `contact:user.gender:readonly`.
- [x] Remove application/user entries for `contact:user.id:readonly`.
- [x] Remove application/user entries for `contact:user.phone:readonly`.
- [x] Remove the user entry for `contact:user:search`.
- [x] Remove application/user entries for `contact:work_city:readonly`.
- [x] Remove `event:ip_list`.
- [x] Confirm no Contact/department/role/user-list scope remains enabled.
- [x] Record a one-line purpose for every retained non-Contact permission: N/A; no permission retained.
- [x] Confirm the Contact data range is empty/not applicable after removal.

The OAuth `user_info` call is part of the login/profile flow and is not evidence that the application calls Contact OpenAPI. A `mobile` field optionally returned by OAuth user info also does not justify Contact API access.

Expected result for `R24-FEISHU-002`: `Fixed`, after console evidence and OAuth smoke pass.

## Redirect and homepage closure checklist

### Security settings

- [x] Delete `http://localhost:8080/login/callback` from the **formal** application.
- [x] Retain exactly `https://timeline.all-too-well.com/login/callback` as the production OAuth redirect URI.
- [x] Confirm no other localhost, loopback, plain-HTTP, wildcard, obsolete staging, or alternate callback remains in the formal application.
- [x] Do not expose or copy the App Secret while collecting evidence.

The redirect URI must include the exact callback path used in both the authorization request and token exchange. Feishu's redirect validation requires the configured application and callback to match.

Expected result for `R24-FEISHU-001`: `Fixed`, after sanitized console evidence and real production OAuth/session/logout regression pass.

### Web application homepages

The delivered application has responsive mobile navigation and mobile Playwright coverage, and the project scope explicitly includes Feishu H5/mobile layout. Therefore the R24B decision is **mobile/H5 supported**, not N/A.

- [x] Set the desktop homepage to `https://timeline.all-too-well.com/`.
- [x] Set the mobile homepage to `https://timeline.all-too-well.com/`.
- [x] Do not use `/login/callback` as a homepage; it is an OAuth return handler and shows an error when opened without a code.
- [x] Set the H5 trusted domain/origin to the production application origin required by the console: `https://timeline.all-too-well.com`.
- [x] Confirm the desktop and mobile entries open the application homepage and reach the normal login/session flow.

Feishu recommends configuring the mobile homepage as the application's own business domain, separating the login-state check from the OAuth callback flow. H5 trusted-domain configuration must match the web application origin when client-side H5/JSAPI capability is in scope.

Expected result for `R24-FEISHU-003`: `Fixed`, after desktop/mobile console evidence and mobile smoke pass.

## Availability and Contact range checklist

- [x] Record the formal application's exact current availability scope: partial members, four explicitly listed individuals.
- [x] Confirm the approved members through published version `1.1.3`.
- [x] Apply Feishu's minimum-availability principle: the published formal application is limited to four reviewed individuals.
- [x] Record the business decision: the formal application is not available to all enterprise members.
- [x] Confirm the published version uses the same approved availability scope.
- [x] Record the Contact data range separately: `N/A — no Contact permission retained`.

## Administrator evidence required

After the changes are saved and, where required, published, provide sanitized screenshots or permit Codex to perform a read-only console recheck covering:

1. Formal application identity and enabled/published state, with App ID masked and App Secret hidden.
2. Redirect list showing only the exact production HTTPS callback.
3. Enabled permission list after Contact-scope removal.
4. Purpose of every retained permission.
5. Exact application availability scope.
6. Exact Contact data range or `N/A — no Contact permission retained`.
7. Desktop homepage.
8. Mobile homepage.
9. H5 trusted domain.
10. Published version/configuration state.
11. Validation time and administrator confirmation name.

Screenshots must not contain App Secret, OAuth code, token, Cookie, authorization headers, or passwords.

## Retest after administrator completion

Codex will perform, without exposing authentication material:

- formal-console read-only recheck;
- desktop and mobile homepage smoke;
- real Feishu OAuth authorization and callback;
- `/api/auth/session` authenticated proof;
- application project-page smoke;
- logout and old-session invalidation proof;
- permission-error check for any removed Contact API capability, if a safe non-secret console/API signal is available;
- confirmation that the final formal application has no localhost redirect.

## Pending evidence record

| Evidence | Status |
|---|---|
| Localhost redirect removed | PASS |
| Exact production callback retained | PASS |
| Unused Contact permissions removed | PASS; final recheck shows no enabled permission |
| Availability scope confirmed | PASS; partial members, four individuals |
| Contact range minimized/N/A | PASS; N/A because no Contact permission is retained |
| Desktop homepage corrected | PASS |
| Mobile homepage configured | PASS |
| H5 trusted domain configured | PASS |
| Published configuration verified | PASS; version `1.1.3` was published 2026-07-17 09:07 +08:00, and the second recheck reported all current changes published |
| OAuth/session/logout regression | PASS; real formal OAuth authorization, callback, protected project page, logout, and post-logout denial verified |
| Administrator name and validation time | PASS; 李晓晨, 2026-07-17 09:07 +08:00 |
| Formal App Secret rotation after 2026-07-17 transcript exposure | **PASS; one-time hidden handoff updated production, API restarted after the file update, and no value was retained in evidence** |
| Post-rotation production OAuth/session/logout regression | **PASS; consent, callback, token exchange, protected `/projects`, logout, and post-logout denial verified** |
| Independent test-version credentials for staging | **PASS; distinct credentials, callback, account availability, real OAuth, protected session and authenticated DAST all passed** |

The formal configuration, credential-rotation, production OAuth, and independent staging test-version controls are closed. No App Secret, Cookie, token, OAuth code, or authorization header is retained in this evidence.
