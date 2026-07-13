import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiCookieAuth('ft_session')
@Roles('admin')
@Permissions('system.manage')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @ApiOperation({ summary: '获取管理员后台总览' })
  @Get('overview')
  getOverview() {
    return this.adminService.getOverview();
  }
}
