import { ProjectMemberType, WorkflowNodeCode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const R26_ASSIGNMENT_SCOPES = [
  'FUTURE_ONLY',
  'FUTURE_AND_PENDING',
  'CONFIRM_IN_PROGRESS',
] as const;

export type R26AssignmentScope = (typeof R26_ASSIGNMENT_SCOPES)[number];

export const R26_MEMBER_CHANGE_TYPES = ['ADD', 'UPDATE', 'REMOVE'] as const;
export type R26MemberChangeType = (typeof R26_MEMBER_CHANGE_TYPES)[number];

export class R26MemberDraftDto {
  @IsIn(R26_MEMBER_CHANGE_TYPES)
  type!: R26MemberChangeType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsEnum(ProjectMemberType, { each: true })
  memberTypes?: ProjectMemberType[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsibility?: string | null;

  @IsOptional()
  @IsBoolean()
  isDepartmentLead?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefaultExecutor?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(18)
  @IsEnum(WorkflowNodeCode, { each: true })
  defaultNodeCodes?: WorkflowNodeCode[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  transferToUserId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  replacementOwnerUserId?: string | null;
}

export class R26AssignmentPreviewDto {
  @IsIn(R26_ASSIGNMENT_SCOPES)
  scope!: R26AssignmentScope;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(18)
  @IsEnum(WorkflowNodeCode, { each: true })
  nodeCodes?: WorkflowNodeCode[];

  @IsOptional()
  @ValidateNested()
  @Type(() => R26MemberDraftDto)
  memberChange?: R26MemberDraftDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => R26TaskTransferDraftDto)
  taskTransfer?: R26TaskTransferDraftDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(18)
  @IsString({ each: true })
  confirmedInProgressTaskIds?: string[];
}

export class R26TaskTransferDraftDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  taskId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  newOwnerUserId!: string;
}

export class R26VersionedCommandDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

export class R26UpsertMemberDto extends R26VersionedCommandDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsEnum(ProjectMemberType, { each: true })
  memberTypes!: ProjectMemberType[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsibility?: string | null;

  @IsOptional()
  @IsBoolean()
  isDepartmentLead?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefaultExecutor?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(18)
  @IsEnum(WorkflowNodeCode, { each: true })
  defaultNodeCodes?: WorkflowNodeCode[];
}

export class R26RemoveMemberDto extends R26VersionedCommandDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  transferToUserId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  replacementOwnerUserId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(18)
  @IsString({ each: true })
  confirmedInProgressTaskIds?: string[];
}

export class R26ApplyAssignmentsDto extends R26VersionedCommandDto {
  @IsIn(R26_ASSIGNMENT_SCOPES)
  scope!: R26AssignmentScope;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(18)
  @IsEnum(WorkflowNodeCode, { each: true })
  nodeCodes?: WorkflowNodeCode[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(18)
  @IsString({ each: true })
  confirmedInProgressTaskIds?: string[];
}

export class R26TransferTaskDto extends R26VersionedCommandDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  newOwnerUserId!: string;

  @IsOptional()
  @IsBoolean()
  confirmInProgress?: boolean;
}
