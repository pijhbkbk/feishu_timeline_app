'use client';
import Link from 'next/link';
import React from 'react';
import { useAuth } from '../../components/auth-provider';
import { FRONTEND_ROLE_OPTIONS } from '../../lib/auth-client';
import { defaultHome } from '../../lib/auth-navigation';

export default function AccountPage() {
  const { user } = useAuth();
  if (!user) return null;
  const roles = FRONTEND_ROLE_OPTIONS.filter(role => user.roleCodes.includes(role.code)).map(role => role.label);
  if (user.isSystemAdmin && !roles.includes('系统管理员')) roles.unshift('系统管理员');
  return <section className="page-card native-account-card">
    <p className="eyebrow">个人资料</p><h1>我的账号</h1>
    <dl className="native-profile-details">
      <div><dt>姓名</dt><dd>{user.name}</dd></div>
      <div><dt>工号</dt><dd>{user.username}</dd></div>
      <div><dt>正式角色</dt><dd>{roles.join('、') || '尚未分配'}</dd></div>
      <div><dt>所属部门</dt><dd>{user.departmentName || '尚未分配'}</dd></div>
    </dl>
    <div className="page-actions"><Link href={defaultHome(user)} className="button button-primary">返回工作台</Link><Link href="/account/security" className="button">账号安全／修改密码</Link></div>
    {user.isSystemAdmin && user.roleCodes.includes('admin') && <p><Link href="/admin/accounts">管理账号</Link> · <Link href="/admin/organization">组织与权限</Link></p>}
  </section>;
}
