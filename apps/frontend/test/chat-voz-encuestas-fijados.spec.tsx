import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

beforeAll(() => {
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

const extras = vi.hoisted(() => ({
  votar: vi.fn(),
  cerrar: vi.fn(),
  crear: vi.fn(),
  fijarOrg: vi.fn(),
  fijadosOrg: [] as unknown[],
}));
vi.mock('@/hooks/use-chat-extras', () => ({
  useVotePoll: () => ({ mutate: extras.votar, isPending: false }),
  useClosePoll: () => ({ mutate: extras.cerrar, isPending: false }),
  useCreatePoll: () => ({ mutate: extras.crear, isPending: false }),
  useCreateReminder: () => ({ mutate: vi.fn(), isPending: false }),
  useTarjetasEnlace: () => ({ tarjetas: [], isLoading: false }),
  useFijados: () => ({ fijados: [], isLoading: false }),
  usePinMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useSendVoiceNote: () => ({ mutate: vi.fn(), isPending: false }),
  useFijadosOrganizacion: () => ({ fijados: extras.fijadosOrg, isLoading: false }),
  usePinMessageOrganizacion: () => ({ mutate: extras.fijarOrg, isPending: false }),
}));
vi.mock('@/hooks/use-chat', () => ({
  useEditMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useToggleSavedMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useAttachmentThumbnail: () => ({ data: undefined }),
  useLinkPreview: () => ({ data: undefined }),
}));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: { idUsuario: 1 } }) }));
const orgEstado = vi.hoisted(() => ({ enviar: vi.fn() }));
vi.mock('@/hooks/use-organizations', () => ({
  useCanalOrganizacion: () => ({
    data: { idConversacion: 5, idOrganizacion: 7, nombre: '#general', archivada: false, miembros: [{}] },
    isLoading: false,
    isError: false,
  }),
  useMensajesOrganizacion: () => ({
    data: [
      { idMensaje: 9, idConversacion: 5, contenido: 'Hola equipo', enviadoEn: '2026-03-01T10:00:00.000Z', fijadoEn: null, remitente: { idUsuario: 2, nombre: 'Beto', apellido: 'Lopez', fotoUrl: null } },
    ],
  }),
  useEnviarMensajeOrganizacion: () => ({ mutate: orgEstado.enviar, isPending: false }),
}));
const getVoiceNoteAudio = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/chat-extras', () => ({ getVoiceNoteAudio }));
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) } }));
vi.mock('@/lib/mensajes', () => ({
  confirmar: vi.fn().mockResolvedValue(true),
  aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() },
}));

import { ChatMessageItem } from '../components/chat-dock/chat-message-item';
import { NuevaEncuestaDialog, validarEncuesta } from '../components/chat-dock/chat-encuesta';
import { NotaVozGrabador } from '../components/chat-dock/chat-nota-voz';
import { ChatFijadosBarra } from '../components/chat-dock/chat-fijados';
import { OrgChat } from '../components/organizations/org-chat';
import type { ChatEncuesta, ChatMensaje } from '../lib/types/chat';

const autor = { idUsuario: 2, nombre: 'Beto', apellido: 'Lopez', fotoUrl: null };
const base: ChatMensaje = {
  idMensaje: 7,
  idConversacion: 5,
  contenido: 'hola',
  enviadoEn: '2026-10-16T10:00:00.000Z',
  remitente: autor,
};

const encuesta = (extra: Partial<ChatEncuesta> = {}): ChatEncuesta => ({
  idEncuesta: 1,
  pregunta: '¿Qué día nos reunimos?',
  multiple: false,
  cierraEn: null,
  cerradaEn: null,
  opciones: [
    { idOpcion: 11, texto: 'Lunes', votos: [{ idUsuario: 1 }, { idUsuario: 2 }] },
    { idOpcion: 12, texto: 'Martes', votos: [{ idUsuario: 3 }] },
  ],
  ...extra,
});

function renderItem(mensaje: Partial<ChatMensaje>, propio: boolean, extra: Record<string, unknown> = {}) {
  render(
    createElement(ChatMessageItem, {
      mensaje: { ...base, ...mensaje },
      propio,
      idProyecto: 10,
      idConversacion: 5,
      idUsuarioActual: 1,
      onResponder: vi.fn(),
      onIrAlOriginal: vi.fn(),
      onReaccionar: vi.fn(),
      ...extra,
    }),
  );
}

