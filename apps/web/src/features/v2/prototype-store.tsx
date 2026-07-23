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
  createdTaskIds: string[];
  recentActivities: Array<{ time: string; text: string }>;
};

type PrototypeStoreValue = PrototypeState & {
  submitProgress: () => void;
  resetPrototype: () => void;
};

const initialState: PrototypeState = {
  progressSubmitted: false,
  nodeStatusOverrides: {},
  createdTaskIds: [],
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
      const parsed = JSON.parse(savedState) as Partial<PrototypeState>;
      setState({
        ...initialState,
        ...parsed,
        nodeStatusOverrides: parsed.nodeStatusOverrides ?? {},
        createdTaskIds: parsed.createdTaskIds ?? [],
        recentActivities: parsed.recentActivities ?? initialState.recentActivities,
      });
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const submitProgress = useCallback(() => {
    setState((currentState) => {
      if (currentState.progressSubmitted) {
        return currentState;
      }

      const nextState: PrototypeState = {
        progressSubmitted: true,
        nodeStatusOverrides: {
          ...currentState.nodeStatusOverrides,
          t006: 'COMPLETED',
          t007: 'PENDING',
          t009: 'PENDING',
          t010: 'IN_PROGRESS',
        },
        createdTaskIds: ['t007', 't009', 't010'],
        recentActivities: [
          { time: '刚刚', text: '张七巧提交了涂料采购进展，首台生产计划已进入进行中' },
          ...currentState.recentActivities,
        ],
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      return nextState;
    });
  }, []);

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
