import {
  Equals,
  IsBoolean,
  IsISO8601,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class R26CompletionPreviewDto {
  @IsISO8601()
  taskVersion!: string;
}

export class R26CompleteOrdinaryTaskDto {
  @IsISO8601()
  taskVersion!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  completionReason!: string;

  @IsBoolean()
  @Equals(true)
  acknowledgedConsequences!: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;
}

export class R26ResolveTaskBlockerDto {
  @IsISO8601()
  taskVersion!: string;

  @IsISO8601()
  actualResolvedAt!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  resolutionSummary!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;
}
