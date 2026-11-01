import { IsIn } from 'class-validator';
import { RolOrganizacion } from '@prisma/client';

export class ChangeRoleDto {
  @IsIn([RolOrganizacion.ADMINISTRADOR, RolOrganizacion.EDITOR, RolOrganizacion.LECTURA])
  rolOrganizacion!: RolOrganizacion;
}
