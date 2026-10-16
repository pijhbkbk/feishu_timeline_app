# 最终候选导出独立核验索引

范围只限manifest中16份明确XLSX与4份最终剪贴板本地图片，原件只读。版本：人员/产量/千行导出a53，检验a6a；不是把a6a文件重新标成a53。a53颜色快输另有历史真实FAIL，68原路径专项和快输现已闭合；文件结构核验本身不证明该交互通过。新颜色模板已补独立解析，见末节。

结果：16份XLSX结构读取0错误，实际媒体43份、drawing图片实例43份（42个oneCellAnchor、1个twoCellAnchor），所有43份PNG通过Pillow.verify。公式0、外部关系0、特殊嵌入对象0。隐藏图片清单40项hash均存在于媒体字节；空清单只代表该文件无已持久化图片身份，不据此说新增图拥有有效服务器ID。图片数量与文件级SHA是结构事实，UI授权/归属/提交结果另看各run证据。

| 来源run | 文件 | 范围 | media/drawing | 文件SHA-256 |
|---|---|---|---:|---|
| `person-evidence/1791875967743046000` | [linked-profile.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/person-evidence/1791875967743046000/results/person-Ordinary-worker-lin-1bb7c-ority-or-historical-records/linked-profile.xlsx) | 人员库 / A1:M2 | 0/0 | `279800786a06519e4f63c3a0a0603d4e9add0d32f9c15ea77460a7f744e93653` |
| `person-evidence/1791875967743046000` | [linked-readonly-import.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/person-evidence/1791875967743046000/results/person-Ordinary-worker-lin-1bb7c-ority-or-historical-records/linked-readonly-import.xlsx) | 人员库 / A1:M2 | 0/0 | `4c0ddfc4db25db363a522b5f6d28df63ca18cc2a76da923ce7d67489a8299202` |
| `person-evidence/1791875967743046000` | [people-before.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/person-evidence/1791875967743046000/results/person-Ordinary-worker-two-95b3b--update-and-unlinked-import/people-before.xlsx) | 人员库 / A1:M3 | 0/0 | `55f58d8eaefc4d2516714b45c5e38ee2014287b8d4bed99d7a5d003809b76049` |
| `person-evidence/1791875967743046000` | [people-new-source.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/person-evidence/1791875967743046000/results/person-Ordinary-worker-two-95b3b--update-and-unlinked-import/people-new-source.xlsx) | 人员 / A1:C2 | 0/0 | `3859459ee01113fcb264fa288a400c97e1619e1ac0712aa0000adb12c2ef17bf` |
| `person-evidence/1791875967743046000` | [people-update-by-id.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/person-evidence/1791875967743046000/results/person-Ordinary-worker-two-95b3b--update-and-unlinked-import/people-update-by-id.xlsx) | 人员库 / A1:M3 | 0/0 | `d82bbdd8805090874345a000817ffd991985ab185b95f2beaf6fd68b9f5b9da1` |
| `production-evidence/1791876002772823000` | [duplicate-unknown-total.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/production-evidence/1791876002772823000/results/production-Ordinary-member-4f16a-o-and-image-XLSX-round-trip/duplicate-unknown-total.xlsx) | 错误来源 / A1:E5 | 0/0 | `78b454ea29f3d3df2f9343ec367356edd0bc06f21732e422a4eaaf6bb5777709` |
| `production-evidence/1791876002772823000` | [monthly-after-import-with-image.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/production-evidence/1791876002772823000/results/production-Ordinary-member-4f16a-o-and-image-XLSX-round-trip/monthly-after-import-with-image.xlsx) | 月度产量 / A1:K4 | 2/2 | `c583c50d03ec2e46311ccf2e6466b445c483f4cc52d73e42671330645c461570` |
| `production-evidence/1791876002772823000` | [monthly-before-import.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/production-evidence/1791876002772823000/results/production-Ordinary-member-4f16a-o-and-image-XLSX-round-trip/monthly-before-import.xlsx) | 月度产量 / A1:K4 | 0/0 | `c289557f29013c33c6def8b413d56b634f24942e700c9ea8b6247090d5375bca` |
| `production-evidence/1791876002772823000` | [monthly-cross-row-png-pending-owner.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/production-evidence/1791876002772823000/results/production-Ordinary-member-4f16a-o-and-image-XLSX-round-trip/monthly-cross-row-png-pending-owner.xlsx) | 月度产量 / A1:K4 | 3/3 | `2e48212a8989423b115d7b67264906f8c7f4a1c269e7a6f2338a1ed07df7b9b9` |
| `production-evidence/1791876002772823000` | [monthly-update-with-image.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/production-evidence/1791876002772823000/results/production-Ordinary-member-4f16a-o-and-image-XLSX-round-trip/monthly-update-with-image.xlsx) | 月度产量 / A1:K4 | 2/2 | `3fbda851dec41d7cad092471b384c933ea41d9a6e95c95f5fd0c3547f0d5e006` |
| `production-evidence/1791876019800970000` | [source-A-month-total-100.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/production-evidence/1791876019800970000/results/production-Cross-file-prod-a775d--40-and-60-from-later-files/source-A-month-total-100.xlsx) | A全月总量 / A1:E2 | 0/0 | `6682ec3f374587a3f3419566823244d84971b1f2e7f8c907971549c8dd8e8d81` |
| `production-evidence/1791876019800970000` | [source-B-covered-details-40-60.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/production-evidence/1791876019800970000/results/production-Cross-file-prod-a775d--40-and-60-from-later-files/source-B-covered-details-40-60.xlsx) | B同范围明细 / A1:E3 | 0/0 | `925e2318237dc20116eb666b0ecb058f634b042e4effc01163ea1737d1752bfc` |
| `production-evidence/1791876019800970000` | [source-C-overlapping-month-totals-40-60.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/production-evidence/1791876019800970000/results/production-Cross-file-prod-a775d--40-and-60-from-later-files/source-C-overlapping-month-totals-40-60.xlsx) | C同范围误报总量 / A1:E3 | 0/0 | `deedec3774fabc38f5aea71fa5db2c72a4e02df73029739ef94278d51e880869` |
| `inspection-evidence/1791875015462608000` | [inspection-template-note-update.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/inspection-evidence/1791875015462608000/results/inspection-普通员工从-UI-创建-2-台次-4-测量组-12-角度，3-张照片、总体结论和含图模板回读/inspection-template-note-update.xlsx) | 车辆与样件台次 / A1:AD3 | 3/3 | `9970114d91ae0d9d957fe309bb17a45e6ba5ca671c458910ac4db2d20cab1ef1` |
| `inspection-evidence/1791875015462608000` | [inspection-with-three-photos.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/inspection-evidence/1791875015462608000/results/inspection-普通员工从-UI-创建-2-台次-4-测量组-12-角度，3-张照片、总体结论和含图模板回读/inspection-with-three-photos.xlsx) | 车辆与样件台次 / A1:AD3 | 3/3 | `d041f66f9d9ecd8a48e4036729e38a01c57e8ac6f94f0c1d208a611b2d96b86c` |
| `compound-performance-evidence/1791877773130224000` | [personal-comparison-input.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/compound-performance-evidence/1791877773130224000/results/compound-performance-1000--164e8--5-successful-100x10-pastes/personal-comparison-input.xlsx) | 车辆与样件台次 / A1:AD1001 | 30/30 | `b356b248aed31b5d9f3f42dcc73221dca4db7a01944bb540f70291fa9f86a977` |

## 关键文件边界

- 最终千行台次导出是真实1000条记录、A1:AD1001：A:B技术ID/版本，C:Y共23业务字段，Z:AD为5个关联字段；30图及30项隐藏图片身份清单。SHA与旧25a Personal输入不同，不能替换Personal已完成对照的源文件。
- a6a检验导出/备注修改副本均3媒体3drawing，实际A1:AD3；两份都保留真实图片字节。
- a53产量导出后2图；修改输入也含2图但无原有图片身份清单，属于导入新增图片样本；跨行歧义样本额外保留第3张twoCellAnchor图片，不能把它因无法自动归属删掉。UI证明其待选择归属、选择后恢复可提交但取消零写，结构核验本身不提交。
- 产量旧revision模板、重复/未知总量、跨文件明细/重叠总量是负向样本；能读文件不意味着允许提交。人员只读修改样本同理。

## 最终剪贴板本地字节复核

来源 `clipboard-evidence/1791877359577672000`；独立读取保存下来的4份文件，不访问服务器、不重新准备剪贴板。它们的SHA均与浏览器proof相应字段一致。截图源PNG与实际粘贴PNG容器SHA不同，但两者均1070×535，RGBA SHA均 `28373ecabe9fcc9d3b141d54c11bdd8bfdb3d26f603b8b5099193c8214ac68db`，独立像素核对通过。新browser context服务器原件读回是该run的另行证据，不冒充本次又访问API。

