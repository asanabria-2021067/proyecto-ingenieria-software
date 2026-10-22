import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

export class SetApodoDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 40)
  @Matches(/^[^\p{Cc}]*$/u, { message: 'El apodo no puede contener caracteres de control' })
  apodo!: string;
}
