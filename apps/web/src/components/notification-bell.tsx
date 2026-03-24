'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import {
  fetchMyNotifications,
  fetchNotificationUnreadCount,
  formatNotificationTime,
  getNotificationTypeLabel,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
  type NotificationListResponse,
} from '../lib/notifications-client';

export function NotificationBell() {
  const { isAuthenticated, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [response, setResponse] = useState<NotificationListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setUnreadCount(0);
      setResponse(null);
      return;
    }

    void refreshUnreadCount();
    timerRef.current = window.setInterval(() => {
      void refreshUnreadCount();
    }, 30000);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };
  }, [isAuthenticated, user?.id]);

  async function refreshUnreadCount() {
    try {
      const result = await fetchNotificationUnreadCount();
      setUnreadCount(result.unreadCount);
    } catch {
      setUnreadCount(0);
    }
  }

  async function openDrawer() {
    setIsOpen((current) => !current);

    if (!response) {
      await loadNotifications();
    }
  }

  async function loadNotifications() {
    setIsLoading(true);
    setError(null);

    try {
      const nextResponse = await fetchMyNotifications({ pageSize: 20 });
      setResponse(nextResponse);
      setUnreadCount(nextResponse.unreadCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '通知中心加载失败。');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMarkRead(notificationId: string) {
    setActingId(notificationId);

    try {
      const result = await markNotificationRead(notificationId);
      setUnreadCount(result.unreadCount);
      setResponse((current) =>
        current
          ? {
              ...current,
              unreadCount: result.unreadCount,
              items: current.items.map((item) =>
                item.id === notificationId
                  ? {
                      ...item,
                      isRead: true,
                      readAt: new Date().toISOString(),
                    }
                  : item,
              ),
            }
          : current,
      );
    } finally {
      setActingId(null);
    }
  }

  async function handleMarkAllRead() {
    setIsMarkingAll(true);

    try {
      const result = await markAllNotificationsRead();
      setUnreadCount(result.unreadCount);
      setResponse((current) =>
        current
          ? {
              ...current,
              unreadCount: result.unreadCount,
              items: current.items.map((item) => ({
                ...item,
                isRead: true,
                readAt: item.readAt ?? new Date().toISOString(),
              })),
            }
          : current,
      );
    } finally {
      setIsMarkingAll(false);
    }
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="notification-shell">
      <button type="button" className="notification-button" onClick={() => void openDrawer()}>
        <span>通知</span>
        <UnreadCountBadge count={unreadCount} />
      </button>
      {isOpen ? (
        <div className="notification-drawer">
          <div className="section-header">
            <div>
              <p className="eyebrow">Notifications</p>
              <h2 className="section-title">通知中心</h2>
            </div>
            <div className="inline-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={isLoading || isMarkingAll}
                onClick={() => void loadNotifications()}
              >
                刷新
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={isMarkingAll || unreadCount === 0}
                onClick={() => void handleMarkAllRead()}
              >
                全部已读
              </button>
            </div>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
          {isLoading && !response ? (
            <div className="empty-state">
              <strong>正在加载通知…</strong>
              <p>站内通知和流程提醒正在同步。</p>
            </div>
          ) : (
            <NotificationList
              items={response?.items ?? []}
              actingId={actingId}
              onMarkRead={handleMarkRead}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

export function UnreadCountBadge({ count }: { count: number }) {
  if (count <= 0) {
    return <span className="notification-badge notification-badge-muted">0</span>;
  }

  return <span className="notification-badge">{count > 99 ? '99+' : count}</span>;
}

export function NotificationList({
  items,
  actingId,
  onMarkRead,
}: {
  items: NotificationItem[];
  actingId: string | null;
  onMarkRead: (notificationId: string) => void | Promise<void>;
}) {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <strong>暂无通知</strong>
        <p>节点分配、评审提醒和超期提醒会统一出现在这里。</p>
      </div>
    );
  }

  return (
    <div className="notification-list">
      {items.map((item) => (
        <article
          key={item.id}
          className={`notification-item ${item.isRead ? 'notification-item-read' : ''}`}
        >
          <div className="notification-copy">
            <div className="task-table-primary">
              <strong>{item.title}</strong>
              {!item.isRead ? <span className="notification-dot" /> : null}
            </div>
            <p>{item.content}</p>
            <div className="notification-meta">
              <span>{getNotificationTypeLabel(item.notificationType)}</span>
              <span>{formatNotificationTime(item.createdAt)}</span>
            </div>
          </div>
          <div className="notification-actions">
            {item.linkPath ? (
              <Link
                href={item.linkPath}
                className="table-link"
                onClick={() => void onMarkRead(item.id)}
              >
                查看
              </Link>
            ) : null}
            {!item.isRead ? (
              <button
                type="button"
                className="button button-secondary"
                disabled={actingId === item.id}
                onClick={() => void onMarkRead(item.id)}
              >
                标记已读
              </button>
            ) : (
              <span className="status-badge status-ready">已读</span>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

