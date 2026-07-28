import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AdminService } from './admin.service';
import { AdminColorDatabaseQueryDto } from './dto/admin-color-database-query.dto';

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

  @ApiOperation({ summary: '获取颜色资料归档列表' })
  @Roles()
  @Permissions('project.read')
  @Get('color-database')
  getColorDatabase(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: AdminColorDatabaseQueryDto,
  ) {
    return this.adminService.getColorDatabase(query, actor);
  }

  @ApiOperation({ summary: '获取单个颜色的完整资料档案' })
  @Roles()
  @Permissions('project.read')
  @Get('color-database/:colorId')
  getColorArchive(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('colorId') colorId: string,
  ) {
    return this.adminService.getColorArchive(colorId, actor);
  }
}
