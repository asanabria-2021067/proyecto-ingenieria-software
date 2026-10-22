import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const ruta = vi.hoisted(() => ({ actual: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => ruta.actual }));
vi.mock('../lib/services/notifications', () => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreference: vi.fn(),
}));
vi.mock('../hooks/use-notifications', () => ({
  useNotificaciones: vi.fn(),
  useConteoNoLeidas: vi.fn(),
  useMarcarLeida: () => ({ mutate: vi.fn(), isPending: false }),
  useMarcarTodasLeidas: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { getNotificationPreferences, updateNotificationPreference } from '../lib/services/notifications';
import { useConteoNoLeidas, useNotificaciones } from '../hooks/use-notifications';
import { UserMenu } from '../components/dashboard/UserMenu';
import { NotificationsBell } from '../components/layout/notifications-bell';
import { diferida, preferencias, renderSeccion } from './helpers/notification-preferences';
import type { NotificationPreference } from '../lib/notifications/preference-groups';

/**
 * Cuenta: un solo menú (Mi perfil, Configuración, Cerrar sesión), la vista
 * Configuración con las preferencias en acordeones y la campana aparte.
 */

const fuente = (relativa: string) => readFileSync(join(__dirname, '..', relativa), 'utf8');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  ruta.actual = '/dashboard';
});

const FAMILIAS = [
  // HU-200: + MENCION_COMENTARIO.
  ['Tareas e hitos', 8],
  ['Postulaciones y equipo', 7],
  ['Proyectos', 17],
  ['Horas y reconocimiento', 5],
  ['Recordatorios y calendario', 2],
  ['Red de contactos', 3],
  ['Cuenta y seguridad', 5],
] as const;

const familia = (titulo: string) => screen.getByRole('button', { name: new RegExp(`^${titulo}`) });

describe('Configuración: preferencias en acordeones por familia', () => {
  async function montarCerrada(inactivos: string[] = []) {
    vi.mocked(getNotificationPreferences).mockResolvedValue(preferencias(inactivos));
    renderSeccion([]);
    await screen.findByRole('button', { name: /^Tareas e hitos/ });
  }

  it('muestra las siete familias cerradas, con su descripción y su contador', async () => {
    await montarCerrada(['TAREA_ASIGNADA', 'NUEVO_SEGUIDOR']);
    for (const [titulo, total] of FAMILIAS) {
      const activas = titulo === 'Tareas e hitos' || titulo === 'Red de contactos' ? total - 1 : total;
      expect(familia(titulo)).toHaveAttribute('aria-expanded', 'false');
      expect(familia(titulo)).toHaveTextContent(`${activas} de ${total} activas`);
    }
    expect(familia('Tareas e hitos')).toHaveTextContent('Asignaciones, cambios y comentarios en tu trabajo.');
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });

  it('las siete familias reúnen todas las preferencias del backend, sin perder ni repetir ninguna', async () => {
    await montarCerrada();
    const total = FAMILIAS.reduce((suma, [, n]) => suma + n, 0);
    expect(total).toBe(preferencias().length);
    for (const [titulo] of FAMILIAS) fireEvent.click(familia(titulo));
    const tipos = screen.getAllByRole('switch').map((control) => control.getAttribute('data-tipo'));
    expect(tipos).toHaveLength(total);
    expect(new Set(tipos)).toEqual(new Set(preferencias().map((p) => p.tipo)));
  });

  it('una familia se abre y se cierra con clic, y varias pueden estar abiertas a la vez', async () => {
    await montarCerrada();
    fireEvent.click(familia('Red de contactos'));
    fireEvent.click(familia('Horas y reconocimiento'));
    expect(familia('Red de contactos')).toHaveAttribute('aria-expanded', 'true');
    expect(familia('Horas y reconocimiento')).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('region', { name: 'Red de contactos' })).getAllByRole('switch')).toHaveLength(3);

    fireEvent.click(familia('Red de contactos'));
    expect(familia('Red de contactos')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('switch')).toHaveLength(5);
  });

  it('el disparador es un botón dentro de un encabezado: se alcanza y se acciona con teclado', async () => {
    await montarCerrada();
    const boton = familia('Cuenta y seguridad');
    expect(boton.tagName).toBe('BUTTON');
    expect(boton.closest('h3')).not.toBeNull();
    expect(boton).not.toHaveAttribute('tabindex', '-1');
    boton.focus();
    expect(boton).toHaveFocus();
    // Un <button> nativo convierte Enter y Espacio en clic; aquí se comprueba el efecto del clic.
    fireEvent.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    expect(boton).toHaveFocus();
  });

  it('abrir y cerrar familias no guarda ni vuelve a pedir nada', async () => {
    await montarCerrada();
    for (const [titulo] of FAMILIAS) fireEvent.click(familia(titulo));
    for (const [titulo] of FAMILIAS) fireEvent.click(familia(titulo));
    expect(updateNotificationPreference).not.toHaveBeenCalled();
    expect(getNotificationPreferences).toHaveBeenCalledTimes(1);
  });

  it('el contador cambia solo cuando el servidor confirma, y la familia sigue abierta', async () => {
    await montarCerrada();
    fireEvent.click(familia('Red de contactos'));
    const guardado = diferida<NotificationPreference[]>();
    vi.mocked(updateNotificationPreference).mockReturnValue(guardado.promesa);

    fireEvent.click(screen.getByRole('switch', { name: 'Nuevo seguidor' }));
    expect(updateNotificationPreference).toHaveBeenCalledWith('NUEVO_SEGUIDOR', false);
    expect(familia('Red de contactos')).toHaveTextContent('3 de 3 activas');

    guardado.resolver(preferencias(['NUEVO_SEGUIDOR']));
    await waitFor(() => expect(familia('Red de contactos')).toHaveTextContent('2 de 3 activas'));
    expect(familia('Red de contactos')).toHaveAttribute('aria-expanded', 'true');
    expect(familia('Tareas e hitos')).toHaveTextContent('8 de 8 activas');
  });

  it('si el guardado falla, el contador no se mueve', async () => {
    await montarCerrada();
    fireEvent.click(familia('Red de contactos'));
    vi.mocked(updateNotificationPreference).mockRejectedValue(Object.assign(new Error('falló'), { statusCode: 500 }));
    fireEvent.click(screen.getByRole('switch', { name: 'Nuevo seguidor' }));
    await screen.findByRole('alert');
    expect(familia('Red de contactos')).toHaveTextContent('3 de 3 activas');
  });

  it('la vista solo contiene las preferencias de notificación', () => {
    const pagina = fuente('app/dashboard/configuracion/page.tsx');
    expect(pagina).toContain('<h1 className="type-display">Configuración</h1>');
    expect(pagina).toContain('Administra qué notificaciones deseas recibir en UVGenius.');
    expect(pagina).not.toMatch(/Próximamente|Apariencia|Contraseña|Sesiones|Privacidad|<Tabs/i);
  });
});

