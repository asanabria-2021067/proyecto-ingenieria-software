import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

beforeAll(() => {
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const scheduleMutate = vi.fn();
const cancelMutate = vi.fn();
let programados: unknown[] = [];
vi.mock('@/hooks/use-chat', () => ({
  useScheduledMessages: () => ({ programados, isLoading: false }),
  useScheduleMessage: () => ({ mutate: scheduleMutate, isPending: false }),
  useCancelScheduledMessage: () => ({ mutate: cancelMutate, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  ScheduleMessageButton,
  ScheduledMessagesList,
  validarEnvio,
} from '../components/chat-dock/scheduled-messages';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  programados = [];
});

function aLocal(ms: number): string {
  const d = new Date(Date.now() + ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

describe('validarEnvio', () => {
  const ahora = new Date('2026-10-16T12:00:00');
  it('rechaza vacio, invalido, menos de 1 minuto y mas de 30 dias', () => {
    expect(validarEnvio('', ahora)).toMatch(/Elige/);
    expect(validarEnvio('no-fecha', ahora)).toMatch(/Elige/);
    expect(validarEnvio('2026-10-16T12:00:30', ahora)).toMatch(/1 minuto/);
    expect(validarEnvio('2026-11-15T12:00:01', ahora)).toMatch(/30 días/);
  });
  it('acepta los limites exactos', () => {
    expect(validarEnvio('2026-10-16T12:01', ahora)).toBeNull();
    expect(validarEnvio('2026-11-15T12:00', ahora)).toBeNull();
  });
});

describe('ScheduleMessageButton', () => {
  const props = { idProyecto: 10, idConversacion: 5, onScheduled: vi.fn() };

  it('esta deshabilitado sin texto', () => {
    render(createElement(ScheduleMessageButton, { ...props, texto: '  ' }));
    expect(screen.getByRole('button', { name: 'Programar envío' })).toBeDisabled();
  });

  it('abre el popover con datetime-local y muestra error si la fecha no es futura', () => {
    render(createElement(ScheduleMessageButton, { ...props, texto: 'hola' }));
    fireEvent.click(screen.getByRole('button', { name: 'Programar envío' }));
    const campo = screen.getByLabelText('Enviar el');
    expect(campo).toHaveAttribute('type', 'datetime-local');

    fireEvent.change(campo, { target: { value: aLocal(-60 * 60_000) } });
    fireEvent.click(screen.getByRole('button', { name: 'Programar' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/1 minuto/);
    expect(scheduleMutate).not.toHaveBeenCalled();
  });

  it('con fecha valida llama a la mutation con ISO y limpia al terminar', async () => {
    scheduleMutate.mockImplementation((_payload, opts) => opts.onSuccess());
    const onScheduled = vi.fn();
    render(createElement(ScheduleMessageButton, { ...props, onScheduled, texto: ' hola ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Programar envío' }));
    fireEvent.change(screen.getByLabelText('Enviar el'), { target: { value: aLocal(2 * 60 * 60_000) } });
    fireEvent.click(screen.getByRole('button', { name: 'Programar' }));

    expect(scheduleMutate).toHaveBeenCalledTimes(1);
    const payload = scheduleMutate.mock.calls[0][0];
    expect(payload.contenido).toBe('hola');
    expect(payload.enviarEn).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    await waitFor(() => expect(onScheduled).toHaveBeenCalled());
  });
});

describe('ScheduledMessagesList', () => {
  it('no renderiza nada sin pendientes', () => {
    const { container } = render(createElement(ScheduledMessagesList, { idProyecto: 10, idConversacion: 5 }));
    expect(container).toBeEmptyDOMElement();
  });

  it('lista los pendientes y cancela con el boton accesible', () => {
    programados = [
      {
        idMensajeProgramado: 7,
        idConversacion: 5,
        contenido: 'Recordatorio',
        enviarEn: '2026-10-20T15:00:00.000Z',
        estado: 'PENDIENTE',
        creadoEn: '2026-10-16T12:00:00.000Z',
      },
    ];
    render(createElement(ScheduledMessagesList, { idProyecto: 10, idConversacion: 5 }));
    expect(screen.getByText('Recordatorio')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cancelar mensaje programado/ }));
    expect(cancelMutate).toHaveBeenCalledWith(7, expect.any(Object));
  });
});

describe('ScheduleMessageButton dentro del formulario del input', () => {
  // El popover va en un portal, pero los eventos de React burbujean por el arbol: sin stopPropagation,
  // programar tambien disparaba el envio normal del formulario padre (el mensaje salia al instante).
  it('programar no dispara el submit del formulario padre', () => {
    const envioPadre = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      createElement(
        'form',
        { onSubmit: envioPadre },
        createElement(ScheduleMessageButton, { idProyecto: 10, idConversacion: 5, onScheduled: vi.fn(), texto: 'hola' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Programar envío' }));
    fireEvent.change(screen.getByLabelText('Enviar el'), { target: { value: aLocal(10 * 60_000) } });
    fireEvent.click(screen.getByRole('button', { name: 'Programar' }));
    expect(scheduleMutate).toHaveBeenCalledTimes(1);
    expect(envioPadre).not.toHaveBeenCalled();
  });
});
