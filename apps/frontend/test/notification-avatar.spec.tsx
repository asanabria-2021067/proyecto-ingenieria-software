import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { InboxRow } from '../components/notifications/inbox-list';
import { NotificationReaderContent } from '../components/notifications/notification-reader';
import type { Notificacion } from '../lib/services/notifications';

/**
 * Avatares contextuales de la bandeja: quién o qué originó cada aviso, con
 * los datos que el payload trae de verdad (sin fotos ni nombres deducidos del
 * mensaje), mismo tamaño en todas las filas y sin peticiones por fila.
 */

const AHORA = new Date();
const base = (parcial: Partial<Notificacion>): Notificacion => ({
  idNotificacion: 1,
  idUsuario: 9,
  tipoNotificacion: 'TAREA_ASIGNADA',
  tituloNotificacion: 'Aviso',
  mensajeNotificacion: null,
  datosJson: null,
  creadaEn: AHORA.toISOString(),
  leidaEn: null,
  ...parcial,
});

const fila = (n: Notificacion, seleccionada = false) =>
  render(
    <ul>
      <InboxRow notificacion={n} seleccionada={seleccionada} onSeleccionar={() => {}} ahora={AHORA} />
    </ul>,
  );
const avatar = (contenedor: HTMLElement) => contenedor.querySelector('[data-slot="avatar"]') as HTMLElement;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('avatar contextual en la fila', () => {
  it('persona identificada: círculo con sus iniciales, decorativo (su nombre ya va en texto)', () => {
    const { container } = fila(base({ tipoNotificacion: 'MENCION_COMENTARIO', tituloNotificacion: 'Te mencionaron', datosJson: { autorNombre: 'Carlos Mendoza', idProyecto: 4 } }));
    const a = avatar(container);
    expect(a).toHaveAttribute('data-identidad', 'persona');
    expect(a).toHaveAttribute('aria-hidden', 'true');
    expect(a).toHaveTextContent('CM');
    expect(a).toHaveClass('rounded-full', 'size-9');
    expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
    // Sin fotografía en el contrato: nunca se pinta una imagen.
    expect(container.querySelector('img')).toBeNull();
  });

  it('sin actor estructurado no atribuye identidad: un comentario muestra el icono, no iniciales', () => {
    const { container } = fila(base({ tipoNotificacion: 'COMENTARIO_TAREA', tituloNotificacion: 'Nuevo comentario', mensajeNotificacion: 'Carlos Mendoza comentó', datosJson: { idProyecto: 4, idTarea: 1 } }));
    const a = avatar(container);
    expect(a).toHaveAttribute('data-identidad', 'sistema');
    expect(a).not.toHaveTextContent('CM');
    expect(a.querySelector('svg')).not.toBeNull();
  });

  it('Administración: identidad institucional; automático: icono; proyecto: cuadro redondeado con iniciales', () => {
    const reunion = fila(base({ tipoNotificacion: 'REUNION_PROGRAMADA', datosJson: { meetingId: 1, projectTitle: 'Huerto UVG' } }));
    expect(avatar(reunion.container)).toHaveAttribute('data-identidad', 'institucion');
    expect(screen.getByText('Administración')).toBeInTheDocument();
    cleanup();

    const horas = fila(base({ tipoNotificacion: 'HORAS_CONSOLIDADAS', datosJson: { projectTitle: 'Huerto UVG' } }));
    expect(avatar(horas.container)).toHaveAttribute('data-identidad', 'sistema');
    cleanup();

    const proyecto = fila(base({ tipoNotificacion: 'PROYECTO_PUBLICADO', datosJson: { projectId: 3, projectTitle: 'Plataforma de Tutorías UVG' } }));
    const a = avatar(proyecto.container);
    expect(a).toHaveAttribute('data-identidad', 'proyecto');
    expect(a).toHaveTextContent('PT');
    expect(a).toHaveClass('rounded-[var(--radius-control)]');
    expect(a).not.toHaveClass('rounded-full');
  });

  it('todas las identidades ocupan el mismo hueco de 36 px (la fila no cambia de alto)', () => {
    const casos: Partial<Notificacion>[] = [
      { tipoNotificacion: 'NUEVO_SEGUIDOR', datosJson: { userName: 'Ana Ruiz' } },
      { tipoNotificacion: 'REUNION_CANCELADA', datosJson: { meetingId: 1 } },
      { tipoNotificacion: 'PROYECTO_PUBLICADO', datosJson: { projectTitle: 'Huerto UVG' } },
      { tipoNotificacion: 'ALERTA_SEGURIDAD', datosJson: { ip: 'x' } },
    ];
    for (const caso of casos) {
      const { container } = fila(base(caso));
      expect(avatar(container), caso.tipoNotificacion).toHaveClass('size-9', 'shrink-0');
      cleanup();
    }
  });

  it('conserva el punto de no leída, el título en negrita y la selección', () => {
    const { container, rerender } = fila(base({ tituloNotificacion: 'Pendiente', datosJson: { userName: 'Ana' }, tipoNotificacion: 'NUEVO_SEGUIDOR' }));
    expect(screen.getByText('Pendiente')).toHaveClass('font-bold', 'text-on-surface');
    expect(container.querySelector('.rounded-full.bg-primary')).not.toBeNull();

    rerender(
      <ul>
        <InboxRow notificacion={base({ tituloNotificacion: 'Leída', leidaEn: AHORA.toISOString() })} seleccionada onSeleccionar={() => {}} ahora={AHORA} />
      </ul>,
    );
    // Leída = atenuada: título medium en tono secundario (sin leer va en negrita y alto contraste).
    expect(screen.getByText('Leída')).toHaveClass('font-medium', 'text-on-surface-variant');
    expect(screen.getByText('Leída')).not.toHaveClass('font-bold');
    expect(container.querySelector('.rounded-full.bg-primary')).toBeNull();
    expect(screen.getByRole('button')).toHaveAttribute('aria-current', 'true');
    expect(avatar(container)).toBeInTheDocument();
  });

  it('la etiqueta de proyecto es salvia discreta (el lima queda para lo que debe destacar) y sigue truncada', () => {
    fila(base({ tipoNotificacion: 'TAREA_ASIGNADA', datosJson: { projectId: 4, projectTitle: 'Proyecto con un nombre muy largo para la etiqueta' } }));
    const chip = screen.getByTitle('Proyecto con un nombre muy largo para la etiqueta');
    expect(chip).toHaveClass('pill-sage', 'max-w-44');
    expect(chip).not.toHaveClass('pill-accent');
  });

  it('sin leer, el avatar lleva el color de su categoría; leído, pierde el color y queda gris', () => {
    const casos = [
      { tipoNotificacion: 'TAREA_ASIGNADA', datosJson: { projectTitle: 'Plataforma de Tutorías' }, color: ['bg-tag-blue', 'text-on-tag-blue'] },
      { tipoNotificacion: 'NUEVA_POSTULACION', datosJson: { userName: 'María López' }, color: ['bg-tag-turquoise', 'text-on-tag-turquoise'] },
      { tipoNotificacion: 'HORAS_ACREDITADAS', datosJson: {}, color: ['bg-tag-amber', 'text-on-tag-amber'] },
      { tipoNotificacion: 'AMISTAD_ACEPTADA', datosJson: { userName: 'Luis Gómez' }, color: ['bg-tag-violet', 'text-on-tag-violet'] },
    ];
    for (const { color, ...aviso } of casos) {
      const sinLeer = fila(base({ ...aviso, leidaEn: null }));
      const a = avatar(sinLeer.container);
      expect(a, `${aviso.tipoNotificacion} no leída`).toHaveClass(...color);
      expect(a.className).not.toMatch(/(?:^|\s)ring-/);
      cleanup();

      const leida = fila(base({ ...aviso, leidaEn: AHORA.toISOString() }));
      const b = avatar(leida.container);
      expect(b, `${aviso.tipoNotificacion} leída`).toHaveClass('bg-surface-container', 'text-tertiary');
      expect(b.className).not.toMatch(/bg-tag-|text-on-tag-/);
      cleanup();
    }
  });

  it('superficies: leída blanca, no leída con tinte casi imperceptible y seleccionada verde suave con indicador lateral', () => {
    const boton = () => screen.getByRole('button');
    const fecha = () => boton().querySelector('time')!;
    // No leída: tinte sutil sobre el blanco (no el fondo azulado de la página), sin línea lateral ni fecha verde.
    fila(base({ tipoNotificacion: 'PROYECTO_PUBLICADO', datosJson: { projectTitle: 'Plataforma de Tutorías' } }));
    expect(boton().className).toContain('var(--color-primary)_3%');
    expect(boton()).toHaveClass('hover:bg-surface-container-low');
    // Barra verde de no leída (3 px, verde suavizado) a la izquierda.
    expect(boton().className).toContain('shadow-[inset_3px_0_0_color-mix(in_srgb,var(--color-primary)_55%,transparent)]');
    expect(boton()).not.toHaveClass('bg-primary/5');
    // Sin leer, la fecha gana contraste (como en Outlook), sin volverse verde.
    expect(fecha()).toHaveClass('text-on-surface', 'font-semibold');
    expect(fecha()).not.toHaveClass('text-primary');
    cleanup();

    // Leída: blanca, como las filas de Mis Tareas.
    fila(base({ tipoNotificacion: 'NUEVO_SEGUIDOR', datosJson: { userName: 'Ana Ruiz' }, leidaEn: AHORA.toISOString() }));
    expect(boton()).toHaveClass('bg-surface-container-lowest', 'hover:bg-surface-container-low');
    expect(boton().className).not.toMatch(/shadow-\[inset/);
    cleanup();

    // Seleccionada y no leída: verde suave con indicador lateral, y sigue en semibold con su punto.
    const { container } = render(
      <ul>
        <InboxRow notificacion={base({ tituloNotificacion: 'Elegida', datosJson: { userName: 'Ana' }, tipoNotificacion: 'NUEVO_SEGUIDOR' })} seleccionada onSeleccionar={() => {}} ahora={AHORA} />
      </ul>,
    );
    expect(boton().className).toContain('var(--color-primary)_8%');
    // Selección y no leída se funden en UNA barra verde plena más gruesa (5 px), no dos líneas.
    expect(boton()).toHaveClass('shadow-[inset_5px_0_0_var(--color-primary)]');
    expect(boton().className.match(/shadow-\[inset/g)).toHaveLength(1);
    expect(boton()).not.toHaveClass('bg-sage-nav-active');
    expect(screen.getByText('Elegida')).toHaveClass('font-bold', 'text-on-surface');
    expect(container.querySelector('.rounded-full.bg-primary')).not.toBeNull();
  });

  it('seleccionada y leída: fondo de selección con barra verde de 3 px, sin el lenguaje de no leída', () => {
    const { container } = render(
      <ul>
        <InboxRow notificacion={base({ tituloNotificacion: 'Vista', mensajeNotificacion: 'La tarea "Diseño" cambió.', leidaEn: AHORA.toISOString() })} seleccionada onSeleccionar={() => {}} ahora={AHORA} />
      </ul>,
    );
    const boton = screen.getByRole('button');
    expect(boton.className).toContain('var(--color-primary)_8%');
    expect(boton).toHaveClass('shadow-[inset_3px_0_0_var(--color-primary)]');
    // No es la barra fusionada de no leída (5 px) ni la suavizada.
    expect(boton.className).not.toMatch(/inset_5px|color-mix\(in_srgb,var\(--color-primary\)_55%/);
    expect(screen.getByText('Vista')).toHaveClass('font-medium');
    expect(container.querySelector('.rounded-full.bg-primary')).toBeNull();
    expect(screen.getByText('Diseño')).not.toHaveClass('text-primary');
  });

  it('sin leer, la cita va en verde como texto (sin fondo ni subrayado) y el resto de la descripción queda neutro', () => {
    fila(base({ mensajeNotificacion: 'Se asignó la tarea "Diseñar wireframes" dentro de tu rol.' }));
    const cita = screen.getByText('Diseñar wireframes');
    expect(cita.tagName).toBe('SPAN');
    expect(cita).toHaveClass('text-primary', 'font-semibold');
    expect(cita.className).not.toMatch(/bg-|underline|decoration/);
    const descripcion = cita.parentElement!;
    expect(descripcion).toHaveTextContent('Se asignó la tarea "Diseñar wireframes" dentro de tu rol.');
    expect(descripcion).toHaveClass('text-on-surface-variant');
    expect(descripcion.className).not.toMatch(/lime|primary/);
  });

  it('leída, la cita vuelve al tono neutro y la descripción se atenúa', () => {
    fila(base({ mensajeNotificacion: 'Se asignó la tarea "Diseñar wireframes" dentro de tu rol.', leidaEn: AHORA.toISOString() }));
    const cita = screen.getByText('Diseñar wireframes');
    expect(cita).not.toHaveClass('text-primary');
    expect(cita.parentElement).toHaveClass('text-tertiary');
  });

  it('títulos y mensajes largos siguen truncados', () => {
    fila(base({ tituloNotificacion: 'T'.repeat(300), mensajeNotificacion: 'M'.repeat(600) }));
    expect(screen.getByText('T'.repeat(300))).toHaveClass('truncate');
    expect(screen.getByText('M'.repeat(600))).toHaveClass('line-clamp-2');
  });

  it('pintar avatares no hace peticiones (sin N+1)', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (let i = 0; i < 20; i += 1) fila(base({ idNotificacion: i, tipoNotificacion: 'NUEVO_SEGUIDOR', datosJson: { userName: `Persona ${i}` } }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('avatar en el visor', () => {
  it('usa la misma identidad que la fila, un poco mayor', () => {
    const { container } = render(<NotificationReaderContent notificacion={base({ tipoNotificacion: 'CALENDARIO_COMPARTIDO', tituloNotificacion: 'Calendario compartido', datosJson: { ownerId: 2, ownerName: 'Ana Ruiz' } })} />);
    const a = avatar(container);
    expect(a).toHaveAttribute('data-identidad', 'persona');
    expect(a).toHaveTextContent('AR');
    expect(a).toHaveClass('size-10');
    expect(screen.getByText('Ana Ruiz')).toBeInTheDocument();
  });

  it('en el visor el avatar también lleva el color de la categoría (calendario: recordatorios)', () => {
    const { container } = render(<NotificationReaderContent notificacion={base({ tipoNotificacion: 'CALENDARIO_COMPARTIDO', tituloNotificacion: 'Calendario compartido', datosJson: { ownerId: 2, ownerName: 'Ana Ruiz' } })} />);
    expect(avatar(container)).toHaveAttribute('data-categoria', 'recordatorios');
    expect(avatar(container)).toHaveClass('bg-tag-orange', 'text-on-tag-orange');
  });
});

describe('visor como tarjeta', () => {
  it('va en una tarjeta con la acción contextual y «Marcar como leída» al pie mientras no esté leída', () => {
    const onMarcarLeida = vi.fn();
    render(
      <NotificationReaderContent
        notificacion={base({ tipoNotificacion: 'TAREA_ASIGNADA', tituloNotificacion: 'Nueva tarea', datosJson: { projectId: 4, taskId: 7, projectTitle: 'Tutorías' } })}
        onMarcarLeida={onMarcarLeida}
      />,
    );
    const tarjeta = screen.getByRole('article');
    expect(tarjeta).toHaveClass('card-base');
    const pie = tarjeta.querySelector('footer')!;
    expect(within(pie).getByRole('link', { name: 'Ver tarea' })).toHaveAttribute('href', '/dashboard/projects/4/kanban/tasks/7');
    fireEvent.click(within(pie).getByRole('button', { name: 'Marcar como leída' }));
    expect(onMarcarLeida).toHaveBeenCalledTimes(1);
  });

  it('leída: el pie solo conserva la acción contextual', () => {
    render(
      <NotificationReaderContent
        notificacion={base({ tipoNotificacion: 'TAREA_ASIGNADA', datosJson: { projectId: 4, taskId: 7 }, leidaEn: AHORA.toISOString() })}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Marcar como leída' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver tarea' })).toBeInTheDocument();
  });

  it('los datos estructurados van en columnas separadas por una línea vertical', () => {
    render(
      <NotificationReaderContent
        notificacion={base({ tipoNotificacion: 'HORAS_CONSOLIDADAS', datosJson: { projectId: 4, numeroSprint: 3, horasReportadas: '5.00', horasPropuestas: '5.00' } })}
      />,
    );
    const datos = screen.getByRole('region', { name: 'Detalles' });
    const celdas = [...datos.querySelectorAll('dl > div')];
    expect(celdas.length).toBeGreaterThanOrEqual(2);
    expect(celdas[0]).not.toHaveClass('sm:border-l');
    expect(celdas[1]).toHaveClass('sm:border-l');
  });
});
