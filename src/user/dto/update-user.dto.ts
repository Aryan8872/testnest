import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';
import { USERROLE } from '@prisma/client';

// Manually written as all-optional to avoid @nestjs/mapped-types ESM interop
// issues with class-validator's MetadataStorage in nodenext module resolution.
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsPhoneNumber('NP')
  phoneNumber?: string;

  @IsOptional()
  @IsEnum(USERROLE)
  role?: USERROLE;
}
