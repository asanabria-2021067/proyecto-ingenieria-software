import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAdminMeetingDto } from '../src/events/dto/create-admin-meeting.dto';
import { UpdateAdminMeetingDto } from '../src/events/dto/update-admin-meeting.dto';

/** Mismas opciones que el ValidationPipe global de main.ts. */
async function errores<T extends object>(clase: new () => T, cuerpo: Record<string, unknown>): Promise<string[]> {
  const instancia = plainToInstance(clase, cuerpo, { enableImplicitConversion: true });
  const resultado = await validate(instancia, { whitelist: true, forbidNonWhitelisted: true });
  return resultado.map((e) => e.property);
}

const VALIDA = {
  tituloEvento: 'Seguimiento de cierre',
  fechaInicio: '2031-03-10T15:00:00.000Z',
  fechaFin: '2031-03-10T16:00:00.000Z',
  modalidad: 'VIRTUAL',
  linkSesion: 'https://meet.google.com/abc-defg-hij',
  proyectos: [3, 4],
};

describe('HU-195 · CreateAdminMeetingDto', () => {
  it('acepta una reunión válida con uno o varios proyectos y política opcional', async () => {
    expect(await errores(CreateAdminMeetingDto, VALIDA)).toEqual([]);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, proyectos: [9], politicaEdicion: 'ADMINISTRADORES_SELECCIONADOS', editores: [2] })).toEqual([]);
  });

  it('rechaza campos que fija el servidor: creador, tipo, invitados, rolesDestino e idReunion', async () => {
    for (const campo of ['idCreador', 'tipoEvento', 'invitados', 'rolesDestino', 'idReunion']) {
      expect(await errores(CreateAdminMeetingDto, { ...VALIDA, [campo]: campo === 'tipoEvento' ? 'OTRO' : 1 }), campo).toEqual([campo]);
    }
  });

  it('proyectos: obligatoria, al menos uno, sin repetidos, enteros positivos y como máximo 50', async () => {
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, proyectos: undefined })).toEqual(['proyectos']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, proyectos: [] })).toEqual(['proyectos']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, proyectos: [3, 3] })).toEqual(['proyectos']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, proyectos: [3, 1.5] })).toEqual(['proyectos']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, proyectos: [0] })).toEqual(['proyectos']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, proyectos: Array.from({ length: 51 }, (_, i) => i + 1) })).toEqual(['proyectos']);
  });

  it('la modalidad es obligatoria y exige su enlace o su ubicación', async () => {
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, modalidad: undefined })).toEqual(['modalidad']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, linkSesion: undefined })).toEqual(['linkSesion']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, modalidad: 'PRESENCIAL', linkSesion: undefined })).toEqual(['ubicacionLat', 'ubicacionLng']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, modalidad: 'MIXTA', ubicacionLat: 14.6, ubicacionLng: -90.5 })).toEqual([]);
  });

  it('el enlace sigue la política única de eventos: nada de javascript: ni localhost', async () => {
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, linkSesion: 'javascript:alert(1)' })).toEqual(['linkSesion']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, linkSesion: 'http://localhost:3000' })).toEqual(['linkSesion']);
  });

  it('límites de título, descripción, antelación, fechas y editores', async () => {
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, tituloEvento: '   ' })).toEqual(['tituloEvento']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, tituloEvento: 'x'.repeat(201) })).toEqual(['tituloEvento']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, descripcionEvento: 'x'.repeat(5001) })).toEqual(['descripcionEvento']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, antelacionMinutos: 10081 })).toEqual(['antelacionMinutos']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, fechaInicio: 'mañana' })).toEqual(['fechaInicio']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, politicaEdicion: 'SUPERADMIN' })).toEqual(['politicaEdicion']);
    expect(await errores(CreateAdminMeetingDto, { ...VALIDA, editores: [2, 2] })).toEqual(['editores']);
  });
});

describe('HU-195 · UpdateAdminMeetingDto', () => {
  it('exige la versión leída; el resto es parcial', async () => {
    expect(await errores(UpdateAdminMeetingDto, { tituloEvento: 'Nuevo' })).toEqual(['version']);
    expect(await errores(UpdateAdminMeetingDto, { version: 0 })).toEqual(['version']);
    expect(await errores(UpdateAdminMeetingDto, { version: 3, tituloEvento: 'Nuevo' })).toEqual([]);
  });

  it('proyectos, si viene, reemplaza el conjunto: nunca vacío ni con repetidos', async () => {
    expect(await errores(UpdateAdminMeetingDto, { version: 1, proyectos: [] })).toEqual(['proyectos']);
    expect(await errores(UpdateAdminMeetingDto, { version: 1, proyectos: [4, 4] })).toEqual(['proyectos']);
    expect(await errores(UpdateAdminMeetingDto, { version: 1, proyectos: [4] })).toEqual([]);
  });

  it('editores: [] vacía la lista (válido); null no se admite', async () => {
    expect(await errores(UpdateAdminMeetingDto, { version: 1, editores: [] })).toEqual([]);
    expect(await errores(UpdateAdminMeetingDto, { version: 1, editores: null })).toEqual(['editores']);
  });

  it('null limpia ubicación o enlace solo cuando la modalidad enviada ya no los usa', async () => {
    expect(await errores(UpdateAdminMeetingDto, { version: 1, modalidad: 'VIRTUAL', linkSesion: 'https://meet.google.com/abc-defg-hij', ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null })).toEqual([]);
    expect(await errores(UpdateAdminMeetingDto, { version: 1, modalidad: 'VIRTUAL', linkSesion: null })).toEqual(['linkSesion']);
  });

  it('tampoco acepta campos del servidor', async () => {
    expect(await errores(UpdateAdminMeetingDto, { version: 1, idCreador: 5 })).toEqual(['idCreador']);
    expect(await errores(UpdateAdminMeetingDto, { version: 1, invitados: [5] })).toEqual(['invitados']);
  });
});
