import { IsISO8601 } from 'class-validator';

export class CreateReminderDto {
  @IsISO8601({ strict: true })
  recordarEn!: string;
}
