'use client';
import Link from 'next/link';
import React from 'react';

export function LoginCallbackClient() {
  return <section className="page-card"><h1>登录方式已更新</h1><p>第三方登录入口已停用，请使用本系统用户名和密码。</p><Link className="button button-primary" href="/login">前往账号登录</Link></section>;
}
