import { Equals, IsInt } from 'class-validator';

export class TransferOwnershipDto {
  @IsInt()
  idUsuario!: number;

  @Equals(true, { message: 'Debes confirmar la transferencia de propiedad' })
  confirmar!: boolean;
}
