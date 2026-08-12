import { IsEmail, IsNotEmpty, IsPhoneNumber, IsString } from 'class-validator';
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;
  @IsEmail()
  email!: string;
  @IsPhoneNumber('NP')
  phoneNumber!: string;
}
