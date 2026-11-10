import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { WorkbooksService } from './workbooks.service';
import { workbookSaveTiming } from './workbook-save-timing';
@Controller('workbooks')
export class WorkbooksController {
  constructor(private readonly service:WorkbooksService){}
  @Get() @Permissions('project.read') list(@Query() query:Record<string,unknown>,@CurrentUser() actor:AuthenticatedUser){return this.service.list(query,actor);}
  @Post() @Permissions('project.write') create(@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser){return this.service.create(body,actor);}
  @Get(':id') @Permissions('project.read') get(@Param('id') id:string,@CurrentUser() actor:AuthenticatedUser){return this.service.get(id,actor);}
  @Put(':id') @Permissions('project.write') save(@Param('id') id:string,@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser,@Req() request:Request){return this.service.save(id,body,actor,workbookSaveTiming(request));}
  @Get(':id/draft') @Permissions('project.read') draft(@Param('id') id:string,@CurrentUser() actor:AuthenticatedUser){return this.service.getDraft(id,actor);}
  @Put(':id/draft') @Permissions('project.write') saveDraft(@Param('id') id:string,@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser){return this.service.saveDraft(id,body,actor);}
  @Delete(':id/draft') @Permissions('project.write') discardDraft(@Param('id') id:string,@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser){return this.service.discardDraft(id,body,actor);}
  @Post(':id/draft/publish') @Permissions('project.write') publishDraft(@Param('id') id:string,@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser){return this.service.publishDraft(id,body,actor);}
  @Get(':id/revisions') @Permissions('project.read') revisions(@Param('id') id:string,@Query() query:Record<string,unknown>,@CurrentUser() actor:AuthenticatedUser){return this.service.revisions(id,query,actor);}
  @Post(':id/restore') @Permissions('project.write') restore(@Param('id') id:string,@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser){return this.service.restore(id,body,actor);}
}
