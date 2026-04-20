import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectPriority } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { ProjectMemberDto } from './project-member.dto';

export class CreateProjectDto {
  @ApiProperty({ description: '项目编号' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;

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
  @ValidateNested({ each: true })
  @Type(() => ProjectMemberDto)
  members?: ProjectMemberDto[];
}
