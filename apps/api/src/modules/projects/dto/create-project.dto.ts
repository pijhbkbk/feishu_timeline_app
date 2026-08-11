import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectPriority } from '@prisma/client';
import {
  IsArray,
  ArrayMaxSize,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { ProjectMemberDto } from './project-member.dto';
import {
  PROJECT_CREATE_MEMBERS_MAX_COUNT,
  PROJECT_PAINT_SUPPLIER_VALUES,
} from '../project.constants';

export class CreateProjectDto {
  @ApiPropertyOptional({ description: '兼容字段；未传入时由服务端生成内部项目编号' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @ApiProperty({ description: '项目名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name!: string;

  @ApiPropertyOptional({ description: '项目描述', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ enum: ProjectPriority, description: '项目优先级' })
  @IsOptional()
  @IsEnum(ProjectPriority)
  priority?: ProjectPriority;

  @ApiPropertyOptional({ description: '市场区域', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  marketRegion?: string | null;

  @ApiPropertyOptional({ description: '颜色营销单位', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  colorMarketingUnit?: string | null;

  @ApiPropertyOptional({
    description: '涂料供应商',
    enum: PROJECT_PAINT_SUPPLIER_VALUES,
    nullable: true,
  })
  @IsOptional()
  @IsIn(PROJECT_PAINT_SUPPLIER_VALUES)
  paintSupplier?: string | null;

  @ApiPropertyOptional({ description: '车型', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  vehicleModel?: string | null;

  @ApiPropertyOptional({ description: '项目负责人用户 ID' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  ownerUserId?: string;

  @ApiPropertyOptional({ description: '计划开始日期', format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  plannedStartDate?: string | null;

  @ApiPropertyOptional({ description: '计划结束日期', format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  plannedEndDate?: string | null;

  @ApiPropertyOptional({ type: [ProjectMemberDto], description: '项目成员列表' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROJECT_CREATE_MEMBERS_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => ProjectMemberDto)
  members?: ProjectMemberDto[];
}
