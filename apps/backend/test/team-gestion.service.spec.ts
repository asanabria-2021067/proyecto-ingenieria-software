import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BajaIntegranteDto } from '../src/team/dto/baja-integrante.dto';
import { TeamGestionService } from '../src/team/team-gestion.service';

const LIDER = 1;
const ADMIN = 2;
const ESTUDIANTE = 3;

function makeService() {
  const prisma = {
    proyecto: { findUnique: vi.fn().mockResolvedValue({ creadoPor: LIDER, tituloProyecto: 'P' }) },
    usuarioRolAcceso: {
      findFirst: vi.fn(async ({ where }: { where: { idUsuario: number; rolAcceso: { nombrePerfil: string } } }) =>
        where.idUsuario === ADMIN && where.rolAcceso.nombrePerfil === 'administrador' ? { idUsuarioRolAcceso: 1 } : null,
      ),
    },
    $transaction: vi.fn(),
  };
  const service = new TeamGestionService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  return { service, prisma };
}

describe('TeamGestionService', () => {
  it('baja: el líder y un estudiante reciben 403 antes de abrir la transacción', async () => {
    const { service, prisma } = makeService();
    for (const actor of [LIDER, ESTUDIANTE]) {
      await expect(service.darDeBaja(10, 5, actor, 'motivo suficiente')).rejects.toMatchObject({ status: 403 });
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('carga: un estudiante recibe 403', async () => {
    const { service, prisma } = makeService();
    await expect(service.cargaEquipo(10, ESTUDIANTE)).rejects.toMatchObject({ status: 403 });
    expect(prisma.proyecto.findUnique).toHaveBeenCalled();
  });

  it('proyecto inexistente: 404', async () => {
    const { service, prisma } = makeService();
    prisma.proyecto.findUnique.mockResolvedValue(null);
    await expect(service.darDeBaja(10, 5, ADMIN, 'motivo suficiente')).rejects.toMatchObject({ status: 404 });
  });

  it('motivo: obligatorio, saneado y acotado', async () => {
    const errores = async (motivo: unknown) => validate(plainToInstance(BajaIntegranteDto, { motivo }));
    expect(await errores('')).not.toHaveLength(0);
    expect(await errores('   ')).not.toHaveLength(0);
    expect(await errores('corto')).not.toHaveLength(0);
    expect(await errores(undefined)).not.toHaveLength(0);
    expect(await errores('x'.repeat(501))).not.toHaveLength(0);
    const ok = plainToInstance(BajaIntegranteDto, { motivo: '  No   cumple\n\tacuerdos del equipo  ' });
    expect(await validate(ok)).toHaveLength(0);
    expect(ok.motivo).toBe('No cumple acuerdos del equipo');
  });
});
