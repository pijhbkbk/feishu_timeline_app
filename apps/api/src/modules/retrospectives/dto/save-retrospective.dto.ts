import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class RetrospectiveImprovementDto {
  @IsString()
  @MaxLength(500)
  problem!: string;

  @IsString()
  @MaxLength(1000)
  rootCause!: string;

  @IsString()
  @MaxLength(1000)
  measure!: string;

  @IsString()
  @MaxLength(200)
  responsibleDepartment!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsBoolean()
  isWorkflowRuleUpdate!: boolean;
}

export class SaveRetrospectiveDto {
  @ApiPropertyOptional({ description: '复盘结论' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  conclusion?: string;

  @ApiProperty({ description: '后续改进措施', type: [RetrospectiveImprovementDto] })
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => RetrospectiveImprovementDto)
  improvementMeasures!: RetrospectiveImprovementDto[];

  @ApiPropertyOptional({ description: '做得好的地方' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  strengths?: string;

  @ApiPropertyOptional({ description: '主要问题' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  problems?: string;

  @ApiPropertyOptional({ description: '可复用经验' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reusableExperience?: string;

  @ApiPropertyOptional({ description: '建议更新的流程规则' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  workflowRuleUpdates?: string;
}
