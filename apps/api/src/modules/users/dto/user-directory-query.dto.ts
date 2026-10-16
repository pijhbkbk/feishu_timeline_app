import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UserDirectoryQueryDto {
  @ApiPropertyOptional({ description: '姓名关键词', maxLength: 80 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ description: '限定为指定项目的可分配成员', maxLength: 64 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  projectId?: string;

  @ApiPropertyOptional({ description: '每批条数', default: 50, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  take?: number;

  @ApiPropertyOptional({ description: '上一批最后一个用户 ID', maxLength: 64 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  cursor?: string;
}
