import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';
import { USERROLE } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @IsPhoneNumber('NP')
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  tenant_id?: string;

  @IsOptional()
  @IsEnum(USERROLE)
  role?: USERROLE;
}
