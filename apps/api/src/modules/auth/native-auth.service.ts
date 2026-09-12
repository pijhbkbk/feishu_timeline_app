import {
  BadRequestException, ConflictException, ForbiddenException, HttpException,
  HttpStatus, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { AuditTargetType, Prisma, UserStatus } from '@prisma/client';
import type { Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import {
  NATIVE_ADMIN_LOCK, NATIVE_BOOTSTRAP_ID, NATIVE_JOB_CODES,
  normalizeLoginName, validateNativePassword, type NativeJobCode,
} from './native-auth.rules';
import { NativePasswordService } from './native-password.service';
import { SessionStoreService } from './session-store.service';

const FAILURE = '用户名或密码不正确，或账号暂不可用。';
const RESET_FAILURE = '恢复码无效或已过期，请联系管理员。';

@Injectable()
export class NativeAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: NativePasswordService,
    private readonly auth: AuthService,
    private readonly store: SessionStoreService,
  ) {}

  async listAccounts(actor: AuthenticatedUser, query?: string) {
    if (!actor.isSystemAdmin) throw new ForbiddenException('仅系统管理员可管理账号。');
    if (query !== undefined && (typeof query !== 'string' || query.length > 80)) throw new BadRequestException('搜索内容最多 80 个字符。');
    const q = query?.trim();
    const users = await this.prisma.user.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }] } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 50,
      select: { id: true, username: true, name: true, status: true, requestedJob: true, isSystemAdmin: true,
        userRoles: { select: { role: { select: { name: true, status: true } } } },
        localCredential: { select: { passwordHash: true } } },
    });
    return users.map(({ localCredential, userRoles, ...user }) => ({ ...user,
      hasCredential: Boolean(localCredential), canLogin: user.status === 'ACTIVE' && Boolean(localCredential?.passwordHash),
      roles: userRoles.filter(row => row.role.status === 'ACTIVE').map(row => row.role.name),
    }));
  }

  async register(input: { username: string; password: string; name: string }, client: string) {
    const username = normalizeLoginName(input.username);
    await this.rateLimit('register', client, username, 5, 20, 3600);
    const password = validateNativePassword(input.password, username);
    const name = this.validateName(input.name);
    const passwordHash = await this.passwordService.hash(password);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockLoginName(tx, username);
        await this.assertLoginNameAvailable(tx, username);
        const user = await tx.user.create({
          data: { username, name, status: UserStatus.ACTIVE, onboardingCompleted: false,
            localCredential: { create: { loginName: username, passwordHash } } },
        });
        await this.audit(tx, user.id, user.id, 'NATIVE_ACCOUNT_REGISTERED');
      });
    } catch (error) { this.rethrowConflict(error); }
    return { success: true };
  }

  async login(
    input: { username: string; password: string }, client: string,
    oldToken: string | undefined, response: Response,
  ) {
    const username = normalizeLoginName(input.username);
    await this.rateLimit('login', client, username, 30, 200, 60);
    const credential = await this.prisma.localCredential.findUnique({
      where: { loginName: username }, include: { user: true },
    });
    const valid = await this.passwordService.verify(credential?.passwordHash ?? null, input.password);
    if (!valid || !credential || credential.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(FAILURE);
    }
    const version = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, credential.userId);
      const current = await tx.localCredential.findUnique({ where: { userId: credential.userId }, include: { user: true } });
      if (!current || current.passwordHash !== credential.passwordHash ||
          current.updatedAt.getTime() !== credential.updatedAt.getTime() ||
          current.user.authVersion !== credential.user.authVersion || current.user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException(FAILURE);
      }
      await this.audit(tx, current.userId, current.userId, 'NATIVE_ACCOUNT_LOGIN');
      return current.user.authVersion;
    });
    return this.auth.createNativeSession(credential.userId, version, oldToken, response);
  }

  async chooseJob(actor: AuthenticatedUser, job: NativeJobCode) {
    if (!NATIVE_JOB_CODES.includes(job)) throw new BadRequestException('岗位选项无效。');
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, actor.id);
      const user = await this.assertCurrentActor(tx, actor);
      if (user.onboardingCompleted) {
        if (user.requestedJob === job) return;
        throw new ConflictException('岗位已提交，请联系管理员调整正式授权。');
      }
      await tx.user.update({ where: { id: actor.id }, data: { requestedJob: job, onboardingCompleted: true } });
      await this.audit(tx, actor.id, actor.id, 'NATIVE_JOB_REQUESTED', { requestedJob: job });
    });
    return { success: true };
  }

  async changePassword(actor: AuthenticatedUser, input: { currentPassword: string; newPassword: string }, client: string) {
    await this.rateLimit('password', client, actor.id, 10, 100, 60);
    const credential = await this.prisma.localCredential.findUnique({ where: { userId: actor.id } });
    const valid = await this.passwordService.verify(credential?.passwordHash ?? null, input.currentPassword);
    if (!valid || !credential) throw new UnauthorizedException(FAILURE);
    const passwordHash = await this.passwordService.hash(validateNativePassword(input.newPassword, credential.loginName));
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, actor.id);
      await this.assertCurrentActor(tx, actor);
      const updated = await tx.localCredential.updateMany({
        where: { userId: actor.id, passwordHash: credential.passwordHash, updatedAt: credential.updatedAt },
        data: { passwordHash, resetTokenHash: null, resetExpiresAt: null, resetVersion: null },
      });
      if (updated.count !== 1) throw new ConflictException('账号凭据已变化，请重新登录。');
      await tx.user.update({ where: { id: actor.id }, data: { authVersion: { increment: 1 } } });
      await this.audit(tx, actor.id, actor.id, 'NATIVE_PASSWORD_CHANGED');
    });
    return { success: true, requiresLogin: true };
  }

  async issueRecovery(actor: AuthenticatedUser, userId: string, client: string) {
    if (!actor.isSystemAdmin) throw new ForbiddenException('仅系统管理员可签发账号恢复码。');
    if (typeof userId !== 'string' || userId.length < 1 || userId.length > 64) throw new BadRequestException('用户标识无效。');
    await this.rateLimit('issue-recovery', client, actor.id, 10, 50, 3600);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await this.prisma.$transaction(async (tx) => {
      await this.lockAdministrator(tx);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} FOR SHARE`);
      const admin = await this.assertCurrentActor(tx, actor);
      if (!admin.isSystemAdmin) throw new ForbiddenException('仅系统管理员可签发账号恢复码。');
      await this.lockUser(tx, userId);
      const user = await tx.user.findUnique({ where: { id: userId }, include: { localCredential: true } });
      if (!user || user.status !== UserStatus.ACTIVE) throw new BadRequestException('请先确认目标账号存在且已启用。');
      if (!user.localCredential) {
        throw new BadRequestException('历史账号须由受保护的主机命令按内部用户 ID 绑定本地凭据。');
      }
      if (user.isSystemAdmin && user.localCredential.passwordHash) {
        const available = await tx.user.count({ where: { isSystemAdmin: true, status: UserStatus.ACTIVE,
          localCredential: { is: { passwordHash: { not: null } } } } });
        if (available <= 1) throw new ConflictException('不可重置最后一个可登录管理员，请使用本人改密或主机恢复命令。');
      }
      const version = user.authVersion + 1;
      await tx.user.update({ where: { id: userId }, data: { authVersion: version } });
      await tx.localCredential.update({ where: { userId }, data: {
        passwordHash: null, resetTokenHash: this.tokenHash(token), resetExpiresAt: expiresAt, resetVersion: version,
      } });
      await this.audit(tx, actor.id, userId, 'NATIVE_RECOVERY_ISSUED');
    });
    // Returned once, never passed to a persisted command result or audit payload.
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async recover(input: { token: string; newPassword: string }, client: string) {
    if (typeof input.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.token)) {
      throw new UnauthorizedException(RESET_FAILURE);
    }
    const digest = this.tokenHash(input.token);
    await this.rateLimit('recover', client, digest, 10, 100, 60);
    const credential = await this.prisma.localCredential.findUnique({ where: { resetTokenHash: digest }, include: { user: true } });
    if (!credential || !credential.resetExpiresAt || credential.resetExpiresAt <= new Date() ||
        credential.user.status !== UserStatus.ACTIVE || credential.resetVersion !== credential.user.authVersion) {
      throw new UnauthorizedException(RESET_FAILURE);
    }
    const passwordHash = await this.passwordService.hash(validateNativePassword(input.newPassword, credential.loginName));
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, credential.userId);
      const user = await tx.user.findUnique({ where: { id: credential.userId } });
      if (!user || user.status !== UserStatus.ACTIVE || user.authVersion !== credential.resetVersion) throw new UnauthorizedException(RESET_FAILURE);
      const consumed = await tx.localCredential.updateMany({
        where: { userId: user.id, resetTokenHash: digest, resetVersion: user.authVersion, resetExpiresAt: { gt: new Date() } },
        data: { passwordHash, resetTokenHash: null, resetExpiresAt: null, resetVersion: null },
      });
      if (consumed.count !== 1) throw new UnauthorizedException(RESET_FAILURE);
      await tx.user.update({ where: { id: user.id }, data: { authVersion: { increment: 1 } } });
      await this.audit(tx, user.id, user.id, 'NATIVE_PASSWORD_RECOVERED');
    });
    return { success: true, requiresLogin: true };
  }

  // CLI only: this method is deliberately not routed through any HTTP controller.
  async initializeAdministrator(input: { username: string; name: string; password: string; existingUserId?: string }) {
    const username = normalizeLoginName(input.username);
    const name = this.validateName(input.name);
    const passwordHash = await this.passwordService.hash(validateNativePassword(input.password, username));
    return this.prisma.$transaction(async (tx) => {
      await this.lockAdministrator(tx);
      if (await tx.authInitialization.findUnique({ where: { id: NATIVE_BOOTSTRAP_ID } })) {
        throw new ConflictException('原生管理员已初始化，不允许重复初始化或接管。');
      }
      await this.lockLoginName(tx, username);
      await this.assertLoginNameAvailable(tx, username, input.existingUserId);
      const existing = input.existingUserId ? await tx.user.findUnique({ where: { id: input.existingUserId } }) : null;
      if (input.existingUserId && (!existing || !existing.isSystemAdmin || existing.status !== UserStatus.ACTIVE)) {
        throw new ForbiddenException('初始化只可绑定明确的现有启用管理员 ID。');
      }
      if (existing && await tx.localCredential.findUnique({ where: { userId: existing.id } })) {
        throw new ConflictException('该用户已有本地凭据。');
      }
      const user = existing ? await tx.user.update({ where: { id: existing.id }, data: {
        username, authVersion: { increment: 1 }, onboardingCompleted: true,
        localCredential: { create: { loginName: username, passwordHash } },
      } }) : await tx.user.create({ data: {
        username, name, isSystemAdmin: true, status: UserStatus.ACTIVE, onboardingCompleted: true,
        localCredential: { create: { loginName: username, passwordHash } },
      } });
      const role = await tx.role.upsert({ where: { code: 'admin' }, create: { code: 'admin', name: '系统管理员' }, update: {} });
      if (role.status !== 'ACTIVE') throw new ConflictException('管理员角色已停用，请先检查现有授权配置。');
      await tx.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, create: { userId: user.id, roleId: role.id }, update: {} });
      await tx.authInitialization.create({ data: { id: NATIVE_BOOTSTRAP_ID, userId: user.id } });
      await this.audit(tx, user.id, user.id, 'NATIVE_ADMIN_INITIALIZED');
      return { userId: user.id, username };
    });
  }

  // Host-authorized recovery/binding: requires an exact internal user ID; never matches by personal data.
  async bindFromHost(userId: string, usernameInput: string, password: string) {
    const username = normalizeLoginName(usernameInput);
    const passwordHash = await this.passwordService.hash(validateNativePassword(password, username));
    return this.prisma.$transaction(async (tx) => {
      await this.lockAdministrator(tx);
      await this.lockLoginName(tx, username);
      await this.lockUser(tx, userId);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.status !== UserStatus.ACTIVE) throw new ForbiddenException('仅可绑定明确的启用用户 ID。');
      await this.assertLoginNameAvailable(tx, username, userId);
      await tx.localCredential.upsert({ where: { userId }, create: { userId, loginName: username, passwordHash }, update: {
        loginName: username, passwordHash, resetTokenHash: null, resetExpiresAt: null, resetVersion: null,
      } });
      await tx.user.update({ where: { id: userId }, data: { username, authVersion: { increment: 1 } } });
      await this.audit(tx, null, userId, 'NATIVE_HOST_CREDENTIAL_BOUND');
      return { userId, username };
    });
  }

  private async assertLoginNameAvailable(tx: Prisma.TransactionClient, username: string, exceptUserId?: string) {
    const [user, credential] = await Promise.all([
      tx.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) }, select: { id: true } }),
      tx.localCredential.findFirst({ where: { loginName: username, ...(exceptUserId ? { userId: { not: exceptUserId } } : {}) }, select: { userId: true } }),
    ]);
    if (user || credential) throw new ConflictException('用户名已被使用，请选择其他用户名。');
  }

  private async assertCurrentActor(tx: Prisma.TransactionClient, actor: AuthenticatedUser) {
    const user = await tx.user.findUnique({ where: { id: actor.id } });
    if (!user || user.status !== UserStatus.ACTIVE || actor.authSource !== 'local' ||
        !Number.isSafeInteger(actor.authVersion) || user.authVersion !== actor.authVersion) {
      throw new UnauthorizedException('登录状态已失效，请重新登录。');
    }
    return user;
  }

  private async rateLimit(scope: string, client: string, account: string, clientLimit: number, globalLimit: number, ttl: number) {
    const clientHash = this.tokenHash(client.slice(0, 128));
    const accountHash = this.tokenHash(account);
    for (const [suffix, limit] of [[`client:${clientHash}`, clientLimit], [`account:${accountHash}`, Math.min(clientLimit, 10)], ['global', globalLimit]] as const) {
      if (await this.store.incrementWithTtl(`auth:native:${scope}:${suffix}`, ttl) > limit) {
        throw new HttpException('账号请求过于频繁，请稍后重试。', HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }

  private validateName(value: string) {
    if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 80 || Array.from(value).some(point => point.codePointAt(0)! < 32 || point.codePointAt(0) === 127)) throw new BadRequestException('姓名须为 1–80 个可显示字符。');
    return value.trim();
  }
  private tokenHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private lockUser(tx: Prisma.TransactionClient, id: string) { return tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${id} FOR UPDATE`); }
  private lockAdministrator(tx: Prisma.TransactionClient) { return tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${NATIVE_ADMIN_LOCK}))`); }
  private lockLoginName(tx: Prisma.TransactionClient, name: string) { return tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'native-login-name'}), hashtext(${name}))`); }
  private audit(tx: Prisma.TransactionClient, actorUserId: string | null, userId: string, action: string, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { actorUserId, targetType: AuditTargetType.USER, targetId: userId, action, summary: action, ...(metadata ? { metadata } : {}) } });
  }
  private rethrowConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('用户名已被使用，请选择其他用户名。');
    throw error;
  }
}
