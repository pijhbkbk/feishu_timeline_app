import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { NATIVE_JOB_CODES, NATIVE_PASSWORD_MIN_LENGTH, type NativeJobCode } from '../native-auth.rules';

export class NativeLoginDto {
  @IsString() @MinLength(1) @MaxLength(128)
  username!: string;

  @IsString() @MinLength(1) @MaxLength(256)
  password!: string;
}

export class NativeRegisterDto extends NativeLoginDto {
  @IsString() @MinLength(1) @MaxLength(80)
  name!: string;
}

export class NativePasswordChangeDto {
  @IsString() @MinLength(1) @MaxLength(256)
  currentPassword!: string;

  @IsString() @MinLength(NATIVE_PASSWORD_MIN_LENGTH) @MaxLength(256)
  newPassword!: string;
}

export class NativeRecoveryDto {
  @IsString() @MinLength(43) @MaxLength(43)
  token!: string;

  @IsString() @MinLength(NATIVE_PASSWORD_MIN_LENGTH) @MaxLength(256)
  newPassword!: string;
}

export class NativeJobDto {
  @IsIn(NATIVE_JOB_CODES)
  job!: NativeJobCode;
}