async function abrirMenu() {
  const trigger = screen.getByRole('button', { name: 'Acciones del mensaje' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return screen.findByRole('menu');
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('encuestas en la burbuja (MEJ-42)', () => {
  it('muestra la pregunta, los votos y porcentajes, y marca mi voto', () => {
    renderItem({ contenido: '¿Qué día nos reunimos?', encuesta: encuesta() }, false);
    expect(screen.getByText('¿Qué día nos reunimos?')).toBeInTheDocument();
    const lunes = screen.getByRole('button', { name: /Lunes/ });
    expect(lunes).toHaveAttribute('aria-pressed', 'true');
    expect(lunes).toHaveTextContent('2 · 67%');
    expect(screen.getByRole('button', { name: /Martes/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('3 votantes')).toBeInTheDocument();
  });

  it('voto unico: elegir otra opcion la reemplaza; tocar la propia retira el voto', () => {
    renderItem({ encuesta: encuesta() }, false);
    fireEvent.click(screen.getByRole('button', { name: /Martes/ }));
    expect(extras.votar).toHaveBeenCalledWith({ idMensaje: 7, idsOpciones: [12] }, expect.any(Object));
    fireEvent.click(screen.getByRole('button', { name: /Lunes/ }));
    expect(extras.votar).toHaveBeenLastCalledWith({ idMensaje: 7, idsOpciones: [] }, expect.any(Object));
  });

  it('voto multiple: suma y quita opciones sin perder las otras', () => {
    renderItem({ encuesta: encuesta({ multiple: true }) }, false);
    fireEvent.click(screen.getByRole('button', { name: /Martes/ }));
    expect(extras.votar).toHaveBeenLastCalledWith({ idMensaje: 7, idsOpciones: [11, 12] }, expect.any(Object));
    fireEvent.click(screen.getByRole('button', { name: /Lunes/ }));
    expect(extras.votar).toHaveBeenLastCalledWith({ idMensaje: 7, idsOpciones: [] }, expect.any(Object));
  });

  it('cerrada: no se puede votar y se ve la etiqueta; abierta por fecha futura muestra el cierre', () => {
    renderItem({ encuesta: encuesta({ cerradaEn: '2026-11-01T00:00:00.000Z' }) }, false);
    expect(screen.getByText('Cerrada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Martes/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cerrar encuesta' })).toBeNull();
  });

  it('solo el autor o el lider ven «Cerrar encuesta»', () => {
    renderItem({ encuesta: encuesta() }, false);
    expect(screen.queryByRole('button', { name: 'Cerrar encuesta' })).toBeNull();
    cleanup();
    renderItem({ encuesta: encuesta() }, false, { esLider: true });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar encuesta' }));
    expect(extras.cerrar).toHaveBeenCalledWith(7, expect.any(Object));
  });

  it('un mensaje de encuesta no se puede editar', async () => {
    renderItem({ encuesta: encuesta() }, true);
    const menu = await abrirMenu();
    expect(within(menu).queryByRole('menuitem', { name: 'Editar' })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: 'Eliminar' })).toBeInTheDocument();
  });
});

describe('validarEncuesta y dialogo de nueva encuesta', () => {
  const futuro = new Date(Date.now() + 3_600_000).toISOString().slice(0, 16);

  it.each([
    ['', ['a', 'b'], '', 'Escribe la pregunta'],
    ['¿Si?', ['a'], '', 'Agrega al menos 2 opciones'],
    ['¿Si?', ['a', ' '], '', 'Completa o quita las opciones vacías'],
    ['¿Si?', ['Si', 'si'], '', 'Las opciones no se pueden repetir'],
    ['¿Si?', ['a', 'b'], '2020-01-01T00:00', 'El cierre debe ser una fecha futura'],
  ])('rechaza %j %j %j', (pregunta, opciones, cierre, esperado) => {
    expect(validarEncuesta(pregunta, opciones, cierre)).toBe(esperado);
  });

  it('acepta 2 a 6 opciones validas', () => {
    expect(validarEncuesta('¿Si?', ['a', 'b'], futuro)).toBeNull();
    expect(validarEncuesta('¿Si?', ['a', 'b', 'c', 'd', 'e', 'f'], '')).toBeNull();
  });

  function abrirDialogo() {
    render(createElement(NuevaEncuestaDialog, { open: true, onOpenChange: vi.fn(), idProyecto: 10, idConversacion: 5 }));
  }

  it('arranca con 2 opciones, permite agregar hasta 6 y no deja quitar por debajo de 2', () => {
    abrirDialogo();
    expect(screen.queryByRole('button', { name: /Quitar opción/ })).toBeNull();
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Agregar opción' }));
    expect(screen.getAllByRole('textbox', { name: /Opción \d/ })).toHaveLength(6);
    expect(screen.queryByRole('button', { name: 'Agregar opción' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar opción 6' }));
    expect(screen.getAllByRole('textbox', { name: /Opción \d/ })).toHaveLength(5);
  });

  it('con datos invalidos muestra el error y no publica; con datos validos publica la encuesta', () => {
    abrirDialogo();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar encuesta' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe la pregunta');
    expect(extras.crear).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Pregunta'), { target: { value: '  ¿Pizza?  ' } });
    fireEvent.change(screen.getByLabelText('Opción 1'), { target: { value: ' Si ' } });
    fireEvent.change(screen.getByLabelText('Opción 2'), { target: { value: 'No' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar encuesta' }));

    expect(extras.crear).toHaveBeenCalledWith({ pregunta: '¿Pizza?', opciones: ['Si', 'No'], multiple: true }, expect.any(Object));
  });
});

describe('notas de voz: reproductor en la burbuja (MEJ-41)', () => {
  const voz = { idAdjunto: 3, nombreOriginal: 'nota-de-voz.webm', mime: 'audio/webm', tamanoBytes: 2000, duracionSegundos: 75 };

  it('muestra el reproductor con la duracion y no el chip de descarga', () => {
    renderItem({ contenido: '', adjunto: voz }, false);
    expect(screen.getByRole('button', { name: 'Reproducir nota de voz' })).toBeInTheDocument();
    expect(screen.getByText('1:15 / 1:15')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Descargar/ })).toBeNull();
  });

  it('al reproducir baja el audio por el backend y avisa si falla', async () => {
    getVoiceNoteAudio.mockRejectedValue(new Error('x'));
    renderItem({ contenido: '', adjunto: voz }, false);
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir nota de voz' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('No se pudo cargar la nota de voz. Intenta de nuevo.'));
    expect(getVoiceNoteAudio).toHaveBeenCalledWith(10, 5, 3);
  });

  it('un adjunto normal sigue mostrando el chip', () => {
    renderItem({ contenido: '', adjunto: { idAdjunto: 4, nombreOriginal: 'a.pdf', mime: 'application/pdf', tamanoBytes: 100 } }, false);
    expect(screen.getByRole('button', { name: 'Descargar a.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reproducir nota de voz' })).toBeNull();
  });
});

describe('NotaVozGrabador (MEJ-41)', () => {
  class FakeRecorder {
    static instancias: FakeRecorder[] = [];
    static isTypeSupported = () => true;
    state: 'inactive' | 'recording' = 'inactive';
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(public stream: unknown, public opciones: { mimeType: string }) {
      FakeRecorder.instancias.push(this);
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
      this.onstop?.();
    }
  }
  const pista = { stop: vi.fn() };
  const getUserMedia = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecorder.instancias = [];
    pista.stop.mockClear();
    getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [pista] });
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function empezar(onEnviar = vi.fn(), onGrabandoChange = vi.fn()) {
    render(createElement(NotaVozGrabador, { onEnviar, onGrabandoChange }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Grabar nota de voz' }));
    });
    return { onEnviar, onGrabandoChange };
  }

  it('graba, muestra el tiempo y al enviar entrega el audio con su duracion', async () => {
    const { onEnviar, onGrabandoChange } = await empezar();
    expect(onGrabandoChange).toHaveBeenLastCalledWith(true);
    expect(FakeRecorder.instancias[0].opciones.mimeType).toBe('audio/webm;codecs=opus');
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('0:05 / 2:00');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar nota de voz' }));

    expect(onEnviar).toHaveBeenCalledTimes(1);
    const [audio, duracion] = onEnviar.mock.calls[0];
    expect(audio).toBeInstanceOf(Blob);
    expect((audio as Blob).type).toBe('audio/webm');
    expect(duracion).toBe(5);
    expect(pista.stop).toHaveBeenCalled();
    expect(onGrabandoChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Grabar nota de voz' })).toBeInTheDocument();
  });

  it('a los 2 minutos corta y envia sola, con duracion 120', async () => {
    const { onEnviar } = await empezar();
    await act(async () => {
      vi.advanceTimersByTime(121_000);
    });
    expect(onEnviar).toHaveBeenCalledTimes(1);
    expect(onEnviar.mock.calls[0][1]).toBe(120);
  });

  it('descartar no envia nada y apaga el microfono', async () => {
    const { onEnviar } = await empezar();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar grabación' }));
    expect(onEnviar).not.toHaveBeenCalled();
    expect(pista.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Grabar nota de voz' })).toBeInTheDocument();
  });

  it('cerrar la ventana a media grabacion la descarta y apaga el microfono', async () => {
    const onEnviar = vi.fn();
    const { unmount } = render(createElement(NotaVozGrabador, { onEnviar }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Grabar nota de voz' }));
    });
    unmount();
    expect(onEnviar).not.toHaveBeenCalled();
    expect(pista.stop).toHaveBeenCalled();
  });

  it('sin permiso de microfono avisa y no graba', async () => {
    getUserMedia.mockRejectedValue(new Error('denegado'));
    const { onEnviar } = await empezar();
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('micrófono'));
    expect(onEnviar).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Grabar nota de voz' })).toBeInTheDocument();
  });

  it('sin MediaRecorder avisa que el navegador no lo permite', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    await empezar();
    expect(toastError).toHaveBeenCalledWith('Tu navegador no permite grabar notas de voz.');
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe('mensajes fijados (MEJ-43)', () => {
  const fijado = (idMensaje: number, extra: Partial<ChatMensaje> = {}): ChatMensaje => ({ ...base, idMensaje, fijadoEn: '2026-11-01T00:00:00.000Z', ...extra });

  it('no ocupa espacio sin fijados', () => {
    const { container } = render(createElement(ChatFijadosBarra, { fijados: [], onIrA: vi.fn() }));
    expect(container).toBeEmptyDOMElement();
  });

  it('lista los fijados con el contador, salta al mensaje y respeta quien puede desfijar', () => {
    const onIrA = vi.fn();
    const onDesfijar = vi.fn();
    render(
      createElement(ChatFijadosBarra, {
        fijados: [fijado(1, { contenido: 'Reunión el lunes' }), fijado(2, { contenido: '', encuesta: encuesta() })],
        onIrA,
        onDesfijar,
        puedeDesfijar: (m: ChatMensaje) => m.idMensaje === 2,
      }),
    );
    expect(screen.getByText('Fijados (2/3)')).toBeInTheDocument();
    expect(screen.getByText(/Encuesta: ¿Qué día nos reunimos\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reunión el lunes/ }));
    expect(onIrA).toHaveBeenCalledWith(1);
    expect(screen.getAllByRole('button', { name: /Desfijar/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Desfijar/ }));
    expect(onDesfijar).toHaveBeenCalledWith(expect.objectContaining({ idMensaje: 2 }));
  });

  it('menu del mensaje: quien puede fijar ve Fijar/Desfijar; quien no, nada', async () => {
    const onFijar = vi.fn();
    renderItem({}, false, { puedeFijar: true, onFijar });
    let menu = await abrirMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Fijar' }));
    expect(onFijar).toHaveBeenCalledWith(expect.objectContaining({ idMensaje: 7 }), true);
    cleanup();

    renderItem({ fijadoEn: '2026-11-01T00:00:00.000Z' }, true, { puedeFijar: true, onFijar });
    expect(screen.getByText('Fijado')).toBeInTheDocument();
    menu = await abrirMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Desfijar' }));
    expect(onFijar).toHaveBeenLastCalledWith(expect.objectContaining({ idMensaje: 7 }), false);
    cleanup();

    renderItem({}, false, { puedeFijar: false, onFijar });
    expect(screen.queryByRole('button', { name: 'Acciones del mensaje' })).toBeNull();
  });
});

describe('fijados en el chat de la organizacion (MEJ-43)', () => {
  it('Propietario y Administradores ven «Fijar» en los mensajes; el resto no ve el menu', async () => {
    render(createElement(OrgChat, { idOrganizacion: 7, puedeFijar: true }));
    const menu = await abrirMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Fijar' }));
    expect(extras.fijarOrg).toHaveBeenCalledWith({ idMensaje: 9, fijar: true }, expect.any(Object));
    cleanup();

    render(createElement(OrgChat, { idOrganizacion: 7 }));
    expect(screen.getByText('Hola equipo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acciones del mensaje' })).toBeNull();
  });

  it('muestra la barra de fijados a cualquier miembro, pero solo gestores desfijan', () => {
    extras.fijadosOrg = [{ ...base, idMensaje: 9, contenido: 'Hola equipo', fijadoEn: '2026-11-01T00:00:00.000Z' }];
    render(createElement(OrgChat, { idOrganizacion: 7 }));
    expect(screen.getByRole('region', { name: 'Mensajes fijados' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Desfijar/ })).toBeNull();
    cleanup();

    render(createElement(OrgChat, { idOrganizacion: 7, puedeFijar: true }));
    fireEvent.click(screen.getByRole('button', { name: /Desfijar/ }));
    expect(extras.fijarOrg).toHaveBeenCalledWith({ idMensaje: 9, fijar: false }, expect.any(Object));
    extras.fijadosOrg = [];
  });
});
