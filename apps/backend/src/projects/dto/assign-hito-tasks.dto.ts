import { ArrayNotEmpty, ArrayUnique, IsArray, IsInt, Min } from 'class-validator';

export class AssignHitoTasksDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  idsTareas!: number[];
}