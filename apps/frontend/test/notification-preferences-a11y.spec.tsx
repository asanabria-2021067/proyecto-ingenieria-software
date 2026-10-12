import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

vi.mock('../lib/services/notifications', () => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreference: vi.fn(),
}));

import type { NotificationPreference } from '../lib/notifications/preference-groups';
import { getNotificationPreferences, updateNotificationPreference } from '../lib/services/notifications';
import { diferida, fallo, preferencias, renderSeccion } from './helpers/notification-preferences';

/**
 * FG04-C04 (T-328). Accesibilidad y estados de la sección de notificaciones,
 * sobre el DOM. El contraste real, el foco visible y el ajuste a 375, 768 y
 * 1440 px en ambos temas se miden en un navegador en FG05.
 */

const FUENTE = readFileSync(join(__dirname, '../components/profile/notification-preferences-section.tsx'), 'utf8');
const seccion = () => screen.getByRole('region', { name: 'Notificaciones' });
const tarea = () => screen.getByRole('switch', { name: 'Tarea asignada' });
const aviso = () => within(seccion()).getAllByRole('status').find((el) => el.getAttribute('aria-live') === 'polite') as HTMLElement;

async function montar(inactivos: string[] = []) {
  vi.mocked(getNotificationPreferences).mockResolvedValue(preferencias(inactivos));
  renderSeccion();
  await screen.findByRole('switch', { name: 'Tarea asignada' });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FG04-C04: nombres, roles y asociaciones', () => {
  it('cada interruptor es un `switch` con nombre propio y único, tomado de su etiqueta visible', async () => {
    await montar();
    const controles = within(seccion()).getAllByRole('switch');
    const nombres = controles.map((control) => (document.querySelector(`label[for="${control.id}"]`) as HTMLElement).textContent);
    expect(nombres.every((nombre) => nombre && nombre.trim().length > 3)).toBe(true);
    expect(new Set(nombres).size).toBe(controles.length);
    for (const control of controles) expect(control).toHaveAccessibleName();
  });

  it('pulsar la etiqueta acciona su interruptor', async () => {
    vi.mocked(updateNotificationPreference).mockResolvedValue(preferencias(['TAREA_ASIGNADA']));
    await montar();
    fireEvent.click(screen.getByText('Tarea asignada', { selector: 'label' }));
    await waitFor(() => expect(updateNotificationPreference).toHaveBeenCalledWith('TAREA_ASIGNADA', false));
  });

  it('la jerarquía de encabezados no salta niveles: h2 de la sección y h3 por grupo', async () => {
    await montar();
    expect(within(seccion()).getAllByRole('heading').map((h) => h.tagName)).toEqual(['H2', ...Array(7).fill('H3')]);
  });

  it('cada grupo es una lista: los lectores anuncian cuántos tipos tiene', async () => {
    await montar();
    const tareas = screen.getByRole('region', { name: 'Tareas e hitos' });
    expect(within(tareas).getByRole('list').children).toHaveLength(within(tareas).getAllByRole('switch').length);
  });
});

describe('FG04-C04: teclado y foco', () => {
  it('Espacio y Enter accionan el interruptor enfocado', async () => {
    vi.mocked(updateNotificationPreference).mockResolvedValue(preferencias(['TAREA_ASIGNADA']));
    await montar();
    tarea().focus();
    expect(tarea()).toHaveFocus();
    expect(tarea().tagName).toBe('BUTTON');
    expect(tarea()).toHaveAttribute('type', 'button');
    // Un <button> nativo dispara `click` con Espacio y con Enter.
    fireEvent.click(tarea());
    await waitFor(() => expect(updateNotificationPreference).toHaveBeenCalledTimes(1));
  });

  it('mientras guarda y después, el foco se queda en el interruptor', async () => {
    const pendiente = diferida<NotificationPreference[]>();
    vi.mocked(updateNotificationPreference).mockReturnValue(pendiente.promesa);
    await montar();
    tarea().focus();
    fireEvent.click(tarea());

    await waitFor(() => expect(tarea()).toHaveAttribute('aria-busy', 'true'));
    expect(tarea()).toHaveAttribute('aria-disabled', 'true');
    // `disabled` sacaría el control del orden de tabulación y soltaría el foco.
    expect(tarea()).not.toBeDisabled();
    expect(tarea()).toHaveFocus();

    pendiente.resolver(preferencias(['TAREA_ASIGNADA']));
    await waitFor(() => expect(tarea()).not.toHaveAttribute('aria-busy'));
    expect(tarea()).not.toHaveAttribute('aria-disabled');
    expect(tarea()).toHaveFocus();
  });

  it('tras un fallo el foco tampoco se pierde', async () => {
    vi.mocked(updateNotificationPreference).mockRejectedValue(fallo(500));
    await montar();
    tarea().focus();
    fireEvent.click(tarea());
    await screen.findByRole('alert');
    expect(tarea()).toHaveFocus();
  });

  it('todos los interruptores están en el orden natural de tabulación', async () => {
    await montar();
    for (const control of within(seccion()).getAllByRole('switch')) {
      expect(control.tabIndex).toBe(0);
    }
    expect(seccion().querySelectorAll('[tabindex]:not([tabindex="0"])')).toHaveLength(0);
  });

  it('el interruptor conserva el anillo de foco del sistema y la sección no anula contornos', () => {
    expect(readFileSync(join(__dirname, '../components/ui/switch.tsx'), 'utf8')).toContain('focus-visible:ring-[3px]');
    expect(FUENTE).not.toMatch(/outline-none|focus:outline-0|focus-visible:ring-0/);
  });
});

