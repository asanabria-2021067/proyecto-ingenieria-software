import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { normalizarEnlace, tipoDeEnlace } from '../src/perfil-portafolio/enlaces-perfil.service';
import { HabilidadConfirmacionesService } from '../src/perfil-portafolio/habilidad-confirmaciones.service';
import { PortafolioService } from '../src/perfil-portafolio/portafolio.service';

const TOKEN = 'a'.repeat(43);

describe('MEJ-149 enlaces', () => {
  it('detecta el tipo por dominio', () => {
    expect(tipoDeEnlace('https://github.com/ana')).toBe('GITHUB');
    expect(tipoDeEnlace('https://www.linkedin.com/in/ana')).toBe('LINKEDIN');
    expect(tipoDeEnlace('https://behance.net/ana')).toBe('BEHANCE');
    expect(tipoDeEnlace('https://evilgithub.com/ana')).toBe('SITIO');
    expect(tipoDeEnlace('https://ana.dev')).toBe('SITIO');
  });

  it.each([
    'http://ana.dev',
    'javascript:alert(1)',
    'https://user:pass@ana.dev',
    'https://127.0.0.1/x',
    'https://localhost/x',
    'https://[::1]/x',
    'https://ana.dev:8443/x',
    'no es una url',
  ])('rechaza %s', (url) => {
    expect(() => normalizarEnlace(url)).toThrow(BadRequestException);
  });

  it('normaliza una url valida', () => {
    expect(normalizarEnlace(' https://Ana.dev/Portafolio ')).toBe('https://ana.dev/Portafolio');
  });
});

describe('MEJ-146 portafolio publico', () => {
  function crear(fila: unknown) {
    const prisma = { portafolioPublico: { findUnique: vi.fn().mockResolvedValue(fila) } };
    const perfilSocial = {
      cv: vi.fn().mockResolvedValue({
        nombre: 'Ana Paz',
        carrera: 'Ingenieria',
        proyectos: [{ idProyecto: 9, titulo: 'Huerto', rol: 'Backend', inicio: '2025-01-01', fin: '2025-06-01', horasAcreditadas: 80 }],
        totalHorasAcreditadas: 80,
      }),
    };
    const confirmaciones = { listar: vi.fn().mockResolvedValue([{ idHabilidad: 1, nombre: 'React', nivel: 'AVANZADO', confirmaciones: 3, confirmadaPorMi: false, puedoConfirmar: false }]) };
    const servicio = new PortafolioService(prisma as never, perfilSocial as never, confirmaciones as never);
    return { servicio, prisma, perfilSocial, confirmaciones };
  }
  const activa = { idUsuario: 5, activo: true, indexable: false, usuario: { estado: 'ACTIVO' } };

  it('solo devuelve nombre, carrera, habilidades y proyectos (sin horas, correo, carne ni telefono)', async () => {
    const { servicio, perfilSocial, confirmaciones } = crear(activa);
    const vista = await servicio.publico(TOKEN);
    expect(vista).toEqual({
      nombre: 'Ana Paz',
      carrera: 'Ingenieria',
      habilidades: [{ nombre: 'React', nivel: 'AVANZADO', confirmaciones: 3 }],
      proyectos: [{ titulo: 'Huerto', rol: 'Backend' }],
      indexable: false,
    });
    expect(JSON.stringify(vista)).not.toMatch(/horas|correo|carne|telefono|idUsuario|idProyecto/i);
    // Se consulta como visitante sin sesion (id 0): solo proyectos de organizaciones publicas.
    expect(perfilSocial.cv).toHaveBeenCalledWith(0, 5);
    expect(confirmaciones.listar).toHaveBeenCalledWith(0, 5);
  });

  it.each([
    ['token con formato invalido', 'corto', activa],
    ['token inexistente', TOKEN, null],
    ['portafolio desactivado', TOKEN, { ...activa, activo: false }],
    ['cuenta no activa', TOKEN, { ...activa, usuario: { estado: 'INACTIVO' } }],
  ])('%s responde 404', async (_n, token, fila) => {
    const { servicio } = crear(fila);
    await expect(servicio.publico(token)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('solo un estudiante puede activar su portafolio', async () => {
    const prisma = { perfilEstudiante: { findUnique: vi.fn().mockResolvedValue(null) }, portafolioPublico: { upsert: vi.fn() } };
    const servicio = new PortafolioService(prisma as never, {} as never, {} as never);
    await expect(servicio.actualizar(1, { activo: true })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.portafolioPublico.upsert).not.toHaveBeenCalled();
  });
});

describe('MEJ-147 confirmar habilidades', () => {
  function crear({ comparten = true, existe = true, p2002 = false } = {}) {
    const prisma = {
      usuario: { findFirst: vi.fn().mockResolvedValue({ idUsuario: 2 }) },
      usuarioHabilidad: { findUnique: vi.fn().mockResolvedValue(existe ? { idUsuarioHabilidad: 1 } : null) },
      proyecto: { findFirst: vi.fn().mockResolvedValue(comparten ? { idProyecto: 1 } : null) },
      confirmacionHabilidad: {
        create: p2002
          ? vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }))
          : vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    return { prisma, servicio: new HabilidadConfirmacionesService(prisma as never) };
  }

  it('confirma una habilidad de un companero de proyecto', async () => {
    const { servicio, prisma } = crear();
    await expect(servicio.confirmar(1, 2, 7)).resolves.toEqual({ ok: true });
    expect(prisma.confirmacionHabilidad.create).toHaveBeenCalledWith({ data: { idUsuario: 2, idHabilidad: 7, idConfirmador: 1 } });
  });

  it('no permite confirmar las propias habilidades', async () => {
    const { servicio } = crear();
    await expect(servicio.confirmar(2, 2, 7)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exige compartir proyecto', async () => {
    const { servicio, prisma } = crear({ comparten: false });
    await expect(servicio.confirmar(1, 2, 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.confirmacionHabilidad.create).not.toHaveBeenCalled();
  });

  it('una sola vez por persona: el duplicado es 409', async () => {
    const { servicio } = crear({ p2002: true });
    await expect(servicio.confirmar(1, 2, 7)).rejects.toBeInstanceOf(ConflictException);
  });

  it('la persona debe tener la habilidad', async () => {
    const { servicio } = crear({ existe: false });
    await expect(servicio.confirmar(1, 2, 7)).rejects.toBeInstanceOf(NotFoundException);
  });
});
