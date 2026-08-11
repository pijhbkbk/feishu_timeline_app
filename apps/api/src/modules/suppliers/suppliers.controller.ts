import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Roles('admin', 'project_manager', 'purchaser')
  @Permissions('project.read')
  @Get()
  listSuppliers(@CurrentUser() actor: AuthenticatedUser) {
    return this.suppliersService.listSuppliers(actor);
  }

  @Roles('admin', 'project_manager', 'purchaser')
  @Permissions('workflow.transition')
  @Post()
  createSupplier(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.suppliersService.createSupplier(body, actor);
  }

  @Roles('admin', 'project_manager', 'purchaser')
  @Permissions('workflow.transition')
  @Patch(':supplierId')
  updateSupplier(
    @Param('supplierId') supplierId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.suppliersService.updateSupplier(supplierId, body, actor);
  }
}
