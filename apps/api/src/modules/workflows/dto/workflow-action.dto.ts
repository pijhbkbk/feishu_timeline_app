import { ApiPropertyOptional } from '@nestjs/swagger';
import { WorkflowNodeCode } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class WorkflowActionDto {
  @ApiPropertyOptional({ description: '操作备注' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ enum: WorkflowNodeCode, description: '退回目标节点' })
  @IsOptional()
  @IsEnum(WorkflowNodeCode)
  targetNodeCode?: WorkflowNodeCode;

  @ApiPropertyOptional({
    description: '扩展元数据',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
