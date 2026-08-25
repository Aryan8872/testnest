import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Page must be at least 1' })
  @Max(1000, { message: 'Page must be at most 1000' })
  page = 1;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must be at most 100' })
  limit = 10;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
  get take(): number {
    return this.limit;
  }
}
