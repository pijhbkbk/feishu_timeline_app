'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '../../components/auth-provider';
import { FRONTEND_ROLE_OPTIONS, type FrontendRoleCode } from '../../lib/auth-client';

export default function LoginPage() {
  const router = useRouter();
  const { user, isAuthenticated, mockEnabled, feishuEnabled, loginWithMock, startFeishuLogin } =
    useAuth();
  const [selectedRole, setSelectedRole] = useState<FrontendRoleCode>('project_manager');
  const [username, setUsername] = useState('mock_project_manager');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleMockLogin() {
    setIsSubmitting(true);
    setError(null);

    try {
      const payload: {
        username?: string;
        name?: string;
        roleCodes: FrontendRoleCode[];
      } = {
        roleCodes: [selectedRole],
      };

      if (username.trim()) {
        payload.username = username.trim();
      }

      if (displayName.trim()) {
        payload.name = displayName.trim();
      }

      await loginWithMock({
        ...payload,
      });
      router.replace('/projects');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Mock 登录失败。');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFeishuLogin() {
    setError(null);

    try {
      await startFeishuLogin();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '飞书登录不可用。');
    }
  }

  return (
    <section className="page-card auth-card">
      <p className="eyebrow">Authentication</p>
      <h1>登录系统</h1>
      <p>飞书负责身份认证，本系统会建立独立会话并在后端执行权限校验。</p>

      {isAuthenticated && user ? (
        <div className="panel">
          <strong>当前已登录为 {user.name}</strong>
          <p className="muted">角色：{user.roleCodes.join(', ')}</p>
        </div>
      ) : null}

      <div className="auth-sections">
        <section className="panel">
          <h2>飞书登录</h2>
          <p className="muted">当前是可替换适配层，接入真实接口后无需改动前端调用方式。</p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => void handleFeishuLogin()}
            disabled={!feishuEnabled}
          >
            {feishuEnabled ? '使用飞书登录' : '飞书登录未配置'}
          </button>
        </section>

        <section className="panel">
          <h2>Mock 登录</h2>
          <p className="muted">仅用于本地开发联调。系统会在后端创建自己的用户会话。</p>

          <label className="field">
            <span>角色</span>
            <select
              value={selectedRole}
              onChange={(event) => {
                const role = event.target.value as FrontendRoleCode;
                setSelectedRole(role);
                setUsername(`mock_${role}`);
              }}
              disabled={!mockEnabled || isSubmitting}
            >
              {FRONTEND_ROLE_OPTIONS.map((role) => (
                <option key={role.code} value={role.code}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>用户名</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={!mockEnabled || isSubmitting}
            />
          </label>

          <label className="field">
            <span>显示名</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="可选"
              disabled={!mockEnabled || isSubmitting}
            />
          </label>

          <button
            type="button"
            className="button button-secondary"
            onClick={() => void handleMockLogin()}
            disabled={!mockEnabled || isSubmitting}
          >
            {mockEnabled ? (isSubmitting ? '登录中…' : '使用 Mock 登录') : 'Mock 登录已关闭'}
          </button>
        </section>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}
