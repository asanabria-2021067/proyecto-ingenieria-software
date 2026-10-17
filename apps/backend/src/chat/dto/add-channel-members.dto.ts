import { ArrayMinSize, ArrayUnique, IsArray, IsInt } from 'class-validator';

export class AddChannelMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  idsUsuarios!: number[];
}
