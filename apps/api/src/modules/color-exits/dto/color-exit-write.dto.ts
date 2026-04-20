import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ColorExitWriteDto {
  @ApiProperty({ description: '退出日期', format: 'date-time' })
  @IsDateString()
  exitDate!: string;

  @ApiProperty({ description: '退出原因' })
  @IsString()
  @MaxLength(500)
  exitReason!: string;

  @ApiPropertyOptional({ description: '补充说明', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ description: '替代颜色 ID', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  replacementColorId?: string | null;

  @ApiPropertyOptional({ description: '统计年度', nullable: true, minimum: 2000, maximum: 9999 })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(9999)
  statisticYear?: number | null;

  @ApiPropertyOptional({ description: '年产量', nullable: true, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  annualOutput?: number | null;

  @ApiPropertyOptional({ description: '人工结论', nullable: true, enum: ['EXIT', 'RETAIN', 'OBSERVE'] })
  @IsOptional()
  @IsString()
  @IsIn(['EXIT', 'RETAIN', 'OBSERVE'])
  finalDecision?: 'EXIT' | 'RETAIN' | 'OBSERVE' | null;

  @ApiPropertyOptional({ description: '生效日期', format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  effectiveDate?: string | null;
}
