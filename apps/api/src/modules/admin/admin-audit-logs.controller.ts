import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Permissions } from '../auth/permissions.decorator';
import { AdminService } from './admin.service';
import { AdminAuditQueryDto } from './dto/admin-audit-query.dto';

@ApiTags('admin-audit-logs')
@ApiCookieAuth('ft_session')
@Permissions('audit.read')
@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly adminService: AdminService) {}

  @ApiOperation({ summary: '分页查询全局审计日志' })
  @ApiOkResponse({ description: '有界、稳定排序的审计日志摘要页' })
  @ApiBadRequestResponse({ description: '查询参数非法' })
  @ApiUnauthorizedResponse({ description: '未登录或会话失效' })
  @ApiForbiddenResponse({ description: '缺少 audit.read 权限' })
  @Get()
  getAuditLogs(@Query() query: AdminAuditQueryDto) {
    return this.adminService.getAuditLogs(query);
  }

  @ApiOperation({ summary: '读取单条脱敏审计日志详情' })
  @ApiOkResponse({ description: '独立读取的安全脱敏审计详情' })
  @ApiUnauthorizedResponse({ description: '未登录或会话失效' })
  @ApiForbiddenResponse({ description: '缺少 audit.read 权限' })
  @ApiNotFoundResponse({ description: '审计日志不存在' })
  @Get(':auditLogId')
  getAuditLogDetail(@Param('auditLogId') auditLogId: string) {
    return this.adminService.getAuditLogDetail(auditLogId);
  }
}
