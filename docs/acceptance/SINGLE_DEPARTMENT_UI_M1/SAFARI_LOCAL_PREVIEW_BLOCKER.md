# Safari 本地预览加载 BLOCKER_REPORT

- 环境：macOS 原生 Safari，本轮专属 `http://127.0.0.1:3350/login`。runtime commit `a0769e7808ace84a05a36bed6c0edc2e81d097c6`。
- 复现：打开登录页，HTML 可见，样式/脚本未生效，登录按钮禁用、登录态持续加载。原生截图已留在本次会话。
- 已尝试：专属 loopback 代理仅删除 Web 响应的 upgrade-insecure-requests，保留其余 CSP 与 API 响应；刷新两次仍复现。停止盲目刷新。
- 根因：尚未证实；正在核对响应头与 Safari 加载机制，不能将候选推断当作已修复。
- 下一方案：只读核对直接 Web/代理响应和静态资源，取得具体差异后再做限定修复。
- 用户决定：当前不需要。不会开启 Safari 全局自动化、修改系统安全设置或改动正式 HTTPS 环境。
- Safari WebDriver 另因 Allow remote automation 未启用而 UNAVAILABLE，原回执保留。Chrome 完整路径 PASS 不覆盖这项 Safari 失败。

## 2026-10-09 增量复测，不改写上述失败

专属代理源码边界7项及实际 HTTP 对比7项，共14项通过，只删 Web 的 upgrade-insecure-requests；其他安全头和 API 响应不变。使用新的登录请求后原生 Safari 加载暖白灰绿界面并真实登录、显示18节点、读取确认日期/确认方/材料V2与历史作者，材料内容200且真实blob预览入口可用。10月9日关闭预览后，返回地址保持原project/task。跨夜会话已到期，业务请求401；刷新后明确要求登录，正式 /login 样式和按钮正常。两次早先刷新为何保留旧加载状态未证实，不能把缓存推测当已证实根因。

后续重新登录步骤遇两次 ScreenCaptureKit -3811（音视频捕获失败），停止UI重试。最终为 PARTIAL_NATIVE_SMOKE_PASS；Safari 全链上传保存及最终重新登录刷新未执行完成，Chrome完整路径不替代这些证据。未修改 Safari 全局自动化或系统安全设置。详见 safari-native-receipt.json / safari-native-network.json。
