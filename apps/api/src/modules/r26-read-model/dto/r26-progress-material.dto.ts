import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const R26_PROGRESS_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'WORK_COMPLETE_PENDING_TASK_COMPLETION',
] as const;

export const R26_BLOCKER_TYPES = [
  'WAITING_MATERIAL',
  'WAITING_CONFIRMATION',
  'SUPPLIER',
  'COLLABORATION',
  'EQUIPMENT',
  'OTHER',
] as const;

export const R26_IMPACT_LEVELS = [
  'NO_DEADLINE_IMPACT',
  'MAY_DELAY',
  'ALREADY_DELAYED',
] as const;

export type R26ProgressStatus = (typeof R26_PROGRESS_STATUSES)[number];
export type R26BlockerType = (typeof R26_BLOCKER_TYPES)[number];
export type R26ImpactLevel = (typeof R26_IMPACT_LEVELS)[number];

export class R26ProgressDraftDto {
  @IsInt()
  @Min(0)
  draftVersion!: number;

  @IsIn(R26_PROGRESS_STATUSES)
  progressStatus!: R26ProgressStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  completedWork?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  nextPlan?: string | null;

  @IsOptional()
  @IsIn(R26_BLOCKER_TYPES)
  blockerType?: R26BlockerType | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  blockerDescription?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  assistanceUserIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  assistanceDepartmentIds?: string[];

  @IsOptional()
  @IsISO8601()
  expectedResolvedAt?: string | null;

  @IsOptional()
  @IsIn(R26_IMPACT_LEVELS)
  impactLevel?: R26ImpactLevel | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;
}

export class R26DeleteProgressDraftDto {
  @IsInt()
  @Min(1)
  draftVersion!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;
}

export class R26SubmitProgressDto {
  @IsIn(R26_PROGRESS_STATUSES)
  progressStatus!: R26ProgressStatus;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  completedWork!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  nextPlan?: string | null;

  @IsOptional()
  @IsIn(R26_BLOCKER_TYPES)
  blockerType?: R26BlockerType | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  blockerDescription?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  assistanceUserIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  assistanceDepartmentIds?: string[];

  @IsOptional()
  @IsISO8601()
  expectedResolvedAt?: string | null;

  @IsOptional()
  @IsIn(R26_IMPACT_LEVELS)
  impactLevel?: R26ImpactLevel | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  attachmentIds?: string[];

  @IsISO8601()
  taskVersion!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;
}

export class R26UploadMaterialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  materialType!: string;

  @IsISO8601()
  taskVersion!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  replacesAttachmentId?: string | null;
}
