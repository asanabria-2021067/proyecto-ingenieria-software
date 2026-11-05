import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PortafolioService } from '../src/perfil-portafolio/portafolio.service';

const TOKEN = 'A'.repeat(43);

function build(fila: Record<string, unknown> | null = null) {
  const prisma = {
    perfilEstudiante: { findUnique: vi.fn().mockResolvedValue({ idUsuario: 1 }) },
    portafolioPublico: { findUnique: vi.fn().mockResolvedValue(fila), upsert: vi.fn().mockResolvedValue({}) },
  };
  // Datos "sucios" a proposito: correo, carne, telefono y horas no deben llegar a la respuesta publica.
  const perfilSocial = {
    cv: vi.fn().mockResolvedValue({
      nombre: 'Ana Paz',
      carrera: 'Ingenieria en Sistemas',
      correo: 'ana@uvg.edu.gt',
      carne: '20123',
      telefono: '5555-5555',
      totalHorasAcreditadas: 80,
      proyectos: [{ idProyecto: 9, titulo: 'Huerto', rol: 'Desarrolladora', inicio: '2026-01-01', fin: '2026-06-01', horasAcreditadas: 80 }],
    }),
  };
  const confirmaciones = {
    listar: vi.fn().mockResolvedValue([
      { idHabilidad: 3, nombre: 'TypeScript', nivel: 'AVANZADO', confirmaciones: 2, confirmadaPorMi: false, puedoConfirmar: false },
    ]),
  };
  return { prisma, perfilSocial, confirmaciones, service: new PortafolioService(prisma as never, perfilSocial as never, confirmaciones as never) };
}

const activo = { idUsuario: 1, activo: true, indexable: false, usuario: { estado: 'ACTIVO' } };

describe('PortafolioService', () => {
  it('estado: sin fila esta desactivado y sin token', async () => {
    const { service } = build(null);
    await expect(service.estado(1)).resolves.toEqual({ activo: false, indexable: false, token: null });
  });

  it('activar crea el token opaco (43 caracteres base64url) y no usa el id', async () => {
    const { prisma, service } = build(null);
    await service.actualizar(1, { activo: true });
    const args = prisma.portafolioPublico.upsert.mock.calls[0][0];
    expect(args.create.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(args.create.activo).toBe(true);
    expect(args.update).toEqual({ activo: true });
  });

  it('los tokens generados no se repiten', async () => {
    const { prisma, service } = build(null);
    await service.regenerar(1);
    await service.regenerar(1);
    const [a, b] = prisma.portafolioPublico.upsert.mock.calls.map((c) => c[0].update.token);
    expect(a).not.toBe(b);
  });

  it('desactivar no cambia el token y regenerar solo cambia el token', async () => {
    const { prisma, service } = build({ idUsuario: 1, activo: true, indexable: false, token: TOKEN });
    await service.actualizar(1, { activo: false });
    expect(prisma.portafolioPublico.upsert.mock.calls[0][0].update).toEqual({ activo: false });
    await service.regenerar(1);
    const regenerar = prisma.portafolioPublico.upsert.mock.calls[1][0];
    expect(Object.keys(regenerar.update)).toEqual(['token']);
  });

  it('quien no es estudiante (sin perfil) no puede activar ni regenerar', async () => {
    const { prisma, service } = build(null);
    prisma.perfilEstudiante.findUnique.mockResolvedValue(null);
    await expect(service.actualizar(1, { activo: true })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.regenerar(1)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.portafolioPublico.upsert).not.toHaveBeenCalled();
  });

  it('publico: devuelve SOLO la lista blanca (falla si se filtra cualquier campo extra)', async () => {
    const { service, perfilSocial, confirmaciones } = build(activo);
    const vista = await service.publico(TOKEN);
    expect(vista).toEqual({
      nombre: 'Ana Paz',
      carrera: 'Ingenieria en Sistemas',
      habilidades: [{ nombre: 'TypeScript', nivel: 'AVANZADO', confirmaciones: 2 }],
      proyectos: [{ titulo: 'Huerto', rol: 'Desarrolladora' }],
      indexable: false,
    });
    expect(Object.keys(vista).sort()).toEqual(['carrera', 'habilidades', 'indexable', 'nombre', 'proyectos']);
    expect(Object.keys(vista.proyectos[0]).sort()).toEqual(['rol', 'titulo']);
    expect(Object.keys(vista.habilidades[0]).sort()).toEqual(['confirmaciones', 'nivel', 'nombre']);
    const texto = JSON.stringify(vista);
    for (const prohibido of ['ana@uvg.edu.gt', '20123', '5555-5555', 'horasAcreditadas', 'totalHoras', 'correo', 'carne']) {
      expect(texto).not.toContain(prohibido);
    }
    // Se consulta como "nadie" (idVisor 0): solo lo visible sin sesion.
    expect(perfilSocial.cv).toHaveBeenCalledWith(0, 1);
    expect(confirmaciones.listar).toHaveBeenCalledWith(0, 1);
  });

  it('publico: token inexistente, desactivado o con formato invalido responden el mismo 404', async () => {
    const inexistente = build(null);
    await expect(inexistente.service.publico(TOKEN)).rejects.toBeInstanceOf(NotFoundException);
    const inactivo = build({ ...activo, activo: false });
    await expect(inactivo.service.publico(TOKEN)).rejects.toBeInstanceOf(NotFoundException);
    expect(inactivo.perfilSocial.cv).not.toHaveBeenCalled();
    const malFormato = build(activo);
    for (const token of ['1', 'abc', 'A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}!`, '../etc/passwd']) {
      await expect(malFormato.service.publico(token)).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(malFormato.prisma.portafolioPublico.findUnique).not.toHaveBeenCalled();
  });

  it('publico: una cuenta que ya no esta ACTIVA deja de mostrarse', async () => {
    const { service } = build({ ...activo, usuario: { estado: 'INACTIVO' } });
    await expect(service.publico(TOKEN)).rejects.toBeInstanceOf(NotFoundException);
  });
});
