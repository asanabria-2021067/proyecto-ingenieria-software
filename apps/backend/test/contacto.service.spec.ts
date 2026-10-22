import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ContactoService, MENSAJE_CONTACTO_ENVIADO } from '../src/contacto/contacto.service';
import { CONTACTO_LIMITES, CreateContactoDto } from '../src/contacto/dto/create-contacto.dto';
import { NotificationsService } from '../src/notifications/notifications.service';
import { NOTIFICATION_TEMPLATES } from '../src/notifications/templates/notification.templates';

const VALIDO = {
  nombre: 'Ana Pérez',
  correo: 'per23123@uvg.edu.gt',
  asunto: 'No puedo entrar a mi proyecto',
  mensaje: 'Al abrir el tablero aparece un error.',
};

function dto(overrides: Record<string, unknown> = {}) {
  return plainToInstance(CreateContactoDto, { ...VALIDO, ...overrides });
}

async function errores(overrides: Record<string, unknown> = {}) {
  const resultado = await validate(dto(overrides));
  return Object.fromEntries(resultado.map((error) => [error.property, Object.values(error.constraints ?? {})]));
}

function makeNotificationsDouble() {
  return { notifyAdminsFromTemplate: vi.fn().mockResolvedValue(undefined) };
}

function buildService(notifications = makeNotificationsDouble()) {
  return { service: new ContactoService(notifications as unknown as NotificationsService), notifications };
}

type Usuario = { idUsuario: number; roles: string[] };

function makeNotificationsPrisma(usuarios: Usuario[], bloqueados: number[] = []) {
  const creadas: Array<Record<string, unknown>> = [];
  const prisma = {
    usuarioRolAcceso: {
      findMany: vi.fn(async ({ where }: { where: { rolAcceso: { nombrePerfil: string } } }) =>
        usuarios
          .filter((u) => u.roles.includes(where.rolAcceso.nombrePerfil))
          .map((u) => ({ idUsuario: u.idUsuario })),
      ),
    },
    preferenciaNotificacion: {
      findMany: vi.fn(async ({ where }: { where: { idUsuario: { in: number[] } } }) =>
        bloqueados.filter((id) => where.idUsuario.in.includes(id)).map((idUsuario) => ({ idUsuario })),
      ),
    },
    notificacion: {
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        creadas.push(...data);
        return { count: data.length };
      }),
    },
  };
  return { prisma, creadas };
}

describe('ContactoService.enviar', () => {
  it('notifica a administración con la plantilla SOLICITUD_CONTACTO y los datos del formulario', async () => {
    const { service, notifications } = buildService();

    const resultado = await service.enviar(dto());

    expect(resultado).toEqual({ mensaje: MENSAJE_CONTACTO_ENVIADO });
    expect(notifications.notifyAdminsFromTemplate).toHaveBeenCalledTimes(1);
    expect(notifications.notifyAdminsFromTemplate).toHaveBeenCalledWith('SOLICITUD_CONTACTO', {
      ...VALIDO,
      idUsuario: null,
    });
  });

  it('guarda el usuario autenticado como dato opcional', async () => {
    const { service, notifications } = buildService();

    await service.enviar(dto(), 42);

    expect(notifications.notifyAdminsFromTemplate).toHaveBeenCalledWith(
      'SOLICITUD_CONTACTO',
      expect.objectContaining({ idUsuario: 42 }),
    );
  });

  it('envía los textos ya recortados', async () => {
    const { service, notifications } = buildService();

    await service.enviar(dto({ nombre: '  Ana Pérez  ', asunto: '  Ayuda  ', mensaje: '\n Hola \n' }));

    expect(notifications.notifyAdminsFromTemplate).toHaveBeenCalledWith(
      'SOLICITUD_CONTACTO',
      expect.objectContaining({ nombre: 'Ana Pérez', asunto: 'Ayuda', mensaje: 'Hola' }),
    );
  });

  it('propaga el error si no se pudo notificar', async () => {
    const notifications = makeNotificationsDouble();
    notifications.notifyAdminsFromTemplate.mockRejectedValue(new Error('fallo de base de datos'));
    const { service } = buildService(notifications);

    await expect(service.enviar(dto())).rejects.toThrow('fallo de base de datos');
  });
});

