import {
  NotificationType,
  type Prisma,
} from '@prisma/client';

export type NotificationQueueJob = {
  id: string;
  type: NotificationType;
  taskId: string | null;
  projectId: string | null;
  userId: string | null;
  title: string | null;
  content: string | null;
  linkPath: string | null;
  metadata?: Prisma.InputJsonValue;
  triggeredByUserId: string | null;
  retryCount: number;
  availableAt: string;
};

export type NotificationQueueJobInput = Omit<
  NotificationQueueJob,
  'id' | 'retryCount' | 'availableAt'
> & {
  retryCount?: number;
  availableAt?: string;
};