describe('FG04-C04: anuncios de guardado y error', () => {
  it('la región viva empieza vacía y anuncia cada guardado con el nombre del tipo y su estado', async () => {
    vi.mocked(updateNotificationPreference)
      .mockResolvedValueOnce(preferencias(['TAREA_ASIGNADA']))
      .mockResolvedValueOnce(preferencias());
    await montar();
    expect(aviso()).toHaveTextContent('');
    expect(aviso()).toHaveClass('sr-only');

    fireEvent.click(tarea());
    await waitFor(() => expect(aviso()).toHaveTextContent('Guardado: «Tarea asignada» desactivada.'));
    fireEvent.click(tarea());
    await waitFor(() => expect(aviso()).toHaveTextContent('Guardado: «Tarea asignada» activada.'));
  });

  it('un fallo se anuncia y queda descrito en su interruptor, marcado como inválido', async () => {
    vi.mocked(updateNotificationPreference).mockRejectedValue(fallo(429));
    await montar();
    fireEvent.click(tarea());

    const error = await screen.findByRole('alert');
    expect(aviso()).toHaveTextContent('No se guardó el cambio de «Tarea asignada».');
    expect(tarea()).toHaveAttribute('aria-invalid', 'true');
    expect(tarea().getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    expect(tarea()).toHaveAccessibleDescription(
      'Te asignan una tarea. Demasiados cambios seguidos. Espera unos segundos y vuelve a intentarlo.',
    );
    // Los demás interruptores no heredan el error.
    expect(screen.getByRole('switch', { name: 'Tarea actualizada' })).not.toHaveAttribute('aria-invalid');
  });

  it('al guardar bien después de un fallo, el interruptor deja de estar marcado como inválido', async () => {
    vi.mocked(updateNotificationPreference).mockRejectedValueOnce(fallo(500)).mockResolvedValueOnce(preferencias(['TAREA_ASIGNADA']));
    await montar();
    fireEvent.click(tarea());
    await screen.findByRole('alert');
    fireEvent.click(tarea());
    await waitFor(() => expect(tarea()).toHaveAttribute('aria-checked', 'false'));
    expect(tarea()).not.toHaveAttribute('aria-invalid');
    expect(tarea()).toHaveAccessibleDescription('Te asignan una tarea.');
  });

  it('«Guardando…» es solo visual: el estado ocupado ya lo expone `aria-busy`', async () => {
    vi.mocked(updateNotificationPreference).mockReturnValue(diferida<NotificationPreference[]>().promesa);
    await montar();
    fireEvent.click(tarea());
    expect(await screen.findByText('Guardando…')).toHaveAttribute('aria-hidden', 'true');
  });

  it('el estado no depende solo del color: `aria-checked` y la posición del interruptor lo expresan', async () => {
    await montar(['TAREA_ASIGNADA']);
    expect(tarea()).toHaveAttribute('aria-checked', 'false');
    expect(tarea()).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByRole('switch', { name: 'Tarea actualizada' })).toHaveAttribute('data-state', 'checked');
  });
});

describe('FG04-C04: responsive, truncamiento y tema', () => {
  it('los grupos van en una columna y pasan a dos en pantallas anchas', async () => {
    await montar();
    const rejilla = screen.getByRole('region', { name: 'Tareas e hitos' }).parentElement as HTMLElement;
    expect(rejilla).toHaveClass('grid', 'lg:grid-cols-2');
    expect(rejilla.className).not.toMatch(/(^|\s)grid-cols-[2-9]/);
  });

  it('los textos largos se parten y el interruptor nunca se encoge ni sale de su fila', async () => {
    await montar();
    const fila = tarea().parentElement as HTMLElement;
    expect(fila).toHaveClass('flex', 'items-start', 'justify-between');
    expect(fila.firstElementChild).toHaveClass('min-w-0');
    expect(screen.getByText('Tarea asignada', { selector: 'label' })).toHaveClass('break-words');
    expect(tarea()).toHaveClass('shrink-0');
    expect(screen.getByRole('region', { name: 'Tareas e hitos' })).toHaveClass('min-w-0');
  });

  it('la sección usa tokens del sistema: sin colores fijos, estilos en línea ni variantes `dark:` propias', () => {
    expect(FUENTE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(FUENTE).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch)\(/);
    expect(FUENTE).not.toMatch(/\b(text|bg|border|ring)-(red|green|blue|amber|yellow|gray|slate|zinc|neutral|white|black)(-\d{2,3})?\b/);
    expect(FUENTE).not.toMatch(/style=\{|\bdark:/);
  });

  it('el perfil conserva sus secciones y la de notificaciones no altera su estructura', () => {
    const pagina = readFileSync(join(__dirname, '../app/dashboard/perfil/page.tsx'), 'utf8');
    expect(pagina.indexOf('<NotificationPreferencesSection />')).toBeGreaterThan(pagina.indexOf('Experiencias previas'));
    expect(pagina.match(/<section /g)?.length).toBeGreaterThanOrEqual(5);
  });
});
