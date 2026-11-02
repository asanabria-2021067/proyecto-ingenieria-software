import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiFetch }));

import {
  archivarOrganizacion,
  buscarCandidatos,
  buscarOrganizaciones,
  cambiarRolMiembro,
  cancelarInvitacion,
  crearOrganizacion,
  enviarMensajeOrganizacion,
  getMensajesOrganizacion,
  invitarMiembro,
  quitarMiembro,
  resolverSolicitud,
  responderInvitacion,
  salirDeOrganizacion,
  solicitarUnirse,
  transferirOrganizacion,
} from '@/lib/services/organizations';

describe('servicios de organizaciones', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue(undefined);
  });

  it('crea con POST /organizaciones y el cuerpo tal cual', async () => {
    const input = { nombreOrganizacion: 'Robotica', visibilidad: 'PUBLICA' as const };
    await crearOrganizacion(input);
    expect(apiFetch).toHaveBeenCalledWith('/organizaciones', { method: 'POST', body: JSON.stringify(input) });
  });

  it('el buscador manda la pagina y recorta el texto; sin texto no manda q', async () => {
    await buscarOrganizaciones('  uvg  ', 2);
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/buscar?page=2&q=uvg');
    await buscarOrganizaciones('   ');
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/buscar?page=1');
  });

  it('transferir manda la confirmacion que exige el backend', async () => {
    await transferirOrganizacion(4, 9);
    expect(apiFetch).toHaveBeenCalledWith('/organizaciones/4/transferir', {
      method: 'POST',
      body: JSON.stringify({ idUsuario: 9, confirmar: true }),
    });
  });

  it('archivar y salir son POST sin cuerpo', async () => {
    await archivarOrganizacion(4);
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/4/archivar', { method: 'POST' });
    await salirDeOrganizacion(4);
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/4/salir', { method: 'POST' });
  });

  it('cambiar rol es PATCH y quitar miembro es DELETE', async () => {
    await cambiarRolMiembro(4, 9, 'EDITOR');
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/4/miembros/9', {
      method: 'PATCH',
      body: JSON.stringify({ rolOrganizacion: 'EDITOR' }),
    });
    await quitarMiembro(4, 9);
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/4/miembros/9', { method: 'DELETE' });
  });

  it('invitaciones: invitar, cancelar y responder (aceptar/rechazar)', async () => {
    await invitarMiembro(4, { correo: 'a@uvg.edu.gt', rolOrganizacion: 'LECTURA' });
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/4/invitaciones', {
      method: 'POST',
      body: JSON.stringify({ correo: 'a@uvg.edu.gt', rolOrganizacion: 'LECTURA' }),
    });
    await cancelarInvitacion(4, 7);
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/4/invitaciones/7', { method: 'DELETE' });
    await responderInvitacion(7, true);
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/invitaciones/7/aceptar', { method: 'POST' });
    await responderInvitacion(7, false);
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/invitaciones/7/rechazar', { method: 'POST' });
  });

  it('solicitudes: solicitar unirse y resolver', async () => {
    await solicitarUnirse(4);
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/4/solicitudes', { method: 'POST' });
    await resolverSolicitud(4, 3, true);
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/4/solicitudes/3/aceptar', { method: 'POST' });
    await resolverSolicitud(4, 3, false);
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/4/solicitudes/3/rechazar', { method: 'POST' });
  });

  it('candidatos codifica la consulta', async () => {
    await buscarCandidatos(4, ' ana perez ');
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/4/candidatos?q=ana%20perez');
  });

  it('chat: lee y envia el contenido', async () => {
    await getMensajesOrganizacion(4);
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/4/chat/mensajes');
    await enviarMensajeOrganizacion(4, 'hola');
    expect(apiFetch).toHaveBeenLastCalledWith('/organizaciones/4/chat/mensajes', {
      method: 'POST',
      body: JSON.stringify({ contenido: 'hola' }),
    });
  });
});
