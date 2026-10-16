"""Fixed final login release identity from immutable source and actual registry readback.

The root task read back both private RepoDigests on 2026-09-18. The retained c5
target module remains unchanged for previous-controller installation recovery.
"""
TARGET = {'commit': '541b3dfff682aa29b49a96b251f0a084903c981a',
 'tree': 'bc65d7145a498066556f2abc8d8619a6643dc325',
 'release': 'native-login-20260918-541b3dfff682',
 'buildTime': '2026-09-18T03:23:33Z',
 'images': {'api': 'us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/api@sha256:558a873483641df75dde47b5b39dcc21087c397ae19f364ef03c820b2a52430f',
            'web': 'us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/web@sha256:7cc7ad6328a3e318e5a34af21e56d4840279ba698365ee51661cd3d23050f26f'},
 'approvedRuntimeChanges': {'apps/api/src/cli/native-account.ts': 'bf818da8d9438b2bfc0baf4e2aa1eaa916e8d4cb611634dc316d5a4efdf6d6cf',
                            'apps/api/src/modules/admin/admin-control-center.service.ts': 'b41ef486c49ada42a4e4c85de8df20612b22500652899be001a632559d92ab39',
                            'apps/api/src/modules/admin/dto/admin-control-center.dto.ts': '8772224a08638ce7ce1d8aa868b389fd8f39143ceb2afb21b214f2906a6722e1',
                            'apps/api/src/modules/auth/dto/native-auth.dto.ts': '32a1aa782ea106d3679bb9185adb4ba1a8983be08d998623ac95fa41bef516c3',
                            'apps/api/src/modules/auth/native-auth.postgres.integration.spec.ts': 'fb880ec8d9430e36ef1961a57853c85676fe80bf841e45e17e2343bcca23b969',
                            'apps/api/src/modules/auth/native-auth.rules.ts': '2ba258195c5fa1096defae84f2a66aefedce4771f27f9a0a868728baa0b50257',
                            'apps/api/src/modules/auth/native-auth.service.ts': 'c1801013a3a7ce2fd334afb6ca281d9c59d9127f17e2384dd8e8820f26989b12',
                            'apps/api/src/modules/auth/native-password.service.spec.ts': '9754dbe7316ec72b61467d68c6ac3c4a3bc667a3dc554c59a8c064023b2e99f7',
                            'apps/web/src/app/account/page.tsx': '4a4e51aad7d0c4e09137cd15ee8eabdfb916a46c28a1d6addb4d1e3557e16b97',
                            'apps/web/src/app/admin/accounts/page.tsx': '3ea0fe06d4585fbda06acd0e8be66d698dac2fc2c03222d31350896a507fe00e',
                            'apps/web/src/app/globals.css': '409201b844d0ca72097976e103a558d4627041af4f09d893cb4dbdd62cf17659',
                            'apps/web/src/app/login/callback/login-callback-client.tsx': '8eb31b3033d117de5fc999764c64a83c38701810a166f2fa8050a9962ec5a653',
                            'apps/web/src/app/login/page.tsx': 'd27f76c6e38a8665c8204d6f8617dbd8d67f75ba875f751a234c58d201745db9',
                            'apps/web/src/app/login/username-pattern.test.tsx': '35a6415b686386ac742a167c4540746cdd69bfbb8443d3589a9b7ebeeef23996',
                            'apps/web/src/app/r22.css': 'ad2ee844dc2c4ed66fe9a1d5cd930e84ebc406762ca603a9ac8de2126fd867b6',
                            'apps/web/src/components/admin-control-center.tsx': '16491807e78877e1fae6e05a8d06ec24095516a607d9dc80daa09f7b5fd96218',
                            'apps/web/src/components/app-shell.tsx': '2e2112608b95c35e73cb1ec8e4a224e412730cb5067c6055b3122e7851af2205',
                            'apps/web/src/lib/native-password-policy.test.ts': 'fc7a1f034258da3aa3326397131538416ecfb8b8c2750cfe74e399fab3ed0117',
                            'apps/web/src/lib/native-password-policy.ts': '0e9863a37540487cf51afbee371b65c6d5f3f1078dd237cdcce43ba796b97f25',
                            'apps/web/src/lib/navigation.ts': '3866fc09c29b2117c675d964ba183e92f15ad8187f53c1e9c6f9d33a01a85fc3'}}
