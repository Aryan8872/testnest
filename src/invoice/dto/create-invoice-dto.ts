import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreateCustomerDto } from '../../customer/dto/create-customer.dto.js';
import { AtLeastOneOf } from './at-least-one.validator.js';

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

@AtLeastOneOf(['customerId', 'customerData'], {
  message: 'Either customerId or customerData must be provided',
})
export class CreateInvoiceDTO {
  @IsNumber({}, { message: 'amount must be number' })
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  amount!: number;

  @IsDateString({}, { message: 'due date must be a valid ISO date string' })
  due_date!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus = InvoiceStatus.DRAFT;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCustomerDto)
  customerData?: CreateCustomerDto;
}
