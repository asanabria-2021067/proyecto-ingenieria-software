import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleInvitationsService } from '../src/role-invitations/role-invitations.service';
import { makeProjectPolicyDouble, makeProjectTransactionDouble } from './helpers/project-policy.double';

const ROL = { idRolProyecto: 4, nombreRol: 'Backend', cupos: 2, proyecto: { idProyecto: 9, tituloProyecto: 'Feria', eliminadoEn: null } };

function crear(lider = 1) {
  const prisma: Record<string, any> = {
    rolProyecto: { findUnique: vi.fn().mockResolvedValue(ROL) },
    proyecto: { findFirst: vi.fn() },
    usuario: {
      findFirst: vi.fn().mockResolvedValue({ idUsuario: 20 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ nombre: 'Ana', apellido: 'Paz' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    participacionProyecto: { count: vi.fn().mockResolvedValue(0), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
    invitacionRolProyecto: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ idInvitacionRol: 50, idRolProyecto: 4, idInvitado: 20, estado: 'PENDIENTE', creadaEn: new Date() }),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    postulacion: { count: vi.fn().mockResolvedValue(0) },
  };
  const notifications = {
    persistTemplateTx: vi.fn().mockResolvedValue({ count: 1 }),
    persistUsersTx: vi.fn().mockResolvedValue({ count: 1 }),
    publishEffects: vi.fn().mockResolvedValue(undefined),
  };
  const projectTx = makeProjectTransactionDouble({ tx: prisma, project: { creadoPor: lider, estadoProyecto: 'PUBLICADO' } });
  const policy = makeProjectPolicyDouble();
  const eventEmitter = { emit: vi.fn() };
  const chat = { sincronizarSinFallar: vi.fn().mockResolvedValue(undefined) };
  const reuniones = { notificarIngresoTx: vi.fn().mockResolvedValue(undefined) };
  const service = new RoleInvitationsService(
    prisma as never, notifications as never, projectTx as never, policy as never, eventEmitter as never, chat as never, reuniones as never,
  );
  return { prisma, notifications, policy, eventEmitter, chat, reuniones, service };
}

describe('RoleInvitationsService.invitar (MEJ-22)', () => {
  let ctx: ReturnType<typeof crear>;
  beforeEach(() => {
    ctx = crear();
  });

  it('el líder invita, se notifica al invitado y se publica tras el commit', async () => {
    const inv = await ctx.service.invitar(1, { idRolProyecto: 4, idUsuario: 20, mensaje: '  Te sumas?  ' });
    expect(inv.idInvitacionRol).toBe(50);
    expect(ctx.prisma.invitacionRolProyecto.create.mock.calls[0][0].data).toMatchObject({ idInvitado: 20, idInvitadoPor: 1, mensaje: 'Te sumas?' });
    expect(ctx.notifications.persistTemplateTx.mock.calls[0].slice(1, 4)).toEqual([
      [20],
      'INVITACION_ROL_PROYECTO',
      expect.objectContaining({ roleName: 'Backend', invitationId: 50, invitedBy: 'Ana Paz', projectId: 9 }),
    ]);
    expect(ctx.notifications.publishEffects).toHaveBeenCalled();
  });

  it('alguien que no es el líder no invita', async () => {
    ctx = crear(77);
    await expect(ctx.service.invitar(1, { idRolProyecto: 4, idUsuario: 20 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(ctx.prisma.invitacionRolProyecto.create).not.toHaveBeenCalled();
  });

  it('no se invita a uno mismo ni a roles de proyectos borrados', async () => {
    await expect(ctx.service.invitar(1, { idRolProyecto: 4, idUsuario: 1 })).rejects.toBeInstanceOf(BadRequestException);
    ctx.prisma.rolProyecto.findUnique.mockResolvedValue({ ...ROL, proyecto: { ...ROL.proyecto, eliminadoEn: new Date() } });
    await expect(ctx.service.invitar(1, { idRolProyecto: 4, idUsuario: 20 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('solo se invita a cuentas activas que no son administradores', async () => {
    ctx.prisma.usuario.findFirst.mockResolvedValue(null);
    await expect(ctx.service.invitar(1, { idRolProyecto: 4, idUsuario: 20 })).rejects.toBeInstanceOf(NotFoundException);
    const where = ctx.prisma.usuario.findFirst.mock.calls[0][0].where;
    expect(where.estado).toBe('ACTIVO');
    expect(where.rolesAcceso).toEqual({ none: { rolAcceso: { nombrePerfil: 'administrador' } } });
  });

  it('rechaza duplicados: ya participa, invitación pendiente o postulación pendiente', async () => {
    ctx.prisma.participacionProyecto.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await expect(ctx.service.invitar(1, { idRolProyecto: 4, idUsuario: 20 })).rejects.toBeInstanceOf(ConflictException);

    ctx = crear();
    ctx.prisma.invitacionRolProyecto.count.mockResolvedValue(1);
    await expect(ctx.service.invitar(1, { idRolProyecto: 4, idUsuario: 20 })).rejects.toBeInstanceOf(ConflictException);

    ctx = crear();
    ctx.prisma.postulacion.count.mockResolvedValue(1);
    await expect(ctx.service.invitar(1, { idRolProyecto: 4, idUsuario: 20 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('no invita a un rol sin cupos', async () => {
    ctx.prisma.participacionProyecto.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    await expect(ctx.service.invitar(1, { idRolProyecto: 4, idUsuario: 20 })).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.prisma.invitacionRolProyecto.create).not.toHaveBeenCalled();
  });

  it('respeta la política del proyecto (publicado o en progreso)', async () => {
    ctx.policy.assertWriteTx.mockRejectedValue(new ConflictException('estado'));
    await expect(ctx.service.invitar(1, { idRolProyecto: 4, idUsuario: 20 })).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.policy.assertWriteTx.mock.calls[0][2]).toBe('POSTULACION');
  });
});

describe('RoleInvitationsService.responder (MEJ-22)', () => {
  const INV = { idInvitado: 20, idInvitadoPor: 1, estado: 'PENDIENTE', rolProyecto: ROL };
  let ctx: ReturnType<typeof crear>;
  beforeEach(() => {
    ctx = crear();
    ctx.prisma.invitacionRolProyecto.findUnique.mockResolvedValue(INV);
  });

  it('aceptar crea la participación activa, avisa al líder y sincroniza el chat', async () => {
    await expect(ctx.service.responder(20, 50, true)).resolves.toEqual({ idInvitacionRol: 50, estado: 'ACEPTADA' });
    expect(ctx.prisma.participacionProyecto.create).toHaveBeenCalledWith({ data: { idUsuario: 20, idRolProyecto: 4, estadoParticipacion: 'ACTIVO' } });
    expect(ctx.reuniones.notificarIngresoTx).toHaveBeenCalled();
    expect(ctx.notifications.persistUsersTx.mock.calls[0][1]).toEqual([1]);
    expect(ctx.chat.sincronizarSinFallar).toHaveBeenCalledWith(9);
    expect(ctx.eventEmitter.emit).toHaveBeenCalled();
  });

  it('aceptar reactiva una participación retirada en vez de duplicarla', async () => {
    ctx.prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 3, estadoParticipacion: 'RETIRADO' });
    await ctx.service.responder(20, 50, true);
    expect(ctx.prisma.participacionProyecto.create).not.toHaveBeenCalled();
    expect(ctx.prisma.participacionProyecto.update.mock.calls[0][0].data).toMatchObject({ estadoParticipacion: 'ACTIVO', fechaSalida: null });
  });

  it('rechazar no crea participación ni sincroniza el chat', async () => {
    await expect(ctx.service.responder(20, 50, false)).resolves.toEqual({ idInvitacionRol: 50, estado: 'RECHAZADA' });
    expect(ctx.prisma.participacionProyecto.create).not.toHaveBeenCalled();
    expect(ctx.chat.sincronizarSinFallar).not.toHaveBeenCalled();
    expect(ctx.notifications.persistUsersTx.mock.calls[0][2].tituloNotificacion).toBe('Rechazaron tu invitación');
  });

  it('nadie responde una invitación ajena: se ve como inexistente', async () => {
    await expect(ctx.service.responder(99, 50, true)).rejects.toBeInstanceOf(NotFoundException);
    ctx.prisma.invitacionRolProyecto.findUnique.mockResolvedValue(null);
    await expect(ctx.service.responder(20, 50, true)).rejects.toBeInstanceOf(NotFoundException);
    expect(ctx.prisma.invitacionRolProyecto.updateMany).not.toHaveBeenCalled();
  });

  it('una invitación ya respondida no se responde otra vez', async () => {
    ctx.prisma.invitacionRolProyecto.findUnique.mockResolvedValue({ ...INV, estado: 'ACEPTADA' });
    await expect(ctx.service.responder(20, 50, true)).rejects.toBeInstanceOf(ConflictException);
  });

  it('si otra respuesta ganó la carrera (CAS) no hay doble alta', async () => {
    ctx.prisma.invitacionRolProyecto.updateMany.mockResolvedValue({ count: 0 });
    await expect(ctx.service.responder(20, 50, true)).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.prisma.participacionProyecto.create).not.toHaveBeenCalled();
  });

  it('aceptar con el rol lleno falla (el cupo se reevalúa bajo el lock)', async () => {
    ctx.prisma.participacionProyecto.count.mockResolvedValue(2);
    await expect(ctx.service.responder(20, 50, true)).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.prisma.participacionProyecto.create).not.toHaveBeenCalled();
  });
});

describe('RoleInvitationsService listados', () => {
  it('mias solo consulta las pendientes del usuario', async () => {
    const { prisma, service } = crear();
    await service.mias(20);
    expect(prisma.invitacionRolProyecto.findMany.mock.calls[0][0].where).toMatchObject({ idInvitado: 20, estado: 'PENDIENTE' });
  });

  it('las pendientes de un proyecto solo las ve su líder', async () => {
    const { prisma, service } = crear();
    prisma.proyecto.findFirst.mockResolvedValue({ creadoPor: 1 });
    await expect(service.delProyecto(2, 9)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.delProyecto(1, 9)).resolves.toEqual([]);
    prisma.proyecto.findFirst.mockResolvedValue(null);
    await expect(service.delProyecto(1, 9)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RoleInvitationsService.sugerencias (MEJ-62)', () => {
  const candidato = (id: number, habilidades: number[], idCarrera = 1) => ({
    idUsuario: id,
    nombre: `U${id}`,
    apellido: 'X',
    fotoUrl: null,
    perfil: { idCarrera, carrera: { nombreCarrera: idCarrera === 1 ? 'Computacion' : 'Industrial' } },
    habilidades: habilidades.map((idHabilidad) => ({ idHabilidad, nivelHabilidad: 'BASICO', habilidad: { nombreHabilidad: `H${idHabilidad}` } })),
  });

  it('sin habilidades ni carrera no sugiere ni consulta', async () => {
    const { prisma, service } = crear();
    await expect(service.sugerencias(1, { habilidades: [] })).resolves.toEqual([]);
    expect(prisma.usuario.findMany).not.toHaveBeenCalled();
  });

  it('ordena por % de coincidencia y desempata por la misma carrera', async () => {
    const { prisma, service } = crear();
    prisma.usuario.findMany.mockResolvedValue([
      candidato(30, [1], 2),
      candidato(31, [1, 2]),
      candidato(32, [1], 1),
      candidato(33, [], 1),
    ]);
    const r = await service.sugerencias(1, { habilidades: [1, 2], idCarrera: 1 });
    expect(r.map((s) => [s.idUsuario, s.porcentaje])).toEqual([[31, 100], [32, 50], [30, 50], [33, 0]]);
    expect(r[0].habilidadesEnComun).toEqual(['H1', 'H2']);
  });

  it('sin la carrera, descarta a quien no coincide en nada y respeta el límite', async () => {
    const { prisma, service } = crear();
    prisma.usuario.findMany.mockResolvedValue([candidato(30, [1]), candidato(31, []), candidato(32, [1])]);
    const r = await service.sugerencias(1, { habilidades: [1], limite: 1 });
    expect(r.map((s) => s.idUsuario)).toEqual([30]);
  });

  it('consulta solo estudiantes activos, sin admins ni el propio líder', async () => {
    const { prisma, service } = crear();
    await service.sugerencias(1, { habilidades: [1] });
    const where = prisma.usuario.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ estado: 'ACTIVO', perfil: { isNot: null }, idUsuario: { notIn: [1] } });
    expect(where.rolesAcceso).toEqual({ none: { rolAcceso: { nombrePerfil: 'administrador' } } });
  });

  it('con proyecto: solo el líder, y excluye a quienes ya participan', async () => {
    const { prisma, service } = crear();
    prisma.proyecto.findFirst.mockResolvedValue({ creadoPor: 2, roles: [] });
    await expect(service.sugerencias(1, { habilidades: [1], idProyecto: 9 })).rejects.toBeInstanceOf(ForbiddenException);

    prisma.proyecto.findFirst.mockResolvedValue({ creadoPor: 1, roles: [{ participaciones: [{ idUsuario: 40 }, { idUsuario: 41 }] }] });
    await service.sugerencias(1, { habilidades: [1], idProyecto: 9 });
    expect(prisma.usuario.findMany.mock.calls[0][0].where.idUsuario).toEqual({ notIn: [1, 40, 41] });

    prisma.proyecto.findFirst.mockResolvedValue(null);
    await expect(service.sugerencias(1, { habilidades: [1], idProyecto: 9 })).rejects.toBeInstanceOf(NotFoundException);
  });
});
