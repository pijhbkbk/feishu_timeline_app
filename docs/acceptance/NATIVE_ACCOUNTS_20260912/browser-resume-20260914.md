# 2026-09-14 exact-domain browser resumption

- Environment: production, `https://timeline.all-too-well.com/login`.
- Runtime observed by fresh HTTPS Web/API metadata: `f2da3629e13b2653aae8879c98992877d5ef4170`; tree `435fd8f66beef2760ce02388b0948cea35cee55e`.
- Chrome actually rendered the native username/password form, registration and recovery buttons, and the text “使用本系统账号，无需第三方登录。” Screenshots and AX observations are retained in this task's computer-use outputs. These are not a saved multi-route screenshot bundle.
- One browser login attempt returned 401 with the visible generic credential/account error. The native automation's input delivery was not proved; no second browser login was attempted. Do not attribute this to the password hash or to the pattern defect without further evidence.
- A separate normal-TLS HTTP check at 2026-09-14T00:47:56Z used the delivered private credential: login 200, logout 200, subsequent me 401. Web/API metadata both matched the exact runtime above. Credentials and cookies were not printed, recorded, or committed. This is interface evidence, not successful browser-login evidence.

## Confirmed browser validation defect

Chrome Console on the exact production login route reported:

```text
Pattern attribute value [A-Za-z0-9][A-Za-z0-9._-]{2,63} is not a valid regular expression:
Uncaught SyntaxError: Invalid regular expression: /[A-Za-z0-9][A-Za-z0-9._-]{2,63}/v:
Invalid character in character class
```

The literal hyphen is not escaped for the current HTML Unicode Sets pattern grammar. The input's client-side format constraint is therefore ineffective. Server-side username and credential validation remain active; this observation does not prove a server authorization bypass or explain the 401. Reference: [HTML pattern algorithm](https://html.spec.whatwg.org/multipage/input.html#the-pattern-attribute).

The console also showed the failed login request and an unrelated Chrome-extension unload-policy violation. Do not count the extension message as an application defect.

## Browser tool blocker

The in-app browser inventory/new-tab operations timed out and reset the tool. Safari showed the correct title/HTTPS URL but returned a blank screenshot and no page controls. Chrome native controls initially worked, then actions stopped updating reliably and the tool returned noWindowsAvailable and ScreenCaptureKit SCStreamErrorDomain -3811 (audio/video capture failure). The Chrome extension connection also timed out. No browser security settings or global platform permissions were changed.

Actual browser authentication, post-login routes, Network/HAR export, refresh persistence and complete screenshot coverage remain unverified. A usable browser-control connection is required before resuming those actions. Existing public HTTP and previous server verification are retained with their original scope.


## Published correction and remaining browser boundary

The correction is runtime commit `6c70a897ec7643f4681616d801481765aaa8f7bc`, published on the exact domain at 2026-09-14T01:56:49.490849+00:00. Final-image HTML/Unicode Sets validation and the final 27 HTTPS requests passed, including the escaped pattern, current metadata/static assets, native owner login and logout. See `production-runtime-6c70.json` and `production-http-6c70.json`. These do not prove a fresh Chrome console or interactive login after publication.

The user was asked whether manually entering the delivered local-file credential in Chrome reaches the dashboard. No answer or explicit product-owner acceptance has been received. Opening the final login URL through the app returned `queued`, not a visible-page confirmation. Further blind attempts against the failed browser connection were not treated as useful verification. No browser/global security settings were changed.
