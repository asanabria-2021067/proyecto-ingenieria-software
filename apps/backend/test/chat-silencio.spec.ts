import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ChatService } from '../src/chat/chat.service';
import { estaSilenciada } from '../src/chat/chat-silencio.util';
import { SilenciarConversationDto } from '../src/chat/dto/silenciar-conversation.dto';

describe('estaSilenciada', () => {
  const ahora = new Date('2026-10-16T12:00:00.000Z');

  it('sin participante o sin silencio no esta silenciada', () => {
    expect(estaSilenciada(null, ahora)).toBe(false);
    expect(estaSilenciada(undefined, ahora)).toBe(false);
    expect(estaSilenciada({ silenciadaHasta: null, silenciadaSiempre: false }, ahora)).toBe(false);
    expect(estaSilenciada({}, ahora)).toBe(false);
  });

  it('siempre silenciada aunque la fecha este vencida', () => {
    expect(estaSilenciada({ silenciadaSiempre: true, silenciadaHasta: new Date('2020-01-01') }, ahora)).toBe(true);
  });

  it('silencio vigente hasta una fecha futura', () => {
    expect(estaSilenciada({ silenciadaHasta: new Date(ahora.getTime() + 1) }, ahora)).toBe(true);
  });

  it('limite: justo al vencer ya no esta silenciada', () => {
    expect(estaSilenciada({ silenciadaHasta: new Date(ahora.getTime()) }, ahora)).toBe(false);
    expect(estaSilenciada({ silenciadaHasta: new Date(ahora.getTime() - 1) }, ahora)).toBe(false);
  });

  it('usa la hora actual por defecto', () => {
    expect(estaSilenciada({ silenciadaHasta: new Date(Date.now() + 60_000) })).toBe(true);
    expect(estaSilenciada({ silenciadaHasta: new Date(Date.now() - 60_000) })).toBe(false);
  });
});

describe('SilenciarConversationDto', () => {
  const errores = (duracion: unknown) => validate(plainToInstance(SilenciarConversationDto, { duracion }));

  it.each(['1h', '8h', 'siempre'])('acepta %s', async (d) => {
    expect(await errores(d)).toHaveLength(0);
  });

  it.each(['2h', '', undefined, 1])('rechaza %s', async (d) => {
    expect(await errores(d)).not.toHaveLength(0);
  });
});

describe('ChatService silencio por usuario', () => {
  const AHORA = new Date('2026-10-16T12:00:00.000Z');
  let prisma: any;
  let service: ChatService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    prisma = {
      conversacion: {
        findFirst: vi.fn().mockResolvedValue({
          idConversacion: 5,
          participantes: [{ idUsuario: 1 }, { idUsuario: 2 }],
          proyecto: { estadoProyecto: 'EN_PROGRESO' },
        }),
      },
      conversacionParticipante: { update: vi.fn().mockResolvedValue({}) },
    };
    service = new ChatService(prisma, {} as any);
  });
  afterEach(() => vi.useRealTimers());

  const where = { idConversacion_idUsuario: { idConversacion: 5, idUsuario: 1 } };

  it('1h silencia hasta una hora despues solo al participante', async () => {
    await service.silenciar(10, 5, 1, '1h');
    expect(prisma.conversacionParticipante.update).toHaveBeenCalledWith({
      where,
      data: { silenciadaSiempre: false, silenciadaHasta: new Date(AHORA.getTime() + 3_600_000) },
    });
  });

  it('8h silencia hasta ocho horas despues', async () => {
    await service.silenciar(10, 5, 1, '8h');
    expect(prisma.conversacionParticipante.update.mock.calls[0][0].data.silenciadaHasta).toEqual(
      new Date(AHORA.getTime() + 8 * 3_600_000),
    );
  });

  it('siempre marca silenciadaSiempre y limpia la fecha', async () => {
    await service.silenciar(10, 5, 1, 'siempre');
    expect(prisma.conversacionParticipante.update).toHaveBeenCalledWith({
      where,
      data: { silenciadaSiempre: true, silenciadaHasta: null },
    });
  });

  it('activarSonido limpia ambos campos', async () => {
    await service.activarSonido(10, 5, 1);
    expect(prisma.conversacionParticipante.update).toHaveBeenCalledWith({
      where,
      data: { silenciadaSiempre: false, silenciadaHasta: null },
    });
  });

  it('un no participante no puede silenciar ni reactivar', async () => {
    await expect(service.silenciar(10, 5, 99, '1h')).rejects.toThrow(ForbiddenException);
    await expect(service.activarSonido(10, 5, 99)).rejects.toThrow(ForbiddenException);
    expect(prisma.conversacionParticipante.update).not.toHaveBeenCalled();
  });

  it('listConversations expone el silencio del usuario que consulta', async () => {
    prisma.proyecto = { findFirst: vi.fn().mockResolvedValue({ idProyecto: 10, creadoPor: 1, estadoProyecto: 'EN_PROGRESO' }) };
    prisma.mensajeChat = { count: vi.fn().mockResolvedValue(3) };
    const usuario = { idUsuario: 1, nombre: 'A', apellido: 'B', fotoUrl: null };
    const hasta = new Date(AHORA.getTime() + 60_000);
    prisma.conversacion.findMany = vi.fn().mockResolvedValue([
      {
        idConversacion: 5, tipo: 'INDIVIDUAL', nombre: null, nombrePersonalizado: null, esFavorita: false,
        archivadaEn: null, silenciada: false, esPrioritaria: true, mensajes: [],
        participantes: [
          { idUsuario: 1, ultimaLecturaEn: null, silenciadaHasta: hasta, silenciadaSiempre: false, usuario },
          { idUsuario: 2, ultimaLecturaEn: null, silenciadaHasta: null, silenciadaSiempre: false, usuario },
        ],
      },
    ]);
    const [c] = await service.listConversations(10, 1);
    expect(c.silenciadaPorMi).toBe(true);
    expect(c.silenciadaHasta).toEqual(hasta);
    expect(c.silenciadaSiempre).toBe(false);
  });
});
