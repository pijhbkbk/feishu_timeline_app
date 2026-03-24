'use client';

import { apiRequest } from './auth-client';
import { formatDate } from './projects-client';

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'REVIEW_PENDING'
  | 'TASK_RETURNED'
  | 'TASK_OVERDUE'
  | 'SYSTEM_INFO';

export type NotificationSendStatus = 'PENDING' | 'SENT' | 'FAILED';

export type NotificationItem = {
  id: string;
  projectId: string | null;
  taskId: string | null;
  notificationType: NotificationType;
  title: string;
  content: string;
  linkPath: string | null;
  isRead: boolean;
  readAt: string | null;
  sendStatus: NotificationSendStatus;
  createdAt: string;
};

export type NotificationListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unreadCount: number;
  items: NotificationItem[];
};

export async function fetchMyNotifications(params: { page?: number; pageSize?: number } = {}) {
  const search = new URLSearchParams();

  if (params.page) {
    search.set('page', String(params.page));
  }

  if (params.pageSize) {
    search.set('pageSize', String(params.pageSize));
  }

  const suffix = search.toString() ? `?${search.toString()}` : '';
  return apiRequest<NotificationListResponse>(`/notifications/my${suffix}`);
}

export async function fetchNotificationUnreadCount() {
  return apiRequest<{ unreadCount: number }>('/notifications/unread-count');
}

export async function markNotificationRead(notificationId: string) {
  return apiRequest<{ unreadCount: number }>(`/notifications/${notificationId}/mark-read`, {
    method: 'POST',
  });
}

export async function markAllNotificationsRead() {
  return apiRequest<{ unreadCount: number }>('/notifications/mark-all-read', {
    method: 'POST',
  });
}

export function getNotificationTypeLabel(type: NotificationType) {
  switch (type) {
    case 'TASK_ASSIGNED':
      return '任务分配';
    case 'REVIEW_PENDING':
      return '待评审';
    case 'TASK_RETURNED':
      return '节点退回';
    case 'TASK_OVERDUE':
      return '任务超期';
    case 'SYSTEM_INFO':
    default:
      return '系统提醒';
  }
}

export function formatNotificationTime(value: string) {
  return formatDate(value);
}

