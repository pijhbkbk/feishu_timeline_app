import { AccountSelfService } from '../../common/team-membership';
import { Controller, Get, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserDirectoryQueryDto } from './dto/user-directory-query.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @AccountSelfService()
  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Permissions('project.read', 'project.write')
  @Get('directory')
  getDirectory(
    @Query() query: UserDirectoryQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.getDirectory(query, actor);
  }

  @Roles('admin')
  @Get('roles')
  getRoles() {
    return this.usersService.getRoleSummaries();
  }
}
