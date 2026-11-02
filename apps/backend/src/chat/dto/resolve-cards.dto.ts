import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';

export class ResolveCardsDto {
  /** Rutas internas (sin origen ni query), p. ej. `/dashboard/projects/3/kanban/tasks/9`. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  rutas!: string[];
}
