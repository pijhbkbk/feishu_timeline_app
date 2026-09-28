# R28 手机详情布局 BLOCKER_REPORT（已停止盲试，待证据驱动修复）

- 环境：loopback-only 开发/原生认证，隔离合成数据；正式网站未更新本补丁。
- 精确URL：http://127.0.0.1:3330/projects/cmukxi5iu00259ktgrmzter0i?nodeCode=FIRST_UNIT_PRODUCTION_PLAN
- 基线commit：29ed14c81e297c56699ba571cfc6946a00ccb942；未提交Web差异SHA256：029eb61d218a2d22e3764bd6131ec1c9aca5f783a931ecebc78346f951aad3ef。
- 复现：原生PM登录后打开历史10号任务，依次1440、1024、390宽度；执行r28-native-layout.spec.ts。
- 尝试1：高优先级grid/flex布局，手机面板width:auto，外框右缘434>390（m4-patch-native-final-v3）。
- 尝试2：手机同优先级width/max-width100%，外框回到358，但内部scrollWidth418>358（m4-patch-native-final-v4）。该次另8项回归PASS。
- 已停止再次猜测修改，向GPT-6 Pro提交第9次抽象CSS咨询。未传业务数据/源码。
- 只读computed布局证据：aside列宽418，header/body/footer均418；footer中两列按钮宽162+207、gap9、padding40，合计418。面板未显式定义列，隐式auto列受后代最小内容宽度撑开。证据m4-patch-layout-diagnostic.log及保留失败截图/trace。
- 下一方案：仅本详情页约束面板minmax(0,1fr)列及可收缩直接子项，手机按钮改一列并允许文本换行；保留面板外框、内部溢出及关闭按钮实际点击断言。待咨询/审查核对后再执行新方案；不隐藏溢出、不弱化断言。
- 用户决定：无需；工程修复已授权，发布仍等待本项通过。

## 根因修复验证

实际测量后实施上述局部修复，保留所有断言并加入关闭按钮点击；m4-patch-native-root-cause.log记录9项PASS。此blocker已在本机解除，正式域名复验待发布。没有使用新overflow隐藏规则或删除失败断言。

GPT-6 Pro第9次答复已读：先区分外框/轨道/后代，按实测节点局部修正隐式列和按钮最小内容宽度，保留正常点击而非force或DOM脚本。与本次已保存computed 418px轨道及footer证据一致；咨询不是发布批准或产品验收。
