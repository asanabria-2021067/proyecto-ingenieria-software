import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OrgCard } from '@/components/organizations/org-card';

// MEJ-18: el botón «Seguir» consulta mis seguimientos con TanStack Query; aquí solo importa la tarjeta.
vi.mock('@/components/organizations/boton-seguir', () => ({
  SeguirOrganizacion: ({ nombre }: { nombre: string }) => <button type="button">{`Seguir ${nombre}`}</button>,
}));
import type { MiOrganizacion, OrganizacionPublica } from '@/lib/types/organizations';

const base = {
  idOrganizacion: 3,
  nombreOrganizacion: 'Grupo de Robotica',
  descripcionOrganizacion: 'Construimos robots',
  sitioWeb: null,
  logoUrl: null,
  visibilidad: 'PUBLICA' as const,
  fechaCreacion: '2026-01-01T00:00:00.000Z',
  archivada: false,
  puedePublicar: false,
  totalMiembros: 5,
  totalProyectos: 2,
};

const publica = (extra: Partial<OrganizacionPublica> = {}): OrganizacionPublica => ({
  ...base,
  miRol: null,
  solicitudPendiente: false,
  proyectos: [{ idProyecto: 8, tituloProyecto: 'Brazo robotico', estadoProyecto: 'EN_PROGRESO' }],
  ...extra,
});

describe('OrgCard', () => {
  afterEach(() => cleanup());

  it('en el buscador ofrece Solicitar unirse y muestra sus proyectos', () => {
    const onSolicitar = vi.fn();
    render(<OrgCard org={publica()} onSolicitar={onSolicitar} />);

    expect(screen.getByText('Brazo robotico')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar unirse' }));
    expect(onSolicitar).toHaveBeenCalledWith(3);
  });

  it('con solicitud pendiente no vuelve a ofrecer el boton', () => {
    render(<OrgCard org={publica({ solicitudPendiente: true })} onSolicitar={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Solicitar unirse' })).toBeNull();
    expect(screen.getByText('Solicitud enviada')).toBeInTheDocument();
  });

  it('un miembro ve el enlace a la organizacion y su rol, no el boton', () => {
    render(<OrgCard org={publica({ miRol: 'EDITOR' })} onSolicitar={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Solicitar unirse' })).toBeNull();
    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver organización' })).toHaveAttribute('href', '/dashboard/organizaciones/3');
  });

  it('en Mis organizaciones muestra visibilidad, rol y conteos', () => {
    const mia: MiOrganizacion = { ...base, visibilidad: 'PRIVADA', miRol: 'PROPIETARIO' };
    render(<OrgCard org={mia} />);
    expect(screen.getByText('Privada')).toBeInTheDocument();
    expect(screen.getByText('Propietario')).toBeInTheDocument();
    expect(screen.getByText('5 miembros')).toBeInTheDocument();
    expect(screen.getByText('2 proyectos')).toBeInTheDocument();
  });

  it('una organizacion archivada se marca', () => {
    render(<OrgCard org={{ ...base, miRol: 'LECTURA', archivada: true }} />);
    expect(screen.getByText('Archivada')).toBeInTheDocument();
  });
});
