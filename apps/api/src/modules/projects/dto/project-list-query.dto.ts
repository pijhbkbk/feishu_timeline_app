import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectPriority, ProjectStatus, WorkflowNodeCode } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ProjectListQueryDto {
  @ApiPropertyOptional({ description: '快速视图', enum: ['all', 'normal', 'risk', 'overdue', 'review'] })
  @IsOptional()
  @IsIn(['all', 'normal', 'risk', 'overdue', 'review'])
  view?: 'all' | 'normal' | 'risk' | 'overdue' | 'review';

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

  @ApiPropertyOptional({ description: '项目名称、编号或颜色关键词' })
  @IsOptional()
  @IsString()
  keyword?: string;

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

  @ApiPropertyOptional({ description: '责任部门 ID' })
  @IsOptional()
  @IsString()
  ownerDepartmentId?: string;

  @ApiPropertyOptional({ enum: ProjectPriority, description: '优先级过滤' })
  @IsOptional()
  @IsEnum(ProjectPriority)
  priority?: ProjectPriority;

  @ApiPropertyOptional({ description: '是否逾期' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  isOverdue?: boolean;

  @ApiPropertyOptional({ description: '计划日期起始', format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: '计划日期截止', format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
