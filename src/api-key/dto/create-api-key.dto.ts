import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({
    example: 'Production Stripe Webhook Integration',
    description: 'Human-readable label for this API key',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    example: '2027-01-01T00:00:00.000Z',
    description: 'Optional expiration timestamp for time-limited keys',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ApiKeyCreatedResponseDto {
  @ApiProperty({ example: 'clx123abc' })
  id!: string;

  @ApiProperty({ example: 'Production Stripe Webhook Integration' })
  name!: string;

  @ApiProperty({ example: 'cms_live_a1b2c3' })
  prefix!: string;

  @ApiProperty({
    example: 'cms_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
    description: 'Full secret key. Displayed ONLY ONCE upon creation.',
  })
  apiKey!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  expiresAt?: Date | null;

  @ApiProperty({ example: '2026-08-31T00:00:00.000Z' })
  createdAt!: Date;
}
