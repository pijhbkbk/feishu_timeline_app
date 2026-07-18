import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuditTargetType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const SAFE_FILTER_PATTERN = /^[A-Za-z0-9_.:@/-]+$/;

export class AdminAuditQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: '操作者用户 ID' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(128)
  @Matches(SAFE_FILTER_PATTERN)
  actorUserId?: string;

  @ApiPropertyOptional({ description: '操作者姓名（模糊匹配）' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  actorName?: string;

  @ApiPropertyOptional({ description: '审计动作代码' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  @Matches(SAFE_FILTER_PATTERN)
  action?: string;

  @ApiPropertyOptional({ enum: AuditTargetType, description: '审计对象类型' })
  @IsOptional()
  @IsEnum(AuditTargetType)
  entityType?: AuditTargetType;

  @ApiPropertyOptional({ description: '审计对象 ID' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(128)
  @Matches(SAFE_FILTER_PATTERN)
  entityId?: string;

  @ApiPropertyOptional({ description: '项目 ID' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(128)
  @Matches(SAFE_FILTER_PATTERN)
  projectId?: string;

  @ApiPropertyOptional({ description: '结果代码' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(64)
  @Matches(SAFE_FILTER_PATTERN)
  result?: string;

  @ApiPropertyOptional({ description: '请求追踪 ID' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(128)
  @Matches(SAFE_FILTER_PATTERN)
  requestId?: string;

  @ApiPropertyOptional({ description: '动作、摘要、对象、操作者或项目关键词' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  keyword?: string;

  @ApiPropertyOptional({
    default: 'createdAt:desc',
    enum: ['createdAt:desc', 'createdAt:asc'],
  })
  @IsOptional()
  @IsIn(['createdAt:desc', 'createdAt:asc'])
  sort?: 'createdAt:desc' | 'createdAt:asc';
}
