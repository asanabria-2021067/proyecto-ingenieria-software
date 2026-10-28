import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Form } from '../components/ui/form';
import { emptyAdminMeetingForm, type AdminMeetingFormValues } from '../lib/admin/admin-meeting-form';

const admin = vi.hoisted(() => ({ listAdminUsers: vi.fn() }));
vi.mock('../lib/services/admin', () => admin);

import { MeetingPermissionsField } from '../components/admin/meetings/meeting-permissions-field';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const fila = (idUsuario: number, nombre: string, apellido: string) => ({ idUsuario, nombre, apellido, correo: `${nombre}@uvg.edu.gt`, fotoUrl: null, estado: 'ACTIVO', roles: ['administrador'], fechaCreacion: '' });

/** Valores actuales del formulario, que el arnés escribe en pantalla. */
const valores = (): Pick<AdminMeetingFormValues, 'politicaEdicion' | 'editores'> => JSON.parse(screen.getByTestId('valores').textContent ?? '{}');
function Harness({ puedeCambiar = true, inicial = {} }: { puedeCambiar?: boolean; inicial?: Partial<AdminMeetingFormValues> }) {
  const form = useForm<AdminMeetingFormValues>({ defaultValues: { ...emptyAdminMeetingForm(), ...inicial } });
  const politicaEdicion = form.watch('politicaEdicion');
  const editores = form.watch('editores');
  return (
    <Form {...form}>
      <MeetingPermissionsField isPending={false} puedeCambiar={puedeCambiar} idCreador={1} editoresConocidos={[{ idUsuario: 3, nombre: 'Luis', apellido: 'Gómez' }]} />
      <output data-testid="valores">{JSON.stringify({ politicaEdicion, editores })}</output>
    </Form>
  );
}
const renderField = (props: Parameters<typeof Harness>[0] = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness {...props} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  admin.listAdminUsers.mockResolvedValue({ data: [fila(1, 'Ana', 'Pérez'), fila(2, 'Sara', 'Lima'), fila(3, 'Luis', 'Gómez')], total: 3, page: 1, limit: 50, totalPages: 1 });
});
afterEach(cleanup);

describe('Permisos de gestión', () => {
  it('va plegada con la política por defecto del backend y no pide administradores', () => {
    renderField();
    const disparador = screen.getByRole('button', { name: /Permisos de gestión/ });
    expect(disparador).toHaveAttribute('aria-expanded', 'false');
    expect(disparador).toHaveTextContent('Todos los administradores');
    expect(valores().politicaEdicion).toBe('TODOS_ADMINISTRADORES');
    expect(admin.listAdminUsers).not.toHaveBeenCalled();
  });

  it('con «Administradores seleccionados» agrega administradores activos (sin el creador) y los puede quitar', async () => {
    renderField();
    fireEvent.click(screen.getByRole('button', { name: /Permisos de gestión/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Administradores seleccionados' }));
    expect(screen.getByText('Aún no elegiste administradores: solo tú podrás gestionarla.')).toBeInTheDocument();
    await waitFor(() => expect(admin.listAdminUsers).toHaveBeenCalledWith({ rol: 'administrador', estado: 'ACTIVO', limit: 50 }));

    fireEvent.click(screen.getByRole('button', { name: 'Agregar administrador' }));
    const opciones = await screen.findAllByRole('option');
    expect(opciones.map((o) => o.textContent)).toEqual(['SLSara Lima', 'LGLuis Gómez']);
    fireEvent.click(opciones[0]);
    expect(valores()).toMatchObject({ politicaEdicion: 'ADMINISTRADORES_SELECCIONADOS', editores: [2] });
    const grupo = screen.getByRole('group', { name: 'Administradores que también pueden gestionarla' });
    expect(within(grupo).getByText('Sara Lima')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar a Sara Lima de los editores' }));
    expect(valores().editores).toEqual([]);
  });

  it('para quien no la creó se muestra bloqueada, con sus editores actuales nombrados', () => {
    renderField({ puedeCambiar: false, inicial: { politicaEdicion: 'ADMINISTRADORES_SELECCIONADOS', editores: [3] } });
    fireEvent.click(screen.getByRole('button', { name: /Permisos de gestión/ }));
    expect(screen.getByText('Solo quien programó la reunión puede cambiar quién la gestiona.')).toBeInTheDocument();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar administrador' })).toBeDisabled();
    expect(admin.listAdminUsers).not.toHaveBeenCalled();
  });
});
