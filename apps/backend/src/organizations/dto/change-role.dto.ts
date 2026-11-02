import { IsIn } from 'class-validator';
import { RolOrganizacion } from '@prisma/client';
import { ROLES_ASIGNABLES } from '../organization-access';

export class ChangeRoleDto {
  @IsIn([...ROLES_ASIGNABLES])
  rolOrganizacion!: RolOrganizacion;
}
