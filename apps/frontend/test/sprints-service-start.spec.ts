import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/api/client', () => ({ apiFetch: apiFetchMock }));

import { startSprint } from '../lib/services/sprints';

beforeEach(() => apiFetchMock.mockReset());

describe('startSprint (service)', () => {
  it('envía únicamente fechaFinPlaneada en el cuerpo del POST', async () => {
    apiFetchMock.mockResolvedValue({ idSprint: 1 });

    await startSprint(32, '2026-10-20');

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [ruta, opciones] = apiFetchMock.mock.calls[0];
    expect(ruta).toBe('/proyectos/32/sprints');
    expect(opciones.method).toBe('POST');
    expect(JSON.parse(opciones.body)).toEqual({ fechaFinPlaneada: '2026-10-20' });
  });

  it('nunca incluye fechaInicio: la fija el servidor', async () => {
    apiFetchMock.mockResolvedValue({ idSprint: 1 });

    await startSprint(32, '2026-10-20');

    expect(Object.keys(JSON.parse(apiFetchMock.mock.calls[0][1].body))).toEqual(['fechaFinPlaneada']);
  });
});
