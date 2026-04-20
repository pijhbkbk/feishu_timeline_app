import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectPriority } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

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

  @ApiPropertyOptional({ description: '车型', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  vehicleModel?: string | null;

  @ApiPropertyOptional({ description: '项目负责人用户 ID' })
  @IsOptional()
  @IsString()
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
}
