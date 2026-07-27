import {
  ProjectStatus,
  UserStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AdminLedgerQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  projectId?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  projectStatus?: ProjectStatus;

  @IsOptional()
  @IsEnum(WorkflowTaskStatus)
  taskStatus?: WorkflowTaskStatus;

  @IsOptional()
  @IsEnum(WorkflowNodeCode)
  nodeCode?: WorkflowNodeCode;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  departmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ownerUserId?: string;

  @IsOptional()
  @IsIn([
    'ALL',
    'OVERDUE',
    'DUE_SOON',
    'UNASSIGNED',
    'BLOCKED',
    'WAITING_REVIEW',
    'MISSING_MATERIAL',
    'MONTHLY_REVIEW',
    'COMPLETED',
  ])
  view?: string;

  @IsOptional()
  @IsIn(['updatedAt', 'createdAt', 'name', 'plannedEndDate', 'effectiveDueAt', 'sequence'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class AdminOrganizationQueryDto extends AdminLedgerQueryDto {
  @IsOptional()
  @IsIn(['users', 'departments', 'members'])
  tab?: 'users' | 'departments' | 'members';
}

export class AdminSavedViewQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  pageKey!: string;
}

export class AdminSavedViewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  pageKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsObject()
  config!: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class AdminVersionedCommandDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class AdminProjectBasicInfoDto extends AdminVersionedCommandDto {
  @IsDateString()
  expectedVersion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  vehicleModel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  colorName?: string | null;

  @IsOptional()
  @IsDateString()
  plannedStartDate?: string | null;

  @IsOptional()
  @IsDateString()
  plannedEndDate?: string | null;
}

export class AdminSchedulePreviewDto {
  @IsDateString()
  taskVersion!: string;

  @IsOptional()
  @IsDateString()
  plannedStartAt?: string | null;

  @IsDateString()
  plannedDueAt!: string;

  @IsIn(['CURRENT_TASK_ONLY', 'CURRENT_PROJECT_FUTURE_TASKS'])
  scope!: 'CURRENT_TASK_ONLY' | 'CURRENT_PROJECT_FUTURE_TASKS';

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class AdminScheduleChangeDto
  extends AdminSchedulePreviewDto
  implements AdminVersionedCommandDto
{
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsBoolean()
  acknowledgedConsequences!: boolean;
}

export class AdminAssignmentPreviewDto {
  @IsDateString()
  taskVersion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  primaryDepartmentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ownerUserId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  collaboratorUserIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  reviewerUserIds?: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  confirmInProgress?: boolean;
}

export class AdminAssignmentChangeDto
  extends AdminAssignmentPreviewDto
  implements AdminVersionedCommandDto
{
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsBoolean()
  acknowledgedConsequences!: boolean;
}

export class AdminNodeAssignmentPreviewDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  primaryDepartmentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ownerUserId?: string | null;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  collaboratorUserIds!: string[];

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  reviewerUserIds!: string[];

  @IsIn(['FUTURE_ONLY', 'FUTURE_AND_PENDING', 'CONFIRM_IN_PROGRESS'])
  scope!:
    | 'FUTURE_ONLY'
    | 'FUTURE_AND_PENDING'
    | 'CONFIRM_IN_PROGRESS';

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class AdminNodeAssignmentChangeDto
  extends AdminNodeAssignmentPreviewDto
  implements AdminVersionedCommandDto
{
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsBoolean()
  acknowledgedConsequences!: boolean;
}

export class AdminUserStatusChangeDto extends AdminVersionedCommandDto {
  @IsDateString()
  expectedVersion!: string;

  @IsEnum(UserStatus)
  status!: UserStatus;
}

export class AdminUserConfigurationPreviewDto {
  @IsOptional()
  @IsDateString()
  expectedVersion?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  mobile?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  departmentId?: string | null;

  @IsEnum(UserStatus)
  status!: UserStatus;

  @IsBoolean()
  isSystemAdmin!: boolean;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  roleIds!: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class AdminUserConfigurationChangeDto
  extends AdminUserConfigurationPreviewDto
  implements AdminVersionedCommandDto
{
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsBoolean()
  acknowledgedConsequences!: boolean;
}

export class AdminDepartmentConfigurationPreviewDto {
  @IsOptional()
  @IsDateString()
  expectedVersion?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  leadUserId?: string | null;

  @IsInt()
  @Min(0)
  sortOrder!: number;

  @IsBoolean()
  isActive!: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class AdminDepartmentConfigurationChangeDto
  extends AdminDepartmentConfigurationPreviewDto
  implements AdminVersionedCommandDto
{
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsBoolean()
  acknowledgedConsequences!: boolean;
}

export class AdminDictionaryChangeDto extends AdminVersionedCommandDto {
  @IsDateString()
  expectedVersion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class AdminTemplateVersionDto extends AdminVersionedCommandDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  version!: string;

  @IsDateString()
  effectiveAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(18)
  @IsObject({ each: true })
  nodeOverrides?: Array<Record<string, unknown>>;
}

export class AdminBatchTaskRowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  taskId!: string;

  @IsDateString()
  taskVersion!: string;
}

export class AdminBatchTaskPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AdminBatchTaskRowDto)
  tasks!: AdminBatchTaskRowDto[];

  @IsIn(['SCHEDULE', 'ASSIGNMENT'])
  operation!: 'SCHEDULE' | 'ASSIGNMENT';

  @IsOptional()
  @IsDateString()
  plannedDueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  primaryDepartmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ownerUserId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class AdminBatchTaskChangeDto
  extends AdminBatchTaskPreviewDto
  implements AdminVersionedCommandDto
{
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsBoolean()
  acknowledgedConsequences!: boolean;
}

export class AdminTaskScheduleImportPreviewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1_000_000)
  csv!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class AdminTaskScheduleImportDto
  extends AdminTaskScheduleImportPreviewDto
  implements AdminVersionedCommandDto
{
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsBoolean()
  acknowledgedConsequences!: boolean;
}
