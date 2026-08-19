import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
} from 'class-validator';

// Manually written as all-optional to avoid @nestjs/mapped-types ESM interop
// issues with class-validator's MetadataStorage in nodenext module resolution.
export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email?: string;

  @IsOptional()
  @IsString()
  @IsPhoneNumber('NP')
  phoneNumber?: string;
}