| 本地图片 | 文件SHA-256 | 像素尺寸 | 独立解码与浏览器hash |
|---|---|---|---|
| `transparent-image.png` | `d9e22f6c9d1a3eaa5cfefa5125c016bf4256db63350c737232c7daf4c0bf90c3` | 97×65 | verify / sourceHash一致 |
| `local-image.jpeg` | `2f0210c0b601ab1c1f45e02b19cbf056f4a3e9dcf06443ddda46c8a40d80ed43` | 1920×1080 | verify / sourceHash一致 |
| `clipboard-source-screenshot.png` | `245808779d066bf00045861673cb7f635e21daab90a30c7cf66b256a4311a25b` | 1070×535 | verify / sourceHash一致 / RGBA一致 |
| `actual-clipboard-paste.png` | `6b59328b8ec9f9fb361b3a04a47c6f41039f68e9023cd5f7719d537247449d6b` | 1070×535 | verify / sourceHash一致 / RGBA一致 |

结构细节、每个媒体SHA/尺寸、每个drawing锚点、sheet可见性和隐藏列见 `xlsx-final-independent-summary.json`；显式输入清单为 `xlsx-final-manifest.json`。本轮没有重新启动Excel/WPS/LibreOffice；Office仍为既有production部分通过、inspection超时的OFFICE_NOT_VERIFIED。既有26份/52图的历史索引保持独立，不覆盖。

## 后续候选补查规则

1. 等新颜色模板run结束且确认其实际runtime，定位该run下导出前/后、修改备注、只读名称、普通name+base、缺base六份明确XLSX。先记录运行PASS/FAIL，再将路径加入独立新manifest；不根据出现文件推断测试完成。
2. 运行同一只读ZIP/XML+Pillow核验，比较导出前后媒体bytes/hash/隐藏imageId+recordId清单；核实no-op图片并无新上传应结合浏览器Network。
3. 如修复新颜色快输产生新runtime，旧a53文件/性能仍保留原版本，按受影响范围补新的证据，不能重命名旧run。
4. 最后交付索引可聚合去重路径，但每文件保留所属run/commit与原始SHA。无新GUI/业务写入、无Office盲重试、无Personal重跑。

## 已补：a53颜色当前模板1791878099967285000

该run实际1 PASS/3.3m，runtimea53。6份XLSX独立读取0错误，4份系统模板各 **15媒体/15drawing/15隐藏图片身份项**，不是估计14张；2份普通表无图。60份媒体均Pillow.verify通过；导出前后媒体SHA多重集合、imageId/recordId/hash清单完全相同。公式0。完整锚点及逐媒体SHA见 `xlsx-color-final-independent-summary.json`。本次新增结构核验共22份XLSX、103媒体/103drawing，另4份独立剪贴板源图；原26份历史索引不覆盖。

