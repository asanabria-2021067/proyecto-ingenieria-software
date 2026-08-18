import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PendingLeaderReview } from '../components/projects/pending-leader-review';

describe('PendingLeaderReview (F11)', () => {
  afterEach(() => {
    cleanup();
  });

  // ── Test 1: render principal ─────────────────────────────────────────────
  it('muestra "Solicitud enviada" y el mensaje de espera', () => {
    render(createElement(PendingLeaderReview, {}));

    expect(screen.getByRole('heading', { name: 'Solicitud enviada' })).toBeInTheDocument();
    expect(
      screen.getByText('Tu solicitud está esperando la revisión del líder del proyecto.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Mientras el líder revisa tu solicitud, no necesitas realizar ninguna acción adicional.'),
    ).toBeInTheDocument();
  });

  it('no afirma una resolución que todavía no ocurrió (ni éxito final ni error)', () => {
    render(createElement(PendingLeaderReview, {}));

    expect(screen.queryByText(/aprobada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/salida completada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/has salido/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rechazada/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('expone el estado como texto ("Pendiente de revisión"), no solo por color', () => {
    render(createElement(PendingLeaderReview, {}));
    expect(screen.getByText('Pendiente de revisión')).toBeInTheDocument();
  });

  it('usa role="status" (no "alert"): es información no urgente', () => {
    render(createElement(PendingLeaderReview, {}));
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // ── Test 2: solo lectura ──────────────────────────────────────────────────
  it('no ofrece ninguna acción — ni de preparación ni de resolución del líder', () => {
    render(createElement(PendingLeaderReview, {}));

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Continuar solicitud de salida')).not.toBeInTheDocument();
    expect(screen.queryByText('Cerrar tramo')).not.toBeInTheDocument();
    expect(screen.queryByText('Nueva responsabilidad')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Aprobar$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Rechazar$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Cancelar solicitud')).not.toBeInTheDocument();
    expect(screen.queryByText('Editar solicitud')).not.toBeInTheDocument();
  });

  // ── Información opcional real (Sección 26 del prompt) ────────────────────
  it('sin solicitadaEn/motivo, no muestra el bloque de información opcional', () => {
    render(createElement(PendingLeaderReview, {}));
    expect(screen.queryByText('Motivo')).not.toBeInTheDocument();
    expect(screen.queryByText(/Enviada el/)).not.toBeInTheDocument();
  });

  it('con solicitadaEn real del backend, muestra la fecha formateada', () => {
    render(createElement(PendingLeaderReview, { solicitadaEn: '2026-08-16T00:00:00.000Z' }));
    expect(screen.getByText(/Enviada el/)).toBeInTheDocument();
  });

  it('con motivo real del backend, lo muestra tal cual (sin inventar texto adicional)', () => {
    render(createElement(PendingLeaderReview, { motivo: 'Cambio de proyecto por disponibilidad' }));
    expect(screen.getByText('Motivo')).toBeInTheDocument();
    expect(screen.getByText('Cambio de proyecto por disponibilidad')).toBeInTheDocument();
  });

  it('no muestra información del líder que el componente no recibe (nombre/foto/correo/SLA)', () => {
    render(createElement(PendingLeaderReview, { motivo: 'Cambio de proyecto', solicitadaEn: '2026-08-16T00:00:00.000Z' }));
    expect(screen.queryByText(/24 horas/)).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
