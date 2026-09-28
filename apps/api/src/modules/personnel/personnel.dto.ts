import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { BUSINESS_ROLE_CODES } from './personnel.constants';

export class PersonnelQueryDto {
  @IsOptional() @IsIn(BUSINESS_ROLE_CODES) roleCode?: string;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsIn(['all', 'unassigned', 'active', 'inactive', 'historical']) filter?: string;
  @IsOptional() @IsString() @MaxLength(64) after?: string;
}

export class PersonnelChangeDto {
  @IsISO8601({ strict: true }) @MaxLength(32) expectedVersion!: string;
  @IsUUID('4') requestId!: string;
  @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayMaxSize(7) @ArrayUnique()
  @IsIn(BUSINESS_ROLE_CODES, { each: true }) roleCodes?: string[];
  @ValidateIf((_object, value) => value !== undefined) @Transform(({ obj, key }) => obj[key]) @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsString() @MaxLength(300) reason!: string;
}
