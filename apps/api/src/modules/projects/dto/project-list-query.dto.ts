import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectPriority, ProjectStatus, WorkflowNodeCode } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ProjectListQueryDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页条数', default: 10, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @ApiPropertyOptional({ enum: ProjectStatus, description: '项目状态过滤' })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiPropertyOptional({ enum: WorkflowNodeCode, description: '当前节点过滤' })
  @IsOptional()
  @IsEnum(WorkflowNodeCode)
  currentNodeCode?: WorkflowNodeCode;

  @ApiPropertyOptional({ description: '项目负责人用户 ID' })
  @IsOptional()
  @IsString()
  ownerUserId?: string;

  @ApiPropertyOptional({ enum: ProjectPriority, description: '优先级过滤' })
  @IsOptional()
  @IsEnum(ProjectPriority)
  priority?: ProjectPriority;

  @ApiPropertyOptional({ description: '计划日期起始', format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: '计划日期截止', format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
