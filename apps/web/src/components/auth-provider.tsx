'use client';

import React from 'react';
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  apiRequest,
  type FrontendRoleCode,
  type SessionResponse,
  type SessionUser,
} from '../lib/auth-client';

type AuthContextValue = {
  user: SessionUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  mockEnabled: boolean;
  feishuEnabled: boolean;
  refreshSession: () => Promise<void>;
  loginWithMock: (input: {
    username?: string;
    name?: string;
    roleCodes?: FrontendRoleCode[];
  }) => Promise<void>;
  startFeishuLogin: () => Promise<void>;
  completeFeishuLogin: (input: { code: string; state?: string | null }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mockEnabled, setMockEnabled] = useState(false);
  const [feishuEnabled, setFeishuEnabled] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (hasLoadedRef.current) {
      return;
    }

    hasLoadedRef.current = true;
    void refreshSession();
  }, []);

  async function refreshSession() {
    setIsLoading(true);
    setError(null);

    try {
      const session = await apiRequest<SessionResponse>('/auth/session');
      applySession(session);
    } catch (sessionError) {
      setUser(null);
      setMockEnabled(false);
      setFeishuEnabled(false);
      setError(sessionError instanceof Error ? sessionError.message : '加载登录态失败。');
    } finally {
      setIsLoading(false);
    }
  }

  async function loginWithMock(input: {
    username?: string;
    name?: string;
    roleCodes?: FrontendRoleCode[];
  }) {
    setError(null);

    const session = await apiRequest<SessionResponse>('/auth/mock-login', {
      method: 'POST',
      body: input,
    });

    applySession(session);
  }

  async function startFeishuLogin() {
    setError(null);
    const response = await apiRequest<{ enabled: boolean; loginUrl: string | null }>(
      '/auth/feishu/login-url',
    );

    if (!response.enabled || !response.loginUrl) {
      throw new Error('飞书登录适配层未配置。');
    }

    window.location.href = response.loginUrl;
  }

  async function completeFeishuLogin(input: { code: string; state?: string | null }) {
    setError(null);

    const session = await apiRequest<SessionResponse>('/auth/feishu/callback', {
      method: 'POST',
      body: input,
    });

    applySession(session);
  }

  async function logout() {
    setError(null);
    await apiRequest<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    });

    startTransition(() => {
      setUser(null);
    });
  }

  function applySession(session: SessionResponse) {
    startTransition(() => {
      setUser(session.user);
      setMockEnabled(session.mockEnabled);
      setFeishuEnabled(session.feishuEnabled);
      setError(null);
    });
  }

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    error,
    mockEnabled,
    feishuEnabled,
    refreshSession,
    loginWithMock,
    startFeishuLogin,
    completeFeishuLogin,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }

  return context;
}
