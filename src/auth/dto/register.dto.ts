import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { USERROLE } from '@prisma/client';

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  fullName!: string;

  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  tenantName?: string;

  @IsOptional()
  @IsEnum(USERROLE, { message: 'Invalid user role' })
  role?: USERROLE;
}
