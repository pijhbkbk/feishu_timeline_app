'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import type { R26NodeStatus } from './types';

const STORAGE_KEY = 'R26PrototypeStore';

type PrototypeState = {
  progressSubmitted: boolean;
  nodeStatusOverrides: Record<string, R26NodeStatus>;
  recentActivities: Array<{ time: string; text: string }>;
};

type PrototypeStoreValue = PrototypeState & {
  submitProgress: () => void;
  resetPrototype: () => void;
};

const initialState: PrototypeState = {
  progressSubmitted: false,
  nodeStatusOverrides: {},
  recentActivities: [
    { time: '今天 10:08', text: '张七巧上传了供应商送货单' },
    { time: '昨天 16:40', text: '项目经理提醒补充到货确认记录' },
    { time: '7月18日', text: '星河银第 1 轮驾驶室评审退回' },
  ],
};

const PrototypeStoreContext = createContext<PrototypeStoreValue | null>(null);

export function R26PrototypeProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<PrototypeState>(initialState);

  useEffect(() => {
    const savedState = window.sessionStorage.getItem(STORAGE_KEY);
    if (!savedState) {
      return;
    }

    try {
      setState(JSON.parse(savedState) as PrototypeState);
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const persist = useCallback((nextState: PrototypeState) => {
    setState(nextState);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  }, []);

  const submitProgress = useCallback(() => {
    persist({
      progressSubmitted: true,
      nodeStatusOverrides: {
        t006: 'COMPLETED',
        t007: 'PENDING',
        t010: 'IN_PROGRESS',
      },
      recentActivities: [
        { time: '刚刚', text: '张七巧提交了涂料采购进展，首台生产计划已进入进行中' },
        ...state.recentActivities,
      ],
    });
  }, [persist, state.recentActivities]);

  const resetPrototype = useCallback(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    setState(initialState);
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      submitProgress,
      resetPrototype,
    }),
    [resetPrototype, state, submitProgress],
  );

  return (
    <PrototypeStoreContext.Provider value={value}>
      {children}
    </PrototypeStoreContext.Provider>
  );
}

export function useR26PrototypeStore() {
  const context = useContext(PrototypeStoreContext);
  if (!context) {
    throw new Error('useR26PrototypeStore must be used within R26PrototypeProvider.');
  }

  return context;
}
