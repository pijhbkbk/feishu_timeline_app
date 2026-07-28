import Link from 'next/link';

const managementGroups = [
  {
    title: '项目与工序',
    description: '查看项目和工序总台账，调整计划日期、负责人和项目成员。',
    links: [
      { href: '/admin/projects', label: '项目总台账' },
      { href: '/admin/tasks', label: '工序总台账' },
    ],
  },
  {
    title: '组织与成员',
    description: '维护系统用户、公司部门、部门负责人和项目成员关系。',
    links: [{ href: '/admin/organization', label: '组织与人员' }],
  },
  {
    title: '分工与权限',
    description: '管理 18 节点责任矩阵，并核对服务端实际执行的权限边界。',
    links: [
      { href: '/admin/assignments', label: '分工配置' },
      { href: '/admin/permissions', label: '角色权限' },
    ],
  },
  {
    title: '流程与参数',
    description: '通过工序台账核对运行中流程；冻结业务规则继续由服务端统一裁决。',
    links: [{ href: '/admin/tasks', label: '查看运行工序' }],
  },
  {
    title: '审计与异常',
    description: '检索关键写操作、失败、拒绝和越权事件，保留完整审计链路。',
    links: [{ href: '/admin/audit-logs', label: '审计日志' }],
  },
] as const;

export function AdminManageR26() {
  return (
    <main className="r26-admin-manage" data-testid="admin-manage-page">
      <header className="r26-admin-subpage-header">
        <div>
          <Link href="/admin" className="r26-admin-back">← 返回系统概况</Link>
          <h1>进入管理</h1>
          <p>详细管理能力按业务职责归类，避免在系统首页重复展开。</p>
        </div>
      </header>

      <div className="r26-admin-manage__layout">
        <nav aria-label="管理模块" className="r26-admin-manage__nav">
          {managementGroups.map((group, index) => (
            <a href={`#manage-${index + 1}`} key={group.title}>{group.title}</a>
          ))}
        </nav>
        <section className="r26-admin-manage__groups">
          {managementGroups.map((group, index) => (
            <article id={`manage-${index + 1}`} key={group.title}>
              <div>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h2>{group.title}</h2>
                <p>{group.description}</p>
              </div>
              <div className="r26-admin-manage__links">
                {group.links.map((link) => (
                  <Link href={link.href} key={`${group.title}-${link.href}-${link.label}`}>
                    {link.label} <span aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
