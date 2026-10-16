import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
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
  listSuppliers(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.suppliersService.listSuppliers(actor, query);
  }

  @Roles('admin', 'project_manager', 'purchaser')
  @Permissions('workflow.transition')
  @Post()
  createSupplier(
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.suppliersService.createSupplier(body, actor, idempotencyKey);
  }

  @Roles('admin', 'project_manager', 'purchaser')
  @Permissions('workflow.transition')
  @Patch(':supplierId')
  updateSupplier(
    @Param('supplierId') supplierId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.suppliersService.updateSupplier(
      supplierId,
      body,
      actor,
      idempotencyKey,
    );
  }
}
