"""Fixed final identity from actual immutable build and private registry push.

RepoDigests were read back by the parent task on 2026-09-17. Operations source
and runtime source have separate commits; never replace these values at runtime.
"""
TARGET = {'commit': '13131ee5425017b31ccf77741798a8dc37dbc936',
 'tree': '14001bed5b79c89f2bed9289932adbf876f8d03d',
 'release': 'native-portable-20260917-13131ee54250',
 'buildTime': '2026-09-17T06:59:30Z',
 'images': {'api': 'us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/api@sha256:872e6b8d0800546f51a986ddf03e0b5d2d65c250fa4911b95549c3774a72fc91',
            'web': 'us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/web@sha256:b7b86f39893dce2e49a6f90f6f655e63cd0a4c4043735a5d0cb18ca9592a17e5'},
 'approvedRuntimeChanges': {'apps/api/package.json': 'a650662f78c91cf45845ea66d67c3dea0d1aeafea46a05697916d52273bcc124',
                            'apps/api/prisma/seed.ts': 'c68ccdd053ee7cc2c26a553c3f21c0617af20b173e15e59253d7a27b8f901a7d',
                            'apps/api/src/cli/native-catalog.ts': 'ad41d766c9ed4178a0422296f29f4a2291e316be194af170dda6b3f8e1579bff',
                            'apps/api/src/common/graceful-shutdown.spec.ts': 'ff1bd4e2abde9240d740df2019bd654c4fb56983c73ba04562be1f11007b6346',
                            'apps/api/src/common/graceful-shutdown.ts': '32255032434955dbbb15780d2d24237dd19f34340ef385606aa3e5f50a8ab7fc',
                            'apps/api/src/common/request-drain.interceptor.ts': '38e8dc8655f775388d7c5e1b613f4eaeb9500ce960b6be56084eff4bc1469343',
                            'apps/api/src/main.ts': 'b10f4343a0b9651e2c7a8d4ceb044639ea60a47a8dcb3ebf16038e73ecc4c2a3',
                            'apps/api/src/modules/attachments/attachment-storage-quota.service.ts': 'ad937d852ecca111c2c80f9db081c14e8f4b3143ddedb0d87540de7d3c778fb1',
                            'apps/api/src/modules/catalog/README.md': '7bb8540992a2545666ab5335468b1458fe1e87aefe20016e6db57b2ada2751fc',
                            'apps/api/src/modules/catalog/base-catalog.ts': '75b41827847ec28cbb26bf278c91f40d755fee6c2c0163fb696f03bb6b147714',
                            'apps/api/src/modules/catalog/initialize-catalog.postgres.integration.spec.ts': 'fa9cf4fc23f49ddd63c64411e677055743e538ffa504a9349f2b56593408e034',
                            'apps/api/src/modules/catalog/initialize-catalog.spec.ts': '79f8c4ee44740f97962a4efec905844403314c42f50aad1b5f1376b377d64a7b',
                            'apps/api/src/modules/catalog/initialize-catalog.ts': '729da15493c7bf434c899564d5e66fc8cfc1473f2e44e2e35333673c608e2b28',
                            'apps/api/src/modules/dashboard/dashboard.service.spec.ts': 'bbac03788ded947746e5eb47ebc6ac2070b1f63aa2ae0647870f605fe603d899',
                            'apps/api/src/modules/dashboard/dashboard.service.ts': 'f1b73d8f0586cc5b7be9847734fedf3b6eaa22142515c9ac6cdae17404a52359',
                            'apps/api/src/modules/queue/notification-queue.service.spec.ts': '4666e996ae1a8226f7bb50094ea7eb17dee8d43b648ccadc9f458a3f35d6fdc8',
                            'apps/api/src/modules/queue/notification-queue.service.ts': '0e8d6a408afdd1ea2f4838b74da52acb6eb9a4f9e7a1179267f1192b6899e30a'}}
