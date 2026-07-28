import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AdminColorDatabaseQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 48 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  pageSize?: number;

  @ApiPropertyOptional({ description: '颜色名称、编号、车型或项目编号' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: '车型' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  vehicleModel?: string;

  @ApiPropertyOptional({ description: '颜色类别' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  colorType?: string;

  @ApiPropertyOptional({ description: '颜色状态' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({ enum: ['ALL', 'COMPLETE', 'INCOMPLETE'] })
  @IsOptional()
  @IsIn(['ALL', 'COMPLETE', 'INCOMPLETE'])
  completeness?: 'ALL' | 'COMPLETE' | 'INCOMPLETE';

  @ApiPropertyOptional({ description: '归档年份' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;
}
