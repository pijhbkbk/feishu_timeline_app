# R26 Gate 3D 响应式与浏览器证明

## 1440

- 完成项目地图显示 `18 / 18`；
- 第 17 步显示 `12 / 12`；
- 第 18 步区分系统建议与人工决定；
- 项目记录采用单列事实流，无逐字换行或字段重叠；
- 页面级 `scrollWidth == clientWidth`。

## 1024

- 地图保持固定拓扑；
- 右侧详情打开后仍可见地图上下文；
- 页面级 `scrollWidth == clientWidth`；
- 标题、主动作和抽屉内容可读。

## 390

- 桌面 SVG 替换为移动节点总览；
- 节点详情为全屏工序面板；
- 关闭面板后 URL 清除节点参数；
- 点击第 17 步后 URL 写入 taskId，刷新后恢复同一工序；
- 退出治理页面无页面级横向溢出；
- 底部移动导航不遮挡内容。

## 浏览器错误

最终提交部署后使用全新浏览器标签复验：

```text
console errors    0
page errors       0
long skeleton     0
horizontal overflow 0
production requests 0
```

截图与组合回放见同目录 `README.md`。

