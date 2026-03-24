import { Controller, Get } from '@nestjs/common';
import { Query } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('directory')
  getDirectory(@Query('q') query?: string) {
    return this.usersService.getDirectory(query);
  }

  @Roles('admin')
  @Get('roles')
  getRoles() {
    return this.usersService.getRoleSummaries();
  }
}
