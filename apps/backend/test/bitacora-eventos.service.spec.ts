import { describe, expect, it, vi } from 'vitest';
import { BitacoraEventosService } from '../src/bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';

function makeTx() {
  return {
    bitacoraAuditoria: { create: vi.fn().mockResolvedValue({ idAuditoria: 1 }) },
  };
}

describe('BitacoraEventosService.registrarEvento', () => {
  it('escribe en bitacora_auditoria vía el tx recibido, nunca vía PrismaService directo', async () => {
    const tx = makeTx();
    const service = new BitacoraEventosService();

    await service.registrarEvento({
      tx: tx as any,
      tipoEvento: TipoEventoBitacora.TASK_CREATED,
      idActor: 9,
      idProyecto: 5,
      idSprint: 3,
      tipoEntidad: 'TAREA',
      idEntidad: 100,
      valorNuevo: { tituloTarea: 'Nueva tarea' },
    });

    expect(tx.bitacoraAuditoria.create).toHaveBeenCalledTimes(1);
  });

  it('mapea los campos tipados al esquema real de BitacoraAuditoria (accion/tipoObjeto/idObjeto/detalleJson)', async () => {
    const tx = makeTx();
    const service = new BitacoraEventosService();

    await service.registrarEvento({
      tx: tx as any,
      tipoEvento: TipoEventoBitacora.TASK_STATUS_CHANGED,
      idActor: 9,
      idProyecto: 5,
      idSprint: 3,
      tipoEntidad: 'TAREA',
      idEntidad: 100,
      valorAnterior: { estadoTarea: 'POR_HACER' },
      valorNuevo: { estadoTarea: 'EN_PROGRESO' },
    });

    expect(tx.bitacoraAuditoria.create).toHaveBeenCalledWith({
      data: {
        idUsuario: 9,
        accion: 'TASK_STATUS_CHANGED',
        tipoObjeto: 'TAREA',
        idObjeto: '100',
        detalleJson: {
          idProyecto: 5,
          idSprint: 3,
          valorAnterior: { estadoTarea: 'POR_HACER' },
          valorNuevo: { estadoTarea: 'EN_PROGRESO' },
        },
      },
    });
  });

  it('normaliza idSprint/valorAnterior/valorNuevo ausentes a null, nunca a undefined', async () => {
    const tx = makeTx();
    const service = new BitacoraEventosService();

    await service.registrarEvento({
      tx: tx as any,
      tipoEvento: TipoEventoBitacora.SPRINT_STARTED,
      idActor: 9,
      idProyecto: 5,
      tipoEntidad: 'SPRINT',
      idEntidad: 3,
    });

    expect(tx.bitacoraAuditoria.create).toHaveBeenCalledWith({
      data: {
        idUsuario: 9,
        accion: 'SPRINT_STARTED',
        tipoObjeto: 'SPRINT',
        idObjeto: '3',
        detalleJson: {
          idProyecto: 5,
          idSprint: null,
          valorAnterior: null,
          valorNuevo: null,
        },
      },
    });
  });

  it('propaga el error si la escritura falla, para que la transacción del llamador revierta también la operación principal', async () => {
    const tx = makeTx();
    const error = new Error('fallo de base de datos');
    tx.bitacoraAuditoria.create.mockRejectedValue(error);
    const service = new BitacoraEventosService();

    await expect(
      service.registrarEvento({
        tx: tx as any,
        tipoEvento: TipoEventoBitacora.TASK_CREATED,
        idActor: 9,
        idProyecto: 5,
        tipoEntidad: 'TAREA',
        idEntidad: 100,
      }),
    ).rejects.toBe(error);
  });
});
