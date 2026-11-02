import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MENSAJE_SIN_PROYECTO_COMPARTIDO, PerfilSocialService } from '../src/social/perfil-social.service';

function build() {
  const prisma = {
    usuario: { findFirst: vi.fn().mockResolvedValue({ idUsuario: 2 }), findUnique: vi.fn().mockResolvedValue({ nombre: 'Ana', apellido: 'Paz', perfil: null }) },
    usuarioOrganizacion: { findMany: vi.fn().mockResolvedValue([]) },
    perfilEstudiante: { findUnique: vi.fn().mockResolvedValue({ idCarrera: 5 }) },
    asociacion: { findMany: vi.fn().mockResolvedValue([{ idAsociacion: 1, nombre: 'Aso', logoUrl: null }]) },
    participacionProyecto: { findMany: vi.fn().mockResolvedValue([]) },
    proyecto: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    amistad: { findFirst: vi.fn().mockResolvedValue({ idAmistad: 1 }) },
    conversacion: { findFirst: vi.fn().mockResolvedValue(null) },
    insignia: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const horas = {
    getProgreso: vi.fn().mockResolvedValue({
      semestre: { anio: 2026, periodo: 2 },
      beca: { acreditadas: 12, declaradas: 99, meta: 80 },
      extension: { acreditadas: 3, declaradas: 50, meta: 40 },
    }),
  };
  const chat = { createConversation: vi.fn().mockResolvedValue({ idConversacion: 77 }) };
  return { prisma, horas, chat, service: new PerfilSocialService(prisma as never, horas as never, chat as never) };
}

describe('PerfilSocialService', () => {
  it('resumen: orgs visibles para quien mira, asociaciones de la carrera y solo horas acreditadas', async () => {
    const { prisma, service } = build();
    prisma.usuarioOrganizacion.findMany.mockResolvedValue([
      { rolOrganizacion: 'EDITOR', organizacion: { idOrganizacion: 4, nombreOrganizacion: 'Robotica', logoUrl: null } },
    ]);
    const r = await service.resumen(1, 2);
    expect(prisma.usuarioOrganizacion.findMany.mock.calls[0][0].where).toEqual({
      idUsuario: 2,
      estadoMembresia: 'ACTIVA',
      organizacion: { OR: [{ visibilidad: 'PUBLICA' }, { miembros: { some: { idUsuario: 1, estadoMembresia: 'ACTIVA' } } }] },
    });
    expect(prisma.asociacion.findMany.mock.calls[0][0].where).toEqual({ archivada: false, carreras: { some: { idCarrera: 5 } } });
    expect(r.organizaciones).toEqual([{ idOrganizacion: 4, nombreOrganizacion: 'Robotica', logoUrl: null, rol: 'EDITOR' }]);
    expect(r.horasSemestre).toEqual({ anio: 2026, periodo: 2, becaAcreditadas: 12, extensionAcreditadas: 3 });
  });

  it('resumen, actividad y cv responden 404 si el usuario no esta en el directorio', async () => {
    const { prisma, service } = build();
    prisma.usuario.findFirst.mockResolvedValue(null);
    await expect(service.resumen(1, 2)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.actividad(1, 2)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.cv(1, 2)).rejects.toBeInstanceOf(NotFoundException);
    // El perfil propio no depende del directorio.
    await expect(service.resumen(2, 2)).resolves.toBeTruthy();
  });

  it('actividad: filtra proyectos de organizaciones privadas ajenas y ordena lo mas reciente primero', async () => {
    const { prisma, service } = build();
    prisma.participacionProyecto.findMany.mockResolvedValue([
      { fechaIngreso: new Date('2026-09-01'), rolProyecto: { nombreRol: 'Dev', proyecto: { idProyecto: 3, tituloProyecto: 'Feria' } } },
    ]);
    prisma.usuarioOrganizacion.findMany.mockResolvedValue([
      { fechaIngreso: new Date('2026-10-01'), organizacion: { idOrganizacion: 4, nombreOrganizacion: 'Robotica' } },
    ]);
    const a = await service.actividad(1, 2);
    expect(a.map((i) => i.tipo)).toEqual(['ORGANIZACION', 'PROYECTO']);
    const proyecto = prisma.participacionProyecto.findMany.mock.calls[0][0].where.rolProyecto.proyecto;
    expect(proyecto.organizaciones).toEqual({
      every: { organizacion: { OR: [{ visibilidad: 'PUBLICA' }, { miembros: { some: { idUsuario: 1, estadoMembresia: 'ACTIVA' } } }] } },
    });
    expect(proyecto.estadoProyecto.in).not.toContain('BORRADOR');
  });

  it('cv: suma horas acreditadas por proyecto cerrado e incluye los que lidero', async () => {
    const { prisma, service } = build();
    prisma.participacionProyecto.findMany.mockResolvedValue([
      {
        fechaIngreso: new Date('2026-02-01'),
        fechaSalida: new Date('2026-06-01'),
        rolProyecto: { nombreRol: 'Dev', proyecto: { idProyecto: 3, tituloProyecto: 'Feria', fechaInicio: null, fechaFinEstimada: null } },
        registrosHoras: [{ horasAprobadas: '10.5' }, { horasAprobadas: null }, { horasAprobadas: '4' }],
      },
    ]);
    prisma.proyecto.findMany.mockResolvedValue([
      { idProyecto: 8, tituloProyecto: 'App', fechaInicio: new Date('2026-01-10'), fechaFinEstimada: new Date('2026-08-01') },
    ]);
    const cv = await service.cv(1, 2);
    expect(cv.proyectos.map((p) => [p.titulo, p.rol, p.horasAcreditadas])).toEqual([
      ['App', 'Líder del proyecto', 0],
      ['Feria', 'Dev', 14.5],
    ]);
    expect(cv.totalHorasAcreditadas).toBe(14.5);
    expect(prisma.proyecto.findMany.mock.calls[0][0].where).toMatchObject({ creadoPor: 2, estadoProyecto: 'CERRADO' });
  });

  describe('abrirMensajeDirecto (MEJ-28)', () => {
    it('solo entre amigos aceptados y nunca a uno mismo', async () => {
      const { prisma, chat, service } = build();
      await expect(service.abrirMensajeDirecto(1, 1)).rejects.toBeInstanceOf(ForbiddenException);
      prisma.amistad.findFirst.mockResolvedValue(null);
      await expect(service.abrirMensajeDirecto(1, 2)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.amistad.findFirst.mock.calls[0][0].where.estado).toBe('ACEPTADA');
      expect(chat.createConversation).not.toHaveBeenCalled();
    });

    it('reutiliza la conversacion individual existente', async () => {
      const { prisma, chat, service } = build();
      prisma.conversacion.findFirst.mockResolvedValue({ idConversacion: 5, idProyecto: 3 });
      await expect(service.abrirMensajeDirecto(1, 2)).resolves.toEqual({ idConversacion: 5, idProyecto: 3 });
      expect(chat.createConversation).not.toHaveBeenCalled();
    });

    it('si no hay conversacion crea una individual en un proyecto activo compartido', async () => {
      const { prisma, chat, service } = build();
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 9 });
      await expect(service.abrirMensajeDirecto(1, 2)).resolves.toEqual({ idConversacion: 77, idProyecto: 9 });
      expect(chat.createConversation).toHaveBeenCalledWith(9, 1, { tipo: 'INDIVIDUAL', idsParticipantes: [2] });
    });

    it('sin proyecto compartido responde 409 con el motivo', async () => {
      const { prisma, chat, service } = build();
      prisma.proyecto.findFirst.mockResolvedValue(null);
      await expect(service.abrirMensajeDirecto(1, 2)).rejects.toEqual(new ConflictException(MENSAJE_SIN_PROYECTO_COMPARTIDO));
      expect(chat.createConversation).not.toHaveBeenCalled();
    });
  });
});
