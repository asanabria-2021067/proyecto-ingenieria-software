import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Prisma } from '@prisma/client';
import { CreateOrganizationDto } from '../src/organizations/dto/create-organization.dto';
import { UpdateOrganizationDto } from '../src/organizations/dto/update-organization.dto';
import { InviteMemberDto } from '../src/organizations/dto/invite-member.dto';
import { ChangeRoleDto } from '../src/organizations/dto/change-role.dto';
import { TransferOwnershipDto } from '../src/organizations/dto/transfer-ownership.dto';
import { CreateProjectFullDto } from '../src/projects/dto/create-project-full.dto';
import { assertPuedePublicar, DIAS_VENCIMIENTO, venceEnDesde } from '../src/organizations/organization-access';
import { crearParticipaciones, validarParticipantes } from '../src/organizations/organization-projects';
import { conCuposDisponibles } from '../src/projects/projects.read-model';

const errores = async <T extends object>(clase: new () => T, plano: object) =>
  (await validate(plainToInstance(clase, plano), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property);

describe('DTO de organizaciones', () => {
  const base = { nombreOrganizacion: 'Club de robótica' };

  it('crear: acepta lo mínimo y recorta el nombre', async () => {
    const dto = plainToInstance(CreateOrganizationDto, { nombreOrganizacion: '  Club de robótica  ' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.nombreOrganizacion).toBe('Club de robótica');
  });

  it('crear: nombre corto, visibilidad desconocida, logo ajeno a Cloudinary y sitio no http se rechazan', async () => {
    expect(await errores(CreateOrganizationDto, { nombreOrganizacion: 'ab' })).toEqual(['nombreOrganizacion']);
    expect(await errores(CreateOrganizationDto, { ...base, visibilidad: 'SECRETA' })).toEqual(['visibilidad']);
    expect(await errores(CreateOrganizationDto, { ...base, logoUrl: 'https://otro.example/logo.png' })).toEqual(['logoUrl']);
    expect(await errores(CreateOrganizationDto, { ...base, logoUrl: 'http://res.cloudinary.com/demo/logo.png' })).toEqual(['logoUrl']);
    expect(await errores(CreateOrganizationDto, { ...base, sitioWeb: 'javascript:alert(1)' })).toEqual(['sitioWeb']);
  });

  it('crear: logo de Cloudinary y sitio https son válidos; vacío significa quitarlos', async () => {
    expect(await errores(CreateOrganizationDto, { ...base, logoUrl: 'https://res.cloudinary.com/demo/image/upload/a.png', sitioWeb: 'https://uvg.edu.gt' })).toEqual([]);
    expect(await errores(CreateOrganizationDto, { ...base, logoUrl: '', sitioWeb: '' })).toEqual([]);
  });

  it('crear: campos desconocidos (estado, creador, rol) no se aceptan', async () => {
    expect(await errores(CreateOrganizationDto, { ...base, estadoOrganizacion: 'ACTIVA', creadaPor: 1 })).toEqual(['estadoOrganizacion', 'creadaPor']);
  });

  it('editar: todo es opcional', async () => {
    expect(await errores(UpdateOrganizationDto, {})).toEqual([]);
    expect(await errores(UpdateOrganizationDto, { visibilidad: 'PUBLICA', descripcionOrganizacion: 'x' })).toEqual([]);
  });

  it('invitar: pide idUsuario o correo, y un rol asignable (nunca Propietario)', async () => {
    expect(await errores(InviteMemberDto, { rolOrganizacion: 'LECTURA' })).toEqual(['idUsuario', 'correo']);
    expect(await errores(InviteMemberDto, { idUsuario: 4, rolOrganizacion: 'EDITOR' })).toEqual([]);
    expect(await errores(InviteMemberDto, { correo: 'a@uvg.edu.gt', rolOrganizacion: 'ADMINISTRADOR' })).toEqual([]);
    expect(await errores(InviteMemberDto, { idUsuario: 4, rolOrganizacion: 'PROPIETARIO' })).toEqual(['rolOrganizacion']);
    expect(await errores(InviteMemberDto, { idUsuario: 4, rolOrganizacion: 'MIEMBRO' })).toEqual(['rolOrganizacion']);
    expect(plainToInstance(InviteMemberDto, { correo: '  Ana@UVG.edu.gt ', rolOrganizacion: 'LECTURA' }).correo).toBe('ana@uvg.edu.gt');
  });

  it('cambiar rol: Propietario no es un destino válido', async () => {
    expect(await errores(ChangeRoleDto, { rolOrganizacion: 'PROPIETARIO' })).toEqual(['rolOrganizacion']);
    expect(await errores(ChangeRoleDto, { rolOrganizacion: 'EDITOR' })).toEqual([]);
  });

  it('transferir: exige confirmar === true', async () => {
    expect(await errores(TransferOwnershipDto, { idUsuario: 3 })).toEqual(['confirmar']);
    expect(await errores(TransferOwnershipDto, { idUsuario: 3, confirmar: false })).toEqual(['confirmar']);
    expect(await errores(TransferOwnershipDto, { idUsuario: 3, confirmar: true })).toEqual([]);
  });

  it('crear proyecto: acepta idOrganizacion y participantes con su posición de rol', async () => {
    const proyecto = {
      tituloProyecto: 'Proyecto de prueba',
      descripcionProyecto: 'Una descripción con más de veinte caracteres.',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      modalidadProyecto: 'VIRTUAL',
      accion: 'BORRADOR',
    };
    expect(await errores(CreateProjectFullDto, { ...proyecto, idOrganizacion: 2, participantes: [{ idUsuario: 5, indiceRol: 0 }] })).toEqual([]);
    expect(await errores(CreateProjectFullDto, { ...proyecto, participantes: [{ idUsuario: 5, indiceRol: -1 }] })).toEqual(['participantes']);
  });
});

describe('organization-access', () => {
  it('las invitaciones y solicitudes vencen exactamente a los 14 días', () => {
    const ahora = new Date('2026-11-01T12:00:00.000Z');
    expect(DIAS_VENCIMIENTO).toBe(14);
    expect(venceEnDesde(ahora).toISOString()).toBe('2026-11-15T12:00:00.000Z');
  });

  const txConCuenta = (validas: number) => ({ usuarioOrganizacion: { count: vi.fn().mockResolvedValue(validas) } }) as unknown as Prisma.TransactionClient;

  it('publicar a nombre de organizaciones exige permiso en todas y no revela cuál falló', async () => {
    await expect(assertPuedePublicar(txConCuenta(2), 1, [10, 11, 10])).resolves.toBeUndefined();
    await expect(assertPuedePublicar(txConCuenta(1), 1, [10, 11])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un proyecto personal no consulta nada', async () => {
    const tx = txConCuenta(0);
    await assertPuedePublicar(tx, 1, []);
    expect(tx.usuarioOrganizacion.count).not.toHaveBeenCalled();
  });

  it('la consulta solo cuenta membresías activas de Propietario, Administrador o Editor en organizaciones activas', async () => {
    const tx = txConCuenta(1);
    await assertPuedePublicar(tx, 7, [3]);
    expect(tx.usuarioOrganizacion.count).toHaveBeenCalledWith({
      where: {
        idUsuario: 7,
        idOrganizacion: { in: [3] },
        estadoMembresia: 'ACTIVA',
        rolOrganizacion: { in: ['PROPIETARIO', 'ADMINISTRADOR', 'EDITOR'] },
        organizacion: { estadoOrganizacion: 'ACTIVA' },
      },
    });
  });
});

describe('organization-projects', () => {
  const tx = (validos: number) => ({ usuarioOrganizacion: { count: vi.fn().mockResolvedValue(validos) } }) as unknown as Prisma.TransactionClient;
  const roles = [{ cupos: 2 }, { cupos: 1 }];

  it('sin participantes no valida nada', async () => {
    await expect(validarParticipantes(tx(0), 1, undefined, [], roles)).resolves.toBeUndefined();
  });

  it('exige organización, ids distintos del líder y sin repetir, roles existentes y cupos suficientes', async () => {
    const intento = (idOrganizacion: number | undefined, participantes: { idUsuario: number; indiceRol: number }[], validos = participantes.length) =>
      validarParticipantes(tx(validos), 1, idOrganizacion, participantes, roles);

    await expect(intento(undefined, [{ idUsuario: 2, indiceRol: 0 }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(intento(9, [{ idUsuario: 1, indiceRol: 0 }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(intento(9, [{ idUsuario: 2, indiceRol: 0 }, { idUsuario: 2, indiceRol: 1 }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(intento(9, [{ idUsuario: 2, indiceRol: 5 }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(intento(9, [{ idUsuario: 2, indiceRol: 1 }, { idUsuario: 3, indiceRol: 1 }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(intento(9, [{ idUsuario: 2, indiceRol: 0 }], 0)).rejects.toBeInstanceOf(BadRequestException);
    await expect(intento(9, [{ idUsuario: 2, indiceRol: 0 }, { idUsuario: 3, indiceRol: 0 }, { idUsuario: 4, indiceRol: 1 }])).resolves.toBeUndefined();
  });

  it('en un proyecto de asociación valida junta y estudiantes de sus carreras (usuarios activos)', async () => {
    const count = vi.fn().mockResolvedValue(2);
    const cliente = { usuario: { count } } as unknown as Prisma.TransactionClient;
    const participantes = [{ idUsuario: 2, indiceRol: 0 }, { idUsuario: 3, indiceRol: 0 }];

    await expect(validarParticipantes(cliente, 1, undefined, participantes, roles, 5)).resolves.toBeUndefined();
    expect(count).toHaveBeenCalledWith({
      where: {
        idUsuario: { in: [2, 3] },
        estado: 'ACTIVO',
        OR: [
          { juntasAsociacion: { some: { idAsociacion: 5 } } },
          { perfil: { is: { carrera: { asociaciones: { some: { idAsociacion: 5 } } } } } },
        ],
      },
    });

    count.mockResolvedValue(1);
    await expect(validarParticipantes(cliente, 1, undefined, participantes, roles, 5)).rejects.toBeInstanceOf(BadRequestException);
    await expect(validarParticipantes(cliente, 1, undefined, [{ idUsuario: 1, indiceRol: 0 }], roles, 5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('idAsociacion null cuenta como ausente: 400 sin consultar la base', async () => {
    const count = vi.fn();
    const cliente = { usuario: { count } } as unknown as Prisma.TransactionClient;
    await expect(validarParticipantes(cliente, 1, undefined, [{ idUsuario: 2, indiceRol: 0 }], roles, null)).rejects.toBeInstanceOf(BadRequestException);
    expect(count).not.toHaveBeenCalled();
  });

  it('crea las participaciones activas en el rol que corresponde a cada posición', async () => {
    const createMany = vi.fn();
    const cliente = { participacionProyecto: { createMany } } as unknown as Prisma.TransactionClient;
    await crearParticipaciones(cliente, [{ idUsuario: 2, indiceRol: 1 }, { idUsuario: 3, indiceRol: 0 }], [100, 200]);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { idUsuario: 2, idRolProyecto: 200, estadoParticipacion: 'ACTIVO' },
        { idUsuario: 3, idRolProyecto: 100, estadoParticipacion: 'ACTIVO' },
      ],
    });
  });
});

describe('conCuposDisponibles', () => {
  it('descuenta los participantes activos de cada rol y nunca baja de cero', () => {
    const proyecto = conCuposDisponibles({
      idProyecto: 1,
      roles: [
        { cupos: 6, _count: { participaciones: 4 } },
        { cupos: 1, _count: { participaciones: 3 } },
      ],
    });
    expect(proyecto.roles).toEqual([
      { cupos: 6, cuposDisponibles: 2 },
      { cupos: 1, cuposDisponibles: 0 },
    ]);
  });
});
