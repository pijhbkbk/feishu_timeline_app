import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectPriority } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { PROJECT_PAINT_SUPPLIER_VALUES } from '../project.constants';

export class UpdateProjectDto {
  @ApiPropertyOptional({ description: '项目名称' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

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

  @ApiPropertyOptional({ description: '计划开始日期', format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  plannedStartDate?: string | null;

  @ApiPropertyOptional({ description: '计划结束日期', format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  plannedEndDate?: string | null;
}