describe('ContactoService con el NotificationsService real', () => {
  const usuarios: Usuario[] = [
    { idUsuario: 1, roles: ['administrador'] },
    { idUsuario: 2, roles: ['administrador', 'estudiante'] },
    { idUsuario: 3, roles: ['estudiante'] },
    { idUsuario: 4, roles: ['mentor'] },
    { idUsuario: 5, roles: [] },
  ];

  function buildReal(bloqueados: number[] = []) {
    const { prisma, creadas } = makeNotificationsPrisma(usuarios, bloqueados);
    const notifications = new NotificationsService(prisma as never, {} as never);
    return { service: new ContactoService(notifications), prisma, creadas };
  }

  it('crea una notificación para cada administrador', async () => {
    const { service, prisma, creadas } = buildReal();

    await service.enviar(dto(), 3);

    expect(prisma.usuarioRolAcceso.findMany).toHaveBeenCalledWith({
      where: { rolAcceso: { nombrePerfil: 'administrador' } },
      distinct: ['idUsuario'],
      select: { idUsuario: true },
    });
    expect(creadas.map((n) => n.idUsuario).sort()).toEqual([1, 2]);
    for (const notificacion of creadas) {
      expect(notificacion).toMatchObject({
        tipoNotificacion: 'SOLICITUD_CONTACTO',
        tituloNotificacion: 'Nueva solicitud de contacto',
        datosJson: { ...VALIDO, idUsuario: 3 },
      });
    }
  });

  it('no notifica a quien no es administrador, aunque sea quien escribe', async () => {
    const { service, creadas } = buildReal();

    await service.enviar(dto(), 3);

    const destinatarios = creadas.map((n) => n.idUsuario);
    expect(destinatarios).not.toContain(3);
    expect(destinatarios).not.toContain(4);
    expect(destinatarios).not.toContain(5);
  });

  it('respeta la preferencia de un administrador que desactivó el tipo', async () => {
    const { service, creadas } = buildReal([2]);

    await service.enviar(dto());

    expect(creadas.map((n) => n.idUsuario)).toEqual([1]);
  });

  it('sin administradores no crea notificaciones y responde igual', async () => {
    const { prisma, creadas } = makeNotificationsPrisma([{ idUsuario: 3, roles: ['estudiante'] }]);
    const service = new ContactoService(new NotificationsService(prisma as never, {} as never));

    await expect(service.enviar(dto())).resolves.toEqual({ mensaje: MENSAJE_CONTACTO_ENVIADO });
    expect(creadas).toEqual([]);
    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
  });
});

describe('plantilla SOLICITUD_CONTACTO', () => {
  it('muestra quién escribe, su correo, el asunto y el mensaje', () => {
    const plantilla = NOTIFICATION_TEMPLATES.SOLICITUD_CONTACTO;

    expect(plantilla.title).toBe('Nueva solicitud de contacto');
    expect(plantilla.message({ ...VALIDO, idUsuario: null })).toBe(
      'Ana Pérez (per23123@uvg.edu.gt) escribió sobre "No puedo entrar a mi proyecto": Al abrir el tablero aparece un error.',
    );
  });
});

describe('CreateContactoDto', () => {
  it('acepta un mensaje válido y recorta los espacios', async () => {
    const valido = dto({ nombre: '  Ana Pérez ', correo: ' per23123@uvg.edu.gt ' });

    expect(await validate(valido)).toHaveLength(0);
    expect(valido.nombre).toBe('Ana Pérez');
    expect(valido.correo).toBe('per23123@uvg.edu.gt');
  });

  it('acepta exactamente los largos máximos', async () => {
    const correo = `${'a'.repeat(CONTACTO_LIMITES.correo - '@uvg.edu.gt'.length)}@uvg.edu.gt`;
    expect(correo).toHaveLength(CONTACTO_LIMITES.correo);

    expect(
      await errores({
        nombre: 'n'.repeat(CONTACTO_LIMITES.nombre),
        asunto: 'a'.repeat(CONTACTO_LIMITES.asunto),
        mensaje: 'm'.repeat(CONTACTO_LIMITES.mensaje),
      }),
    ).toEqual({});
  });

  it.each(['nombre', 'correo', 'asunto', 'mensaje'])('rechaza %s vacío o solo con espacios', async (campo) => {
    expect(Object.keys(await errores({ [campo]: '' }))).toEqual([campo]);
    expect(Object.keys(await errores({ [campo]: '   ' }))).toEqual([campo]);
  });

  it.each(['nombre', 'correo', 'asunto', 'mensaje'])('rechaza %s ausente o que no es texto', async (campo) => {
    expect(Object.keys(await errores({ [campo]: undefined }))).toEqual([campo]);
    expect(Object.keys(await errores({ [campo]: 123 }))).toEqual([campo]);
  });

  it('el mensaje de un campo vacío lo identifica como obligatorio', async () => {
    expect((await errores({ asunto: '' })).asunto).toContain('El asunto es obligatorio');
  });

  it.each(['sin-arroba', 'ana@', '@uvg.edu.gt', 'ana@uvg', 'ana perez@uvg.edu.gt'])(
    'rechaza el correo con formato inválido %s',
    async (correo) => {
      expect((await errores({ correo })).correo).toContain('El correo no tiene un formato válido');
    },
  );

  it('acepta correos que no son institucionales', async () => {
    expect(await errores({ correo: 'visitante@gmail.com' })).toEqual({});
  });

  it.each([
    ['nombre', CONTACTO_LIMITES.nombre],
    ['asunto', CONTACTO_LIMITES.asunto],
    ['mensaje', CONTACTO_LIMITES.mensaje],
  ] as const)('rechaza %s con más de %i caracteres', async (campo, limite) => {
    const resultado = await errores({ [campo]: 'x'.repeat(limite + 1) });
    expect(Object.keys(resultado)).toEqual([campo]);
    expect(resultado[campo].join(' ')).toContain(`no puede exceder ${limite} caracteres`);
  });

  it('rechaza un correo con más del largo máximo', async () => {
    const correo = `${'a'.repeat(CONTACTO_LIMITES.correo)}@uvg.edu.gt`;
    expect((await errores({ correo })).correo).toContain(
      `El correo no puede exceder ${CONTACTO_LIMITES.correo} caracteres`,
    );
  });
});
