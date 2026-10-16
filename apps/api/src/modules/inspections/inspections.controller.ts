import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { InspectionsService } from './inspections.service';
@Controller('inspections')
export class InspectionsController {
  constructor(private readonly service:InspectionsService){}
  @Get('activities') @Permissions('project.read')
  list(@Query() query:Record<string,unknown>,@CurrentUser() actor:AuthenticatedUser){return this.service.list(query,actor);}
  @Get('statistics') @Permissions('project.read')
  statistics(@Query() query:Record<string,unknown>,@CurrentUser() actor:AuthenticatedUser){return this.service.statistics(query,actor);}
  @Get('objects') @Permissions('project.read')
  objects(@Query() query:Record<string,unknown>,@CurrentUser() actor:AuthenticatedUser){return this.service.objects(query,actor);}
  @Post('objects') @Permissions('project.write')
  createObject(@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser){return this.service.createObject(body,actor);}
  @Post('activities') @Permissions('project.write')
  createActivity(@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser){return this.service.createActivity(body,actor);}
  @Get('activities/:id') @Permissions('project.read')
  detail(@Param('id') id:string,@CurrentUser() actor:AuthenticatedUser){return this.service.detail(id,actor);}
  @Get('activities/:id/rows') @Permissions('project.read')
  rows(@Param('id') id:string,@Query() query:Record<string,unknown>,@CurrentUser() actor:AuthenticatedUser){return this.service.rows(id,query,actor);}
  @Patch('activities/:id') @Permissions('project.write')
  update(@Param('id') id:string,@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser){return this.service.updateActivity(id,body,actor);}
  @Patch('activities/:id/batch') @Permissions('project.write')
  batch(@Param('id') id:string,@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser){return this.service.saveBatch(id,body,actor);}
  @Post('activities/:id/review-link') @Permissions('review.execute')
  link(@Param('id') id:string,@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser){return this.service.linkReview(id,body,actor);}
}
