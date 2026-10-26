import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

  it('conserva el punto de no leída, el título en semibold y la selección', () => {
    const { container, rerender } = fila(base({ tituloNotificacion: 'Pendiente', datosJson: { userName: 'Ana' }, tipoNotificacion: 'NUEVO_SEGUIDOR' }));
    expect(screen.getByText('Pendiente')).toHaveClass('font-semibold');
    expect(container.querySelector('.rounded-full.bg-primary')).not.toBeNull();

    rerender(
      <ul>
        <InboxRow notificacion={base({ tituloNotificacion: 'Leída', leidaEn: AHORA.toISOString() })} seleccionada onSeleccionar={() => {}} ahora={AHORA} />
      </ul>,
    );
    expect(screen.getByText('Leída')).toHaveClass('font-medium');
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

  it('el avatar lleva el color de su categoría (familia de etiqueta), igual leída o no y sin anillo', () => {
    const casos = [
      { tipoNotificacion: 'TAREA_ASIGNADA', datosJson: { projectTitle: 'Plataforma de Tutorías' }, color: ['bg-tag-blue', 'text-on-tag-blue'] },
      { tipoNotificacion: 'NUEVA_POSTULACION', datosJson: { userName: 'María López' }, color: ['bg-tag-turquoise', 'text-on-tag-turquoise'] },
      { tipoNotificacion: 'HORAS_ACREDITADAS', datosJson: {}, color: ['bg-tag-amber', 'text-on-tag-amber'] },
      { tipoNotificacion: 'AMISTAD_ACEPTADA', datosJson: { userName: 'Luis Gómez' }, color: ['bg-tag-violet', 'text-on-tag-violet'] },
    ];
    for (const { color, ...aviso } of casos) {
      for (const leidaEn of [null, AHORA.toISOString()]) {
        const { container } = fila(base({ ...aviso, leidaEn }));
        const a = avatar(container);
        expect(a, `${aviso.tipoNotificacion} ${leidaEn ? 'leída' : 'no leída'}`).toHaveClass(...color);
        expect(a.className).not.toMatch(/(?:^|\s)ring-/);
        expect(a).not.toHaveClass('text-primary', 'text-tertiary');
        cleanup();
      }
    }
  });

  it('superficies: leída blanca, no leída con tinte casi imperceptible y seleccionada verde suave con indicador lateral', () => {
    const boton = () => screen.getByRole('button');
    const fecha = () => boton().querySelector('time')!;
    // No leída: tinte sutil sobre el blanco (no el fondo azulado de la página), sin línea lateral ni fecha verde.
    fila(base({ tipoNotificacion: 'PROYECTO_PUBLICADO', datosJson: { projectTitle: 'Plataforma de Tutorías' } }));
    expect(boton().className).toContain('var(--color-primary)_3%');
    expect(boton()).toHaveClass('border-l-transparent', 'hover:bg-surface-container-low');
    expect(boton()).not.toHaveClass('bg-primary/5', 'border-l-primary');
    expect(fecha()).toHaveClass('text-text-secondary', 'font-semibold');
    expect(fecha()).not.toHaveClass('text-primary');
    cleanup();

    // Leída: blanca, como las filas de Mis Tareas.
    fila(base({ tipoNotificacion: 'NUEVO_SEGUIDOR', datosJson: { userName: 'Ana Ruiz' }, leidaEn: AHORA.toISOString() }));
    expect(boton()).toHaveClass('bg-surface-container-lowest', 'border-l-transparent', 'hover:bg-surface-container-low');
    cleanup();

    // Seleccionada y no leída: verde suave con indicador lateral, y sigue en semibold con su punto.
    const { container } = render(
      <ul>
        <InboxRow notificacion={base({ tituloNotificacion: 'Elegida', datosJson: { userName: 'Ana' }, tipoNotificacion: 'NUEVO_SEGUIDOR' })} seleccionada onSeleccionar={() => {}} ahora={AHORA} />
      </ul>,
    );
    expect(boton().className).toContain('var(--color-primary)_8%');
    expect(boton()).toHaveClass('border-l-primary');
    expect(boton()).not.toHaveClass('bg-sage-nav-active');
    expect(screen.getByText('Elegida')).toHaveClass('font-semibold', 'text-on-surface');
    expect(container.querySelector('.rounded-full.bg-primary')).not.toBeNull();
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
