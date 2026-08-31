import { IsNotEmpty, IsNumber, IsPositive, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class InitiateEsewaPaymentDto {
  @ApiProperty({
    example: 'ESEWA',
    description: 'Payment gateway to use',
    enum: ['ESEWA', 'KHALTI'],
  })
  @IsString()
  @IsNotEmpty()
  gateway!: 'ESEWA' | 'KHALTI';
}

export class KhaltiCallbackDto {
  @ApiProperty({ example: 'pidx_xyz123', description: 'Khalti payment index token' })
  @IsString()
  @IsNotEmpty()
  pidx!: string;

  @ApiProperty({ example: 'cldlk2abc123', description: 'Invoice ID' })
  @IsString()
  @IsNotEmpty()
  purchase_order_id!: string;

  @ApiProperty({ example: 'Completed' })
  @IsString()
  status!: string;
}
