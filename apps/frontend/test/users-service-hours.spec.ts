import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMisHoras, type MisHorasView } from '../lib/services/users';

// HU-158 (T-232): el servicio usa el cliente real (`apiFetch`) sobre un
// `fetch` simulado, para fijar la URL, el método y el payload tal como viajan.

const payload: MisHorasView = {
  idUsuario: 7,
  requisitos: { horasBecaRequeridas: 40, horasExtensionRequeridas: null },
  totales: {
    registradasEnProyectosAbiertos: '12.50',
    legacyEnProyectosAbiertos: '2.00',
    propuestasPendientes: '0.00',
    acreditadas: '22.25',
  },
  porTipo: [
    { tipoProyecto: 'ACADEMICO_HORAS_BECA', registradasEnProyectosAbiertos: '12.50', propuestasPendientes: '0.00', acreditadas: '22.25' },
    { tipoProyecto: 'EXTRACURRICULAR_EXTENSION', registradasEnProyectosAbiertos: '0.00', propuestasPendientes: '0.00', acreditadas: '0.00' },
    { tipoProyecto: 'ACADEMICO_EXPERIENCIA', registradasEnProyectosAbiertos: '0.00', propuestasPendientes: '0.00', acreditadas: '0.00' },
  ],
  proyectos: [
    {
      idProyecto: 32,
      tituloProyecto: 'Bienestar',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      estadoProyecto: 'EN_PROGRESO',
      abierto: true,
      eliminado: false,
      esLider: false,
      participacionActiva: true,
      registradas: '12.50',
      legacy: '2.00',
      propuestasPendientes: '0.00',
      acreditadas: '0.00',
      tareasDistintas: 1,
      tareas: [
        {
          idTarea: 101,
          tituloTarea: 'Agenda',
          estadoTarea: 'EN_PROGRESO',
          eliminada: false,
          sprint: { idSprint: 11, numero: 2, estado: 'ACTIVO' },
          registradas: '12.50',
          legacy: '2.00',
        },
      ],
    },
  ],
};

const respuesta = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('getMisHoras', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('hace un GET a /api/usuarios/me/horas con la cookie de sesión, sin cuerpo ni id de usuario', async () => {
    fetchMock.mockResolvedValue(respuesta(200, payload));

    await getMisHoras();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opciones] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/usuarios\/me\/horas$/);
    expect(opciones.method ?? 'GET').toBe('GET');
    expect(opciones.credentials).toBe('include');
    expect(opciones.body).toBeUndefined();
    // La identidad sale de la sesión: la función no recibe ningún id.
    expect(getMisHoras).toHaveLength(0);
  });

  it('devuelve el payload tal cual, con los importes como strings decimales sin convertir', async () => {
    fetchMock.mockResolvedValue(respuesta(200, payload));

    const vista = await getMisHoras();

    expect(vista).toEqual(payload);
    expect(vista.totales.registradasEnProyectosAbiertos).toBe('12.50');
    expect(vista.totales.propuestasPendientes).toBe('0.00');
    expect(vista.proyectos[0].tareas[0].legacy).toBe('2.00');
    expect(typeof vista.totales.acreditadas).toBe('string');
  });

  it('propaga el error del backend con su estado y el endpoint para que la página lo muestre', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValue(respuesta(500, { statusCode: 500, message: 'El proveedor de horas no está disponible.' }));

    const error = (await getMisHoras().catch((e: unknown) => e)) as Error & {
      statusCode?: number;
      method?: string;
      endpoint?: string;
    };

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('El proveedor de horas no está disponible.');
    expect(error.statusCode).toBe(500);
    expect(error.method).toBe('GET');
    expect(error.endpoint).toBe('/usuarios/me/horas');
  });
});
