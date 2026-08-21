import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
} from 'class-validator';
import { TENANTSTATUS } from '@prisma/client';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsPhoneNumber('NP')
  @IsNotEmpty()
  phoneNumber: string;
  @IsEnum(TENANTSTATUS)
  @IsOptional()
  status: TENANTSTATUS;
}
