import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { RolOrganizacion } from '@prisma/client';
import { ROLES_ASIGNABLES } from '../organization-access';

const normalizarCorreo = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class InviteMemberDto {
  @ValidateIf((o: InviteMemberDto) => o.correo === undefined)
  @IsInt()
  idUsuario?: number;

  @ValidateIf((o: InviteMemberDto) => o.idUsuario === undefined)
  @Transform(normalizarCorreo)
  @IsString()
  @IsEmail()
  @MaxLength(255)
  correo?: string;

  @IsIn([...ROLES_ASIGNABLES])
  rolOrganizacion!: RolOrganizacion;
}

export class SearchCandidatesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
