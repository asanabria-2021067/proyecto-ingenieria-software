import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/services/chat-extras', () => ({
  resolveCards: vi.fn(),
  createReminder: vi.fn(),
}));

import { createReminder, resolveCards } from '@/lib/services/chat-extras';
import { ChatContenido } from '../components/chat-dock/chat-menciones';
import { ChatTarjetasEnlace } from '../components/chat-dock/chat-tarjeta-enlace';
import { RecordatorioDialog } from '../components/chat-dock/chat-recordatorio';
import { extraerEnlacesInternos, etiquetaEstado } from '../lib/chat-tarjetas';
import { errorFechaRecordatorio, esComandoRecordarme, mananaOchoAm, opcionesRecordatorio } from '../lib/chat-recordatorio';
import { getNotificationLink } from '../lib/services/notifications';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const conCliente = (ui: React.ReactElement) =>
  createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, ui);

const ORIGEN = 'http://localhost:3000';

describe('ChatContenido (MEJ-44)', () => {
  const participantes = [{ idUsuario: 2, nombre: 'Luis', apellido: 'Gomez', fotoUrl: null }];

  it('resalta la mencion con el nombre vigente del participante, no la etiqueta guardada', () => {
    render(createElement(ChatContenido, { contenido: 'hola @[Viejo Nombre](2) ok', participantes }));
    expect(screen.getByText('@Luis Gomez')).toHaveAttribute('data-mention-id', '2');
    expect(screen.queryByText(/Viejo Nombre/)).not.toBeInTheDocument();
  });

  it('marca distinta la mencion a mi usuario', () => {
    render(createElement(ChatContenido, { contenido: '@[Luis](2)', participantes, idUsuarioActual: 2 }));
    expect(screen.getByText('@Luis Gomez')).toHaveAttribute('title', 'Te mencionaron');
  });

  it('un token HTML se muestra como texto, nunca como marcado', () => {
    const { container } = render(createElement(ChatContenido, { contenido: '<img src=x onerror=alert(1)>' }));
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('extraerEnlacesInternos (MEJ-45)', () => {
  it('toma URLs del mismo origen y rutas sueltas, sin repetir', () => {
    const r = extraerEnlacesInternos(
      `mira ${ORIGEN}/dashboard/projects/3/kanban/tasks/9?section=comments. y /dashboard/proyectos/3 y ${ORIGEN}/dashboard/projects/3/kanban/tasks/9`,
      ORIGEN,
    );
    expect(r.map((e) => e.ruta)).toEqual(['/dashboard/projects/3/kanban/tasks/9', '/dashboard/proyectos/3']);
    expect(r[0].href).toBe('/dashboard/projects/3/kanban/tasks/9?section=comments');
  });

  it('ignora otros origenes, rutas ajenas y ids invalidos', () => {
    expect(extraerEnlacesInternos('https://evil.test/dashboard/proyectos/3 /dashboard/mensajes/2 /dashboard/proyectos/0', ORIGEN)).toEqual([]);
  });

  it('limita a 3 tarjetas', () => {
    const texto = [1, 2, 3, 4, 5].map((i) => `/dashboard/proyectos/${i}`).join(' ');
    expect(extraerEnlacesInternos(texto, ORIGEN)).toHaveLength(3);
  });

  it('etiquetaEstado legible', () => {
    expect(etiquetaEstado('EN_PROGRESO')).toBe('En progreso');
  });
});

describe('ChatTarjetasEnlace (MEJ-45)', () => {
  it('muestra la tarjeta con permiso y un bloqueo sin datos cuando no hay acceso', async () => {
    vi.mocked(resolveCards).mockResolvedValue([
      { ruta: '/dashboard/projects/3/kanban/tasks/9', tipo: 'TAREA', accesible: true, titulo: 'Disenar logo', estado: 'EN_PROGRESO', proyecto: 'Feria' },
      { ruta: '/dashboard/proyectos/8', tipo: 'PROYECTO', accesible: false },
    ]);
    render(
      conCliente(
        createElement(ChatTarjetasEnlace, {
          idProyecto: 3,
          idConversacion: 5,
          contenido: '/dashboard/projects/3/kanban/tasks/9 /dashboard/proyectos/8',
        }),
      ),
    );
    const tarjeta = await screen.findByTestId('tarjeta-enlace');
    expect(tarjeta).toHaveAttribute('href', '/dashboard/projects/3/kanban/tasks/9');
    expect(tarjeta).toHaveTextContent('Disenar logo');
    expect(tarjeta).toHaveTextContent('En progreso');
    expect(screen.getByTestId('tarjeta-enlace-bloqueada')).toHaveTextContent('no disponible');
    expect(resolveCards).toHaveBeenCalledWith(3, 5, ['/dashboard/projects/3/kanban/tasks/9', '/dashboard/proyectos/8']);
  });

  it('un mensaje sin enlaces internos no consulta nada', () => {
    render(conCliente(createElement(ChatTarjetasEnlace, { idProyecto: 3, idConversacion: 5, contenido: 'hola https://example.com' })));
    expect(resolveCards).not.toHaveBeenCalled();
  });
});

describe('Recuérdamelo (MEJ-46)', () => {
  const AHORA = new Date(2026, 10, 20, 15, 30, 0);

  it('ofrece 1 h, 3 h y mañana a las 8:00 locales', () => {
    const o = opcionesRecordatorio(AHORA);
    expect(o.map((x) => x.id)).toEqual(['1h', '3h', 'manana']);
    expect(o[0].fecha.getTime() - AHORA.getTime()).toBe(3_600_000);
    expect(o[1].fecha.getTime() - AHORA.getTime()).toBe(3 * 3_600_000);
    const m = mananaOchoAm(AHORA);
    expect([m.getDate(), m.getHours(), m.getMinutes()]).toEqual([21, 8, 0]);
  });

  it('valida los mismos limites que el backend', () => {
    expect(errorFechaRecordatorio(null, AHORA)).toMatch(/Elige/);
    expect(errorFechaRecordatorio(new Date(AHORA.getTime() + 59_999), AHORA)).toMatch(/1 minuto/);
    expect(errorFechaRecordatorio(new Date(AHORA.getTime() + 60_000), AHORA)).toBeNull();
    expect(errorFechaRecordatorio(new Date(AHORA.getTime() + 90 * 24 * 3_600_000), AHORA)).toBeNull();
    expect(errorFechaRecordatorio(new Date(AHORA.getTime() + 90 * 24 * 3_600_000 + 1), AHORA)).toMatch(/90 días/);
  });

  it('reconoce el comando con y sin tilde, solo y sin otro texto', () => {
    for (const t of ['/recuerdamelo', '/recuérdamelo', ' /Recuérdamelo ']) expect(esComandoRecordarme(t)).toBe(true);
    for (const t of ['/recuerdamelo ya', 'hola /recuerdamelo', '/otro']) expect(esComandoRecordarme(t)).toBe(false);
  });

  it('el dialogo crea el recordatorio del mensaje con la opcion elegida', async () => {
    vi.mocked(createReminder).mockResolvedValue({ idRecordatorio: 1, recordarEn: '' });
    const onOpenChange = vi.fn();
    const mensaje = {
      idMensaje: 7,
      idConversacion: 5,
      contenido: 'entrega el viernes',
      enviadoEn: new Date().toISOString(),
      remitente: { idUsuario: 2, nombre: 'Luis', apellido: 'Gomez', fotoUrl: null },
    };
    render(conCliente(createElement(RecordatorioDialog, { open: true, onOpenChange, idProyecto: 3, idConversacion: 5, mensaje })));

    fireEvent.click(screen.getByRole('button', { name: /En 1 hora/ }));

    await waitFor(() => expect(createReminder).toHaveBeenCalledTimes(1));
    const [proyecto, conversacion, idMensaje, iso] = vi.mocked(createReminder).mock.calls[0];
    expect([proyecto, conversacion, idMensaje]).toEqual([3, 5, 7]);
    expect(new Date(iso).getTime() - Date.now()).toBeGreaterThan(3_500_000);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('con fecha personalizada invalida muestra el error y no llama al servicio', () => {
    const mensaje = {
      idMensaje: 7,
      idConversacion: 5,
      contenido: 'x',
      enviadoEn: new Date().toISOString(),
      remitente: { idUsuario: 2, nombre: 'Luis', apellido: 'Gomez', fotoUrl: null },
    };
    render(conCliente(createElement(RecordatorioDialog, { open: true, onOpenChange: vi.fn(), idProyecto: 3, idConversacion: 5, mensaje })));
    fireEvent.click(screen.getByRole('button', { name: /Elegir fecha y hora/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear recordatorio' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Elige una fecha y hora.');
    expect(createReminder).not.toHaveBeenCalled();
  });
});

describe('enlace de las notificaciones de chat', () => {
  it('menciones y recordatorios abren la conversacion en el mensaje', () => {
    for (const tipo of ['MENCION_CHAT', 'RECORDATORIO_MENSAJE']) {
      expect(getNotificationLink({ tipoNotificacion: tipo, datosJson: { idConversacion: 5, idMensaje: 9 } })).toBe('/dashboard/mensajes/5?mensaje=9');
    }
    expect(getNotificationLink({ tipoNotificacion: 'MENCION_CHAT', datosJson: { idConversacion: 5 } })).toBe('/dashboard/mensajes/5');
    expect(getNotificationLink({ tipoNotificacion: 'MENCION_CHAT', datosJson: { idConversacion: '../x' } })).toBeNull();
  });
});
