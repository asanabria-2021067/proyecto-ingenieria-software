import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';

vi.mock('../lib/services/notifications', () => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreference: vi.fn(),
}));

import { getNotificationPreferences } from '../lib/services/notifications';
import { TIPOS_BACKEND, diferida, fallo, preferencias, renderSeccion } from './helpers/notification-preferences';

/** FG04 (T-328). Sección «Notificaciones» del perfil sobre un servicio simulado. */

const seccion = () => screen.getByRole('region', { name: 'Notificaciones' });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FG04-C01: sección de notificaciones en el perfil', () => {
  it('es una región con su título, montada en el perfil que comparten estudiantes y administradores', () => {
    vi.mocked(getNotificationPreferences).mockReturnValue(diferida<never>().promesa);
    renderSeccion();
    expect(within(seccion()).getByRole('heading', { level: 2, name: 'Notificaciones' })).toBeInTheDocument();

    const pagina = readFileSync(join(__dirname, '../app/dashboard/perfil/page.tsx'), 'utf8');
    expect(pagina).toContain("from '@/components/profile/notification-preferences-section'");
    expect(pagina.match(/<NotificationPreferencesSection \/>/g)).toHaveLength(1);
    // El perfil conserva sus secciones: la de notificaciones se añade al final.
    for (const existente of ['Editar perfil', 'Experiencias previas', 'Sin cualidades registradas']) {
      expect(pagina).toContain(existente);
    }
    expect(readFileSync(join(__dirname, '../app/dashboard/layout.tsx'), 'utf8')).toContain("'/dashboard/perfil'");
  });

  it('mientras carga muestra un esqueleto anunciado, sin lista ni error', () => {
    vi.mocked(getNotificationPreferences).mockReturnValue(diferida<never>().promesa);
    renderSeccion();
    expect(screen.getByRole('status', { name: 'Cargando preferencias de notificación' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lista todos los tipos que entrega el contrato, una vez cada uno, agrupados por tema', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue(preferencias());
    renderSeccion();

    const grupos = await within(seccion()).findAllByRole('heading', { level: 3 });
    expect(grupos.map((h) => h.textContent)).toEqual([
      'Tareas e hitos',
      'Postulaciones y equipo',
      'Proyectos',
      'Horas y reconocimiento',
      'Recordatorios y calendario',
      'Red de contactos',
      'Cuenta y seguridad',
    ]);
    expect(within(seccion()).getAllByRole('listitem')).toHaveLength(TIPOS_BACKEND.length);
    expect(TIPOS_BACKEND.length).toBeGreaterThanOrEqual(41);
  });

  it('cada grupo es una región nombrada por su encabezado y cada tipo lleva nombre y descripción legibles', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue(preferencias());
    renderSeccion();
    const tareas = await screen.findByRole('region', { name: 'Tareas e hitos' });
    const primero = within(tareas).getAllByRole('listitem')[0];
    expect(primero).toHaveTextContent('Tarea asignada');
    expect(primero).toHaveTextContent('Te asignan una tarea.');
    expect(seccion().textContent).not.toMatch(/[A-Z]{3,}_[A-Z]/);
  });

  it('sin tipos en la respuesta lo dice, sin inventar una lista', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue([]);
    renderSeccion();
    expect(await screen.findByText('No hay tipos de notificación para configurar.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([403, 500, undefined])('un fallo %s al cargar se anuncia y permite reintentar', async (statusCode) => {
    vi.mocked(getNotificationPreferences).mockRejectedValueOnce(fallo(statusCode)).mockResolvedValueOnce(preferencias());
    renderSeccion();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No se pudieron cargar tus preferencias de notificación.');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('No hay tipos de notificación para configurar.')).not.toBeInTheDocument();

    fireEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(await within(seccion()).findAllByRole('listitem')).toHaveLength(TIPOS_BACKEND.length);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('FG04-C02: un interruptor por cada tipo real', () => {
  const interruptores = () => within(seccion()).getAllByRole('switch');

  it('hay exactamente un interruptor por tipo del contrato, enlazado a ese tipo', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue(preferencias());
    renderSeccion();
    await within(seccion()).findAllByRole('listitem');
    expect(interruptores().map((el) => el.getAttribute('data-tipo')).sort()).toEqual([...TIPOS_BACKEND].sort());
    expect(new Set(interruptores().map((el) => el.id)).size).toBe(TIPOS_BACKEND.length);
  });

  it('sin filas guardadas el backend informa todo activo, y así se muestra', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue(preferencias());
    renderSeccion();
    await within(seccion()).findAllByRole('listitem');
    expect(interruptores().every((el) => el.getAttribute('aria-checked') === 'true')).toBe(true);
  });

  it('cada interruptor refleja el estado de SU tipo', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue(preferencias(['TAREA_ASIGNADA', 'RECORDATORIO_EVENTO']));
    renderSeccion();
    expect(await screen.findByRole('switch', { name: 'Tarea asignada' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Recordatorio de evento' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Tarea actualizada' })).toHaveAttribute('aria-checked', 'true');
    expect(interruptores().filter((el) => el.getAttribute('aria-checked') === 'false')).toHaveLength(2);
  });

  it('el nombre accesible es la etiqueta del tipo y la descripción queda asociada', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue(preferencias());
    renderSeccion();
    const control = await screen.findByRole('switch', { name: 'Tarea asignada' });
    expect(control).toHaveAttribute('data-tipo', 'TAREA_ASIGNADA');
    expect(control).toHaveAccessibleDescription('Te asignan una tarea.');
  });

  it('no existen interruptores de grupo ni un «activar todo»', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue(preferencias());
    renderSeccion();
    await within(seccion()).findAllByRole('listitem');
    expect(interruptores()).toHaveLength(TIPOS_BACKEND.length);
    for (const grupo of ['Tareas e hitos', 'Proyectos', 'Cuenta y seguridad']) {
      expect(screen.queryByRole('switch', { name: grupo })).not.toBeInTheDocument();
    }
    expect(within(seccion()).queryByRole('button', { name: /todas|todo/i })).not.toBeInTheDocument();
    expect(within(seccion()).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('no hay interruptor de chat: se explica que sus mensajes no son notificaciones', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue(preferencias());
    renderSeccion();
    await within(seccion()).findAllByRole('listitem');
    expect(screen.queryByRole('switch', { name: /chat/i })).not.toBeInTheDocument();
    expect(
      within(seccion()).getByText('Los mensajes de chat no se configuran aquí: llegan siempre por el chat y no generan notificaciones.'),
    ).toBeInTheDocument();
  });

  it('un tipo que el backend añada después obtiene su interruptor en «Otras notificaciones»', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue([...preferencias(), { tipo: 'TIPO_FUTURO', activa: false }]);
    renderSeccion();
    const otras = await screen.findByRole('region', { name: 'Otras notificaciones' });
    const control = within(otras).getByRole('switch', { name: 'Tipo futuro' });
    expect(control).toHaveAttribute('data-tipo', 'TIPO_FUTURO');
    expect(control).toHaveAttribute('aria-checked', 'false');
    expect(interruptores()).toHaveLength(TIPOS_BACKEND.length + 1);
  });

  it('solo se muestran interruptores de tipos presentes en la respuesta', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue(preferencias([], ['RECORDATORIO_EVENTO', 'TAREA_ASIGNADA']));
    renderSeccion();
    await within(seccion()).findAllByRole('listitem');
    expect(interruptores().map((el) => el.getAttribute('data-tipo'))).toEqual(['TAREA_ASIGNADA', 'RECORDATORIO_EVENTO']);
  });

  it('ningún tipo se trata como obligatorio: todos comparten el mismo estado de disponibilidad', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue(preferencias());
    renderSeccion();
    await within(seccion()).findAllByRole('listitem');
    const disponibilidad = new Set(interruptores().map((el) => (el as HTMLButtonElement).disabled));
    expect(disponibilidad.size).toBe(1);
    expect(seccion().textContent).not.toMatch(/obligatori/i);
  });
});