describe('Menú de cuenta', () => {
  const user = { nombre: 'Valentina', apellido: 'Hernández', correo: 'valentina.hernandez@uvg.edu.gt' };

  async function abrir(variant: 'sidebar' | 'compact' = 'sidebar') {
    render(<UserMenu user={user} onLogout={vi.fn()} variant={variant} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    await screen.findByRole('menuitem', { name: 'Cerrar sesión' });
  }

  it('ofrece Mi perfil, Configuración y Cerrar sesión, en ese orden, en ambas variantes', async () => {
    for (const variant of ['sidebar', 'compact'] as const) {
      await abrir(variant);
      expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Mi perfil', 'Configuración', 'Cerrar sesión']);
      expect(screen.getByRole('menuitem', { name: 'Mi perfil' })).toHaveAttribute('href', '/dashboard/perfil');
      expect(screen.getByRole('menuitem', { name: 'Configuración' })).toHaveAttribute('href', '/dashboard/configuracion');
      cleanup();
    }
  });

  it('se abre hacia arriba y Cerrar sesión conserva el estilo destructivo', async () => {
    await abrir();
    expect(screen.getByRole('menu')).toHaveAttribute('data-side', 'top');
    expect(screen.getByRole('menuitem', { name: 'Cerrar sesión' })).toHaveAttribute('data-variant', 'destructive');
  });

  it.each([
    ['/dashboard/perfil', 'Mi perfil'],
    ['/dashboard/perfil/editar', 'Mi perfil'],
    ['/dashboard/configuracion', 'Configuración'],
  ])('en %s marca «%s» como la vista actual', async (pathname, actual) => {
    ruta.actual = pathname;
    await abrir();
    for (const item of ['Mi perfil', 'Configuración']) {
      const enlace = screen.getByRole('menuitem', { name: item });
      if (item === actual) expect(enlace).toHaveAttribute('aria-current', 'page');
      else expect(enlace).not.toHaveAttribute('aria-current');
    }
  });

  it('fuera de esas vistas no marca ninguna', async () => {
    ruta.actual = '/dashboard/mis-tareas';
    await abrir();
    expect(document.querySelector('[role="menuitem"][aria-current]')).toBeNull();
  });

  it('Escape cierra el menú', async () => {
    await abrir();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('cerrar sesión llama al flujo existente una sola vez', async () => {
    const onLogout = vi.fn();
    render(<UserMenu user={user} onLogout={onLogout} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cerrar sesión' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('un nombre y un correo largos se truncan en el bloque de la barra lateral', () => {
    render(
      <UserMenu
        user={{ nombre: 'María Fernanda Alejandra', apellido: 'Rodríguez de la Cruz Castellanos', correo: 'maria.fernanda.rodriguez.castellanos@uvg.edu.gt' }}
        onLogout={vi.fn()}
      />,
    );
    const boton = screen.getByRole('button');
    expect(within(boton).getByText(/María Fernanda Alejandra/)).toHaveClass('truncate');
    expect(within(boton).getByText(/@uvg\.edu\.gt/)).toHaveClass('truncate');
    expect(within(boton).getByText(/María Fernanda Alejandra/).parentElement).toHaveClass('min-w-0');
  });
});

describe('Un solo menú de cuenta por armazón', () => {
  const layout = fuente('components/dashboard/DashboardLayout.tsx');
  const cabecera = layout.slice(layout.indexOf('<header'), layout.indexOf('</header>'));
  const lateral = layout.slice(layout.indexOf('<aside'), layout.indexOf('</aside>'));
  const inferior = layout.slice(layout.lastIndexOf('<nav className="fixed bottom-0'), layout.lastIndexOf('</nav>'));

  it('la barra superior del estudiante ya no repite el menú y conserva campana y tema', () => {
    expect(cabecera).not.toContain('<UserMenu');
    expect(cabecera).toContain('<NotificationsBell onlyIcon />');
    expect(cabecera).toContain('<ThemeToggle />');
    expect(cabecera).toContain('<GlobalSearchInput');
  });

  it('el menú vive en la barra lateral (md en adelante) y en la barra inferior (móvil), nunca a la vez', () => {
    expect(layout.match(/<UserMenu /g)).toHaveLength(2);
    expect(lateral).toContain('<UserMenu');
    expect(layout.slice(layout.indexOf('<aside'), layout.indexOf('<aside') + 400)).toMatch(/hidden[^`]*md:flex/);
    expect(inferior).toContain('<UserMenu');
    expect(inferior).toContain('md:hidden');
  });

  it('el armazón del administrador ya cumplía: barra lateral y barra inferior, sin menú en la cabecera', () => {
    const admin = fuente('components/admin/AdminLayout.tsx');
    expect(admin.match(/<UserMenu /g)).toHaveLength(2);
    expect(admin.slice(admin.indexOf('<header'), admin.indexOf('</header>'))).not.toContain('<UserMenu');
  });

  it('el paso de la guía que señalaba el menú de arriba apunta ahora al de la barra lateral', () => {
    expect(lateral).toContain('id="dashboard-account-menu"');
    expect(cabecera).not.toContain('dashboard-account-menu');
  });
});

describe('Campana: contador total frente a panel de dos días', () => {
  const antigua = {
    idNotificacion: 1,
    tituloNotificacion: 'Aviso antiguo',
    mensajeNotificacion: null,
    creadaEn: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    leidaEn: null,
  };

  function abrirCampana(notificaciones: unknown[], total: number) {
    vi.mocked(useNotificaciones).mockReturnValue({ data: notificaciones } as never);
    vi.mocked(useConteoNoLeidas).mockReturnValue({ data: { total } } as never);
    render(<NotificationsBell onlyIcon />);
    fireEvent.click(screen.getByRole('button', { name: /^Notificaciones/ }));
  }

  it('con no leídas antiguas y nada reciente, explica de dónde sale el contador', () => {
    abrirCampana([antigua], 120);
    expect(screen.getByText('Nada en los últimos 2 días')).toBeInTheDocument();
    expect(screen.getByText('Tienes 120 sin leer de días anteriores. Ábrelas en "Ver todas".')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/dashboard/notificaciones');
  });

  it('sin no leídas conserva el mensaje anterior', () => {
    abrirCampana([{ ...antigua, leidaEn: antigua.creadaEn }], 0);
    expect(screen.getByText('Revisa "Ver todas" para tu historial completo.')).toBeInTheDocument();
  });

  it('sin ninguna notificación no cambia', () => {
    abrirCampana([], 0);
    expect(screen.getByText('Sin notificaciones')).toBeInTheDocument();
  });
});
