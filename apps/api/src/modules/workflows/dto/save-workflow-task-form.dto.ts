import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmptyObject, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveWorkflowTaskFormDto {
  @ApiProperty({
    description: '节点表单草稿数据',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @IsNotEmptyObject()
  payload!: Record<string, unknown>;

  @ApiPropertyOptional({ description: '保存备注' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
