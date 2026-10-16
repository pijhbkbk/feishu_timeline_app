import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

export class TeamTaskQueryDto {
  @IsOptional() @IsIn(['mine', 'available', 'completed', 'exceptions', 'overdue']) view?: 'mine' | 'available' | 'completed' | 'exceptions' | 'overdue';
  @IsOptional() @IsString() @MaxLength(64) after?: string;
  @IsOptional() @IsString() @MaxLength(64) assignee?: string;
  @IsOptional() @IsString() @MaxLength(64) projectId?: string;
}

export class TeamTaskCommandDto {
  @IsUUID('4') requestId!: string;
  @Transform(({ obj, key }) => obj[key]) @IsInt() @Min(0) @Max(2147483646) assignmentEpoch!: number;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(64) assigneeUserId?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(300) reason?: string;
}
