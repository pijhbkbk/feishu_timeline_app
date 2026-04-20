import { ProjectMemberType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ProjectMemberDto {
  @ApiProperty({ description: '项目成员用户 ID' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId!: string;

  @ApiProperty({ enum: ProjectMemberType, description: '成员类型' })
  @IsEnum(ProjectMemberType)
  memberType!: ProjectMemberType;

  @ApiPropertyOptional({ description: '成员头衔', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  title?: string | null;

  @ApiPropertyOptional({ description: '是否主负责人', default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
