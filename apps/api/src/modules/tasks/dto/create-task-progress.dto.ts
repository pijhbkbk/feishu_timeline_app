import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const TASK_BLOCKER_TYPES = [
  'MATERIAL',
  'SUPPLIER',
  'TECHNICAL',
  'REVIEW',
  'SCHEDULE',
  'OTHER',
] as const;

export class CreateTaskProgressDto {
  @ApiProperty({ description: '本次完成内容', maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  completedContent!: string;

  @ApiPropertyOptional({ description: '下一步计划', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  nextPlan?: string;

  @ApiProperty({ description: '当前完成百分比', minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  completionPercent!: number;

  @ApiProperty({ description: '是否存在阻塞' })
  @IsBoolean()
  isBlocked!: boolean;

  @ApiPropertyOptional({ enum: TASK_BLOCKER_TYPES, description: '阻塞类型' })
  @IsOptional()
  @IsIn(TASK_BLOCKER_TYPES)
  blockerType?: (typeof TASK_BLOCKER_TYPES)[number];

  @ApiPropertyOptional({ description: '阻塞说明', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  blockerDescription?: string;

  @ApiPropertyOptional({ description: '请求协助的用户标识' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  helperUserId?: string;

  @ApiPropertyOptional({ description: '预计解除阻塞时间，ISO 8601' })
  @IsOptional()
  @IsISO8601()
  expectedResolvedAt?: string;

  @ApiPropertyOptional({ description: '已安全上传并绑定到当前任务的附件标识' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  materialAttachmentIds?: string[];

  @ApiProperty({ description: '客户端生成的幂等键', maxLength: 120 })
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  idempotencyKey!: string;
}
