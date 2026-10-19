import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { WorkbooksService } from './workbooks.service';
@Controller('workbooks')
export class WorkbooksController {
  constructor(private readonly service:WorkbooksService){}
  @Get() @Permissions('project.read') list(@Query() query:Record<string,unknown>,@CurrentUser() actor:AuthenticatedUser){return this.service.list(query,actor);}
  @Post() @Permissions('project.write') create(@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser){return this.service.create(body,actor);}
  @Get(':id') @Permissions('project.read') get(@Param('id') id:string,@CurrentUser() actor:AuthenticatedUser){return this.service.get(id,actor);}
  @Put(':id') @Permissions('project.write') save(@Param('id') id:string,@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser){return this.service.save(id,body,actor);}
  @Get(':id/revisions') @Permissions('project.read') revisions(@Param('id') id:string,@Query() query:Record<string,unknown>,@CurrentUser() actor:AuthenticatedUser){return this.service.revisions(id,query,actor);}
  @Post(':id/restore') @Permissions('project.write') restore(@Param('id') id:string,@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser){return this.service.restore(id,body,actor);}
}
