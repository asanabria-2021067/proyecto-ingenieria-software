import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserDetailSheet } from '@/components/admin/UserDetailSheet';
import type { AdminUserDetail } from '@/lib/services/admin';

/** ROL-2: el editor de alcance solo aparece en el detalle de un coordinador académico. */

vi.mock('next/image', () => ({ default: (props: { alt?: string }) => <span role="img" aria-label={props.alt ?? ''} /> }));
const detalleMock = vi.fn();
vi.mock('@/lib/services/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/admin')>()),
  getAdminUserDetail: (id: unknown) => detalleMock(id),
}));
vi.mock('@/lib/services/social', () => ({ getPerfilUsuario: vi.fn().mockResolvedValue({ proyectosActivos: [] }) }));
vi.mock('@/components/admin/CoordinadorAlcanceEditor', () => ({
  CoordinadorAlcanceEditor: ({ idUsuario }: { idUsuario: number }) => <div data-testid="editor-alcance">editor {idUsuario}</div>,
}));

const usuario = (roles: string[]): AdminUserDetail => ({
  idUsuario: 7,
  nombre: 'Cora',
  apellido: 'Dina',
  correo: 'cora@uvg.edu.gt',
  fotoUrl: null,
  estado: 'ACTIVO',
  roles,
  fechaCreacion: '2026-01-15T00:00:00.000Z',
  fechaUltimaSesion: null,
  perfilEstudiante: null,
  actividadEstudiante: null,
  actividadLider: null,
  actividadCoordinador: null,
  actividadAdmin: null,
});

function abrir(roles: string[]) {
  detalleMock.mockResolvedValue(usuario(roles));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <UserDetailSheet userId={7} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('detalle de usuario: editor de alcance', () => {
  it('aparece para un coordinador académico', async () => {
    abrir(['coordinador_academico']);
    expect(await screen.findByTestId('editor-alcance')).toHaveTextContent('editor 7');
    expect(screen.getByText('Alcance académico')).toBeInTheDocument();
  });

  it.each([['un líder de asociación', ['lider_asociacion']], ['un estudiante', ['estudiante']]])(
    'no aparece para %s',
    async (_n, roles) => {
      abrir(roles);
      expect(await screen.findByText('Información institucional')).toBeInTheDocument();
      expect(screen.queryByTestId('editor-alcance')).not.toBeInTheDocument();
      expect(screen.queryByText('Alcance académico')).not.toBeInTheDocument();
    },
  );
});