| 文件 | 媒体/drawing | SHA-256 |
|---|---:|---|
| [color-current-after.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/results/color-template-current-col-81b3a--ordinary-name-base-mapping/color-current-after.xlsx) | 15/15 | `21df010e9663c70f6a8fd3ee2c6113a4ac5cc730602d940d11630cb39e9e64da` |
| [color-current-before.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/results/color-template-current-col-81b3a--ordinary-name-base-mapping/color-current-before.xlsx) | 15/15 | `f2db9ef693d713db15895157df61590cd80a12287ccca297dfdd8228aa1339e6` |
| [color-ordinary-missing-base.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/results/color-template-current-col-81b3a--ordinary-name-base-mapping/color-ordinary-missing-base.xlsx) | 0/0 | `32046675a9b7a0136f2bbfbf03c0408461643ebc64f0ed3ffcc6d902c9da706e` |
| [color-ordinary-name-base.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/results/color-template-current-col-81b3a--ordinary-name-base-mapping/color-ordinary-name-base.xlsx) | 0/0 | `1c13f4030af3de736c40deec102928dc43860cb2c229183b3d593c5ce5a39a78` |
| [color-readonly-name.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/results/color-template-current-col-81b3a--ordinary-name-base-mapping/color-readonly-name.xlsx) | 15/15 | `12c3cfe6433a1b956b2ba9da0cfd96e27da29407d12053e2dacf5a84f7d39a69` |
| [color-update-note.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/results/color-template-current-col-81b3a--ordinary-name-base-mapping/color-update-note.xlsx) | 15/15 | `77312ad48b70b181e9d787dd97ffd1c1496ea47e5e280675607b5ec3a1cb51ac` |

业务证据仅两次颜色PATCH：同一合成Color.id expectedRevision116→117模板备注、117→118普通名+基地唯一匹配；no-op重导时总command数保持1且15张图不变。只读改名、缺基地普通表拒绝；没有图片上传，89来源hash前后相同。5条精确原件429及后续成功/Retry-After恢复单独保留，不写成console零错误、不全局忽略429。

颜色模板PASS不能覆盖紧接之前 `color-comparison-evidence/1791877984543387000` 快速连续输入真实错行FAIL。前后导出忠实保留此次开始时两条合成记录的实际值，未修复/清理先前失败记录。68自动保存边界修复及同路径专项/快输已闭合，见C68_LATEST_STATUS；备份恢复与完整复验待补。此处a53文件仍保留原版本。

## 68最新剪贴板源图（无XLSX）

`clipboard-evidence/1791879230973373000` 1 PASS/55.0s；该目录没有XLSX，不伪造含图导出。本次仅4个明确本地图独立读取：transparent-image.png (97×65 PNG)、local-image.jpeg (1920×1080 JPEG)、clipboard-source-screenshot.png与actual-clipboard-paste.png (1070×535 PNG)。均Pillow.verify通过且SHA对应浏览器proof一致；后两图RGBA SHA同 `7042509bfb2f9d7657e1307094e8987e1f909199ed3d9ddaa25a5e6825d0b94c`。原图容器hash分别d14b7ddb…、585ed54b…不同但像素一致，完整SHA见 `clipboard-68-independent-summary.json`；显式输入见 `clipboard-68-independent-manifest.json`。

68最新千行run完成后已独立核验，见以下结果；未读取写入中样本，未重启浏览器。

## 68最终千行导出1791879554116987000

性能run实际1 PASS/3.4m，完成后只读解析其 `personal-comparison-input.xlsx`。文件137544字节，SHA `c8506e02428f05a8ae547715aebd623a4f32de6881e61e56cb89b8e65958d984`；主表车辆与样件台次A1:AD1001（1000条+表头、2技术+23业务+5关联列）；30媒体/30drawing/30隐藏图片身份项，所有媒体Pillow.verify通过，隐藏hash全部命中实际媒体。公式0、外部关系0；逐图SHA/尺寸/锚点、表可见性/隐藏列详见 `xlsx-68-performance-independent-summary.json`，显式输入清单 `xlsx-68-performance-manifest.json`。本次新汇总累计23份XLSX、133媒体/133drawing；历史26份索引仍另存。

原文件属于68runtime，不能用其hash替代Personal已使用的25a输入或a53的30图文件。无原件编辑、业务写入、Office启动或Personal重跑。
