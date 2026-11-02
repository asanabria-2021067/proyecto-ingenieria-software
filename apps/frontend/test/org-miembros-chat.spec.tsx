import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MiembroOrganizacion } from '@/lib/types/organizations';

const estado = vi.hoisted(() => ({
  enviar: vi.fn(),
  canal: { data: undefined as unknown, isLoading: false, isError: false },
  mensajes: [] as unknown[],
}));

vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: { idUsuario: 1 } }) }));
vi.mock('@/lib/mensajes', () => ({
  aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() },
  confirmar: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/hooks/use-organizations', () => ({
  useCambiarRolMiembro: () => ({ mutate: vi.fn(), isPending: false }),
  useQuitarMiembro: () => ({ mutate: vi.fn(), isPending: false }),
  useCanalOrganizacion: () => estado.canal,
  useMensajesOrganizacion: () => ({ data: estado.mensajes }),
  useEnviarMensajeOrganizacion: () => ({ mutate: estado.enviar, isPending: false }),
}));
// MEJ-41/42/43: notas de voz, encuestas y fijados viven en use-chat-extras; aqui no hay nada fijado ni se graba.
vi.mock('@/hooks/use-chat-extras', () => ({
  useCreateReminder: () => ({ mutate: vi.fn(), isPending: false }),
  useTarjetasEnlace: () => ({ tarjetas: [], isLoading: false }),
  useFijados: () => ({ fijados: [], isLoading: false }),
  usePinMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useFijadosOrganizacion: () => ({ fijados: [], isLoading: false }),
  usePinMessageOrganizacion: () => ({ mutate: vi.fn(), isPending: false }),
  useSendVoiceNote: () => ({ mutate: vi.fn(), isPending: false }),
  useCreatePoll: () => ({ mutate: vi.fn(), isPending: false }),
  useVotePoll: () => ({ mutate: vi.fn(), isPending: false }),
  useClosePoll: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-chat', () => ({
  useDeleteMessage: () => ({ mutate: vi.fn() }),
  useEditMessage: () => ({ mutate: vi.fn() }),
  useToggleSavedMessage: () => ({ mutate: vi.fn() }),
}));

import { OrgMiembros } from '@/components/organizations/org-miembros';
import { OrgChat } from '@/components/organizations/org-chat';

const miembro = (idUsuario: number, nombre: string, rolOrganizacion: MiembroOrganizacion['rolOrganizacion']): MiembroOrganizacion => ({
  idUsuario,
  nombre,
  apellido: 'Lopez',
  fotoUrl: null,
  rolOrganizacion,
  fechaIngreso: '2026-02-01T00:00:00.000Z',
});

const miembros = [
  miembro(1, 'Ana', 'PROPIETARIO'),
  miembro(2, 'Beto', 'ADMINISTRADOR'),
  miembro(3, 'Carla', 'EDITOR'),
  miembro(4, 'Dani', 'LECTURA'),
];

describe('OrgMiembros', () => {
  afterEach(() => cleanup());

  const renderComo = (miRol: 'PROPIETARIO' | 'ADMINISTRADOR' | 'EDITOR', idUsuarioActual: number, archivada = false) =>
    render(<OrgMiembros idOrganizacion={7} miembros={miembros} miRol={miRol} idUsuarioActual={idUsuarioActual} archivada={archivada} />);

  it('el Propietario cambia y quita a todos menos a si mismo', () => {
    renderComo('PROPIETARIO', 1);
    for (const nombre of ['Beto', 'Carla', 'Dani']) {
      expect(screen.getByRole('combobox', { name: `Rol de ${nombre} Lopez` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Quitar a ${nombre} Lopez` })).toBeInTheDocument();
    }
    expect(screen.queryByRole('combobox', { name: 'Rol de Ana Lopez' })).toBeNull();
    expect(screen.getByText('(tú)')).toBeInTheDocument();
  });

  it('el Administrador no gestiona ni al Propietario ni a otros administradores', () => {
    renderComo('ADMINISTRADOR', 2);
    expect(screen.queryByRole('combobox', { name: 'Rol de Ana Lopez' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quitar a Ana Lopez' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Rol de Carla Lopez' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Rol de Dani Lopez' })).toBeInTheDocument();
  });

  it('el Editor solo ve los roles', () => {
    renderComo('EDITOR', 3);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.getByText('Propietario')).toBeInTheDocument();
    expect(screen.getByText('Lectura')).toBeInTheDocument();
  });

  it('archivada: nadie cambia roles', () => {
    renderComo('PROPIETARIO', 1, true);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('OrgChat', () => {
  beforeEach(() => {
    estado.enviar.mockReset();
    estado.mensajes = [
      {
        idMensaje: 9,
        idConversacion: 5,
        contenido: 'Hola equipo',
        enviadoEn: '2026-03-01T10:00:00.000Z',
        remitente: { idUsuario: 2, nombre: 'Beto', apellido: 'Lopez', fotoUrl: null },
      },
    ];
    estado.canal = {
      data: { idConversacion: 5, idOrganizacion: 7, nombre: '#general', archivada: false, miembros: [{}, {}] },
      isLoading: false,
      isError: false,
    };
  });
  afterEach(() => cleanup());

  it('muestra el canal #general con sus mensajes y envia el texto recortado', () => {
    render(<OrgChat idOrganizacion={7} />);

    expect(screen.getByText('general')).toBeInTheDocument();
    expect(screen.getByText('Hola equipo')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mensaje para #general'), { target: { value: '  buenas  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    expect(estado.enviar).toHaveBeenCalledWith('buenas', expect.any(Object));
  });

  it('no deja enviar un mensaje vacio', () => {
    render(<OrgChat idOrganizacion={7} />);
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
  });

  it('archivada: el chat queda en solo lectura, sin caja de texto', () => {
    estado.canal = { data: { ...(estado.canal.data as object), archivada: true }, isLoading: false, isError: false };
    render(<OrgChat idOrganizacion={7} />);

    expect(screen.queryByLabelText('Mensaje para #general')).toBeNull();
    expect(screen.getByText(/solo lectura/)).toBeInTheDocument();
  });

  it('los mensajes del chat de organizacion no ofrecen editar ni eliminar', () => {
    estado.mensajes = [
      {
        idMensaje: 10,
        idConversacion: 5,
        contenido: 'Mi mensaje',
        enviadoEn: '2026-03-01T10:00:00.000Z',
        remitente: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    ];
    render(<OrgChat idOrganizacion={7} />);

    expect(screen.getByText('Mi mensaje')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acciones del mensaje' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Responder/ })).toBeNull();
  });
});
