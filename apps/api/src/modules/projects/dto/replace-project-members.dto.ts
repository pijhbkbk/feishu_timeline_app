import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';

import { ProjectMemberDto } from './project-member.dto';

export class ReplaceProjectMembersDto {
  @ApiProperty({ type: [ProjectMemberDto], description: '项目成员列表' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectMemberDto)
  members!: ProjectMemberDto[];
}
