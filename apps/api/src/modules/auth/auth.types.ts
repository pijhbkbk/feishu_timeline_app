import type { Request } from 'express';

import type { AuthSource, RoleCode } from './auth.constants';

export type AuthSessionPayload = {
  userId: string;
  authSource: AuthSource;
  createdAt: string;
  expiresAt: string;
  authVersion?: number;
};

export type AuthenticatedUser = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  departmentId: string | null;
  departmentName: string | null;
  isSystemAdmin: boolean;
  teamAccessApproved?: boolean;
  authSource: AuthSource;
  roleCodes: RoleCode[];
  permissionCodes?: string[];
  authVersion?: number;
  requestedJob?: string | null;
  onboardingCompleted?: boolean;
};

export type AuthenticatedRequest = Request & {
  authUser?: AuthenticatedUser;
  sessionToken?: string;
};

export type SessionResponse = {
  authenticated: boolean;
  mockEnabled: boolean;
  feishuEnabled: boolean;
  localEnabled?: boolean;
  user: AuthenticatedUser | null;
};
