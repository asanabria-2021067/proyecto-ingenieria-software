import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminEntidadesService } from '../src/admin/admin-entidades.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const admin = (esAdmin = true) => ({
  findFirst: vi.fn().mockResolvedValue(esAdmin ? { idUsuario: 1 } : null),
});

describe('MEJ-36 metricas por asociacion y organizacion', () => {
  it('cuenta proyectos activos y cerrados e ignora los eliminados de la organizacion', async () => {
    const prisma = {
      usuarioRolAcceso: admin(),
      asociacion: {
        findMany: vi.fn().mockResolvedValue([
          {
            idAsociacion: 1,
            nombre: 'AECC',
            archivada: false,
            _count: { junta: 3, carreras: 1 },
            proyectos: [{ estadoProyecto: 'EN_PROGRESO' }, { estadoProyecto: 'CERRADO' }, { estadoProyecto: 'BORRADOR' }],
          },
        ]),
      },
      organizacion: {
        findMany: vi.fn().mockResolvedValue([
          {
            idOrganizacion: 2,
            nombreOrganizacion: 'Robotica',
            estadoOrganizacion: 'INACTIVA',
            visibilidad: 'PUBLICA',
            _count: { miembros: 6 },
            proyectos: [
              { proyecto: { estadoProyecto: 'PUBLICADO', eliminadoEn: null } },
              { proyecto: { estadoProyecto: 'PUBLICADO', eliminadoEn: new Date() } },
            ],
          },
        ]),
      },
    };
    const r = await new AdminEntidadesService(prisma as unknown as PrismaService).metricas(1);
    expect(r.asociaciones[0]).toMatchObject({ integrantesJunta: 3, proyectosTotales: 3, proyectosActivos: 1, proyectosCerrados: 1 });
    expect(r.organizaciones[0]).toMatchObject({ archivada: true, miembros: 6, proyectosTotales: 1, proyectosActivos: 1 });
  });

  it('un no administrador recibe 403', async () => {
    const prisma = { usuarioRolAcceso: admin(false) };
    await expect(new AdminEntidadesService(prisma as unknown as PrismaService).metricas(9)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
