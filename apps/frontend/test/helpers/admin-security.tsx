import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminSeguridadPage from '../../app/dashboard/admin/seguridad/page';
import { SECURITY_EVENT_TYPES, type SecurityEvent, type SecurityEventsPage } from '../../lib/types/admin-security';

/** Datos y montaje compartidos por las suites del visor de eventos de seguridad (T-310). */

export const base = (parcial: Partial<SecurityEvent> & Pick<SecurityEvent, 'id' | 'tipo'>): SecurityEvent => ({
  fecha: '2026-10-11T06:00:00.000Z',
  actor: null,
  cuenta: null,
  origen: { ip: null, ipConfiable: false },
  detalle: {},
  ...parcial,
});

export const ADA = { idUsuario: 7, nombre: 'Ada Admin' };
export const EVA = { idUsuario: 8, nombre: 'Eva Estudiante' };

/** Un evento de cada tipo del catálogo, con el detalle que entrega el backend. */
export const SEIS_TIPOS: SecurityEvent[] = [
  base({
    id: 6,
    tipo: 'USER_STATUS_CHANGED',
    actor: ADA,
    cuenta: EVA,
    origen: { ip: '198.51.100.7', ipConfiable: true },
    detalle: { estadoAnterior: 'ACTIVO', estadoNuevo: 'BLOQUEADO' },
  }),
  base({ id: 5, tipo: 'PASSWORD_RESET_COMPLETED', actor: EVA, cuenta: EVA, detalle: { idSolicitud: 77, sesionesRevocadas: 2 } }),
  base({
    id: 4,
    tipo: 'PASSWORD_RESET_ISSUED',
    actor: ADA,
    cuenta: EVA,
    detalle: { idSolicitud: 77, expiraEn: '2026-10-11T07:00:00.000Z' },
  }),
  base({ id: 3, tipo: 'ACCOUNT_LOCKED', cuenta: EVA, detalle: { cuentaConocida: true } }),
  base({ id: 2, tipo: 'LOGIN_SUCCEEDED', actor: EVA, cuenta: EVA }),
  base({
    id: 1,
    tipo: 'LOGIN_FAILED',
    origen: { ip: '203.0.113.9', ipConfiable: false },
    detalle: { motivo: 'CREDENCIALES', cuentaConocida: false, cuentaRef: '0123456789abcdef' },
  }),
];

export const pagina = (data: SecurityEvent[], extra: Partial<SecurityEventsPage> = {}): SecurityEventsPage => ({
  data,
  total: data.length,
  page: 1,
  totalPages: data.length > 0 ? 1 : 0,
  tipos: [...SECURITY_EVENT_TYPES],
  ...extra,
});

export function renderPagina() {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...render(<AdminSeguridadPage />, { wrapper }) };
}
