import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_GROUP_IDS,
  NOTIFICATION_GROUP_LABEL,
  NOTIFICATION_TYPE_PRESENTATION,
  groupNotificationPreferences,
} from '../lib/notifications/preference-groups';

/**
 * FG03-C01 (T-328). Caracteriza el contrato EXISTENTE de preferencias por tipo
 * (HU-185) leyéndolo del backend del repositorio, sin modificarlo, y fija cómo
 * lo presenta el perfil.
 */

const backend = (ruta: string) => readFileSync(join(__dirname, '../../backend', ruta), 'utf8');

/** Valores de `enum TipoNotificacion`, en el orden del schema. */
const TIPOS_BACKEND = (() => {
  const schema = backend('prisma/schema.prisma');
  const cuerpo = schema.slice(schema.indexOf('enum TipoNotificacion {'));
  return cuerpo
    .slice(cuerpo.indexOf('{') + 1, cuerpo.indexOf('}'))
    .split('\n')
    .map((linea) => linea.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
})();

/** Lo que responde GET /notificaciones/preferencias para un usuario sin filas guardadas. */
const porDefecto = () => TIPOS_BACKEND.map((tipo) => ({ tipo, activa: true }));

describe('FG03-C01: contrato existente de preferencias (backend sin cambios)', () => {
  const controlador = backend('src/notifications/notifications.controller.ts');
  const servicio = backend('src/notifications/notifications.service.ts');
  const dto = backend('src/notifications/dto/update-preferencia-notificacion.dto.ts');

  it('el enum se pudo leer del schema real', () => {
    expect(TIPOS_BACKEND.length).toBeGreaterThanOrEqual(41);
    expect(TIPOS_BACKEND.every((tipo) => /^[A-Z][A-Z_]+$/.test(tipo))).toBe(true);
    expect(new Set(TIPOS_BACKEND).size).toBe(TIPOS_BACKEND.length);
  });

  it('expone GET y PUT individuales en notificaciones/preferencias, tras el guard de sesión', () => {
    expect(controlador).toContain("@Controller('notificaciones')");
    expect(controlador).toContain('@UseGuards(JwtAuthGuard)');
    expect(controlador).toMatch(/@Get\('preferencias'\)\s+getPreferences\(@CurrentUser\(\) user/);
    expect(controlador).toMatch(/@Put\('preferencias'\)\s+updatePreference\(/);
    // El usuario sale de la sesión: no hay id de usuario en la ruta ni en el cuerpo.
    expect(controlador).toContain('this.notificationsService.updatePreference(user.userId, dto.tipo, dto.activa)');
    expect(controlador).not.toMatch(/preferencias\/:|preferencias\/lote|preferencias\/grupo/);
  });

  it('el PUT recibe exactamente { tipo, activa }: un tipo del enum y un booleano', () => {
    expect(dto).toMatch(/@IsEnum\(TipoNotificacion\)\s+tipo!: TipoNotificacion;/);
    expect(dto).toMatch(/@IsBoolean\(\)\s+activa!: boolean;/);
    expect(dto.match(/^\s+\w+!: /gm)).toHaveLength(2);
  });

  it('el GET devuelve todos los tipos del enum y un tipo sin fila guardada cuenta como activo', () => {
    expect(servicio).toContain('Object.values(TipoNotificacion).map((tipo) => ({');
    expect(servicio).toContain('activa: estado.get(tipo) ?? true,');
  });

  it('el backend no declara tipos obligatorios: todo tipo admite desactivarse', () => {
    for (const fuente of [controlador, servicio, dto]) {
      expect(fuente).not.toMatch(/obligatori|mandatory|noDesactivable|TIPOS_FIJOS/i);
    }
  });

  it('no existe un tipo de notificación de chat', () => {
    expect(TIPOS_BACKEND.filter((tipo) => /CHAT|MENSAJE_DIRECTO|MENSAJE_CHAT/.test(tipo))).toEqual([]);
    // El chat no crea notificaciones: no usa el servicio ni el enum.
    const chat = backend('src/chat/chat.service.ts') + backend('src/chat/chat.gateway.ts');
    expect(chat).not.toMatch(/TipoNotificacion|createNotification|notificationsService/i);
  });
});

describe('FG03-C01: catálogo de presentación', () => {
  it('describe exactamente los tipos del enum: ninguno falta y ninguno sobra', () => {
    expect(Object.keys(NOTIFICATION_TYPE_PRESENTATION).sort()).toEqual([...TIPOS_BACKEND].sort());
  });

  it('cada tipo tiene etiqueta y descripción propias, en un grupo que existe', () => {
    const etiquetas = new Set<string>();
    for (const [tipo, { grupo, etiqueta, descripcion }] of Object.entries(NOTIFICATION_TYPE_PRESENTATION)) {
      expect(NOTIFICATION_GROUP_IDS, tipo).toContain(grupo);
      expect(grupo, tipo).not.toBe('otras');
      expect(etiqueta.trim().length, tipo).toBeGreaterThan(3);
      expect(descripcion.trim().length, tipo).toBeGreaterThan(8);
      expect(etiqueta, tipo).not.toMatch(/[A-Z]{2,}_/);
      etiquetas.add(etiqueta);
    }
    expect(etiquetas.size).toBe(TIPOS_BACKEND.length);
  });

  it('ningún grupo ni etiqueta promete «Chat»', () => {
    const textos = [
      ...Object.values(NOTIFICATION_GROUP_LABEL).flatMap((g) => [g.titulo, g.descripcion]),
      ...Object.values(NOTIFICATION_TYPE_PRESENTATION).flatMap((t) => [t.etiqueta, t.descripcion]),
    ];
    expect(textos.filter((texto) => /\bchat\b/i.test(texto))).toEqual([]);
    expect(NOTIFICATION_GROUP_IDS).not.toContain('chat');
  });

  it('el catálogo no guarda datos de autorización ni marca tipos como obligatorios', () => {
    for (const presentacion of Object.values(NOTIFICATION_TYPE_PRESENTATION)) {
      expect(Object.keys(presentacion).sort()).toEqual(['descripcion', 'etiqueta', 'grupo']);
    }
  });
});

describe('FG03-C01: groupNotificationPreferences', () => {
  it('muestra cada tipo de la respuesta exactamente una vez', () => {
    const grupos = groupNotificationPreferences(porDefecto());
    const tipos = grupos.flatMap((grupo) => grupo.items.map((item) => item.tipo));
    expect(tipos.sort()).toEqual([...TIPOS_BACKEND].sort());
  });

  it('usa los grupos en un orden estable y omite «Otras» cuando no hay tipos desconocidos', () => {
    const grupos = groupNotificationPreferences(porDefecto());
    expect(grupos.map((grupo) => grupo.id)).toEqual(['tareas', 'postulaciones', 'proyectos', 'horas', 'recordatorios', 'contactos', 'cuenta']);
    expect(grupos.map((grupo) => grupo.titulo)).toEqual([
      'Tareas e hitos',
      'Postulaciones y equipo',
      'Proyectos',
      'Horas y reconocimiento',
      'Recordatorios y calendario',
      'Red de contactos',
      'Cuenta y seguridad',
    ]);
  });

  it('sin filas guardadas todo llega activo, y así se muestra', () => {
    const items = groupNotificationPreferences(porDefecto()).flatMap((grupo) => grupo.items);
    expect(items.every((item) => item.activa && item.conocido)).toBe(true);
  });

  it('refleja el estado de cada tipo sin tocar el de los demás', () => {
    const preferencias = porDefecto().map((p) => (p.tipo === 'TAREA_ASIGNADA' ? { ...p, activa: false } : p));
    const items = groupNotificationPreferences(preferencias).flatMap((grupo) => grupo.items);
    expect(items.filter((item) => !item.activa).map((item) => item.tipo)).toEqual(['TAREA_ASIGNADA']);
  });

  it('dentro de cada grupo conserva el orden en que el backend entrega los tipos', () => {
    const [tareas] = groupNotificationPreferences(porDefecto());
    const enBackend = TIPOS_BACKEND.filter((tipo) => NOTIFICATION_TYPE_PRESENTATION[tipo]?.grupo === 'tareas');
    expect(tareas.items.map((item) => item.tipo)).toEqual(enBackend);
  });

  it('un tipo que el backend añada después no se oculta: va a «Otras notificaciones» con un nombre legible', () => {
    const grupos = groupNotificationPreferences([...porDefecto(), { tipo: 'MENSAJE_CHAT', activa: false }, { tipo: 'TIPO_FUTURO', activa: true }]);
    const otras = grupos.at(-1);
    expect(otras).toMatchObject({ id: 'otras', titulo: 'Otras notificaciones' });
    expect(otras?.items).toEqual([
      { tipo: 'MENSAJE_CHAT', activa: false, etiqueta: 'Mensaje chat', descripcion: 'Tipo de notificación añadido recientemente.', conocido: false },
      { tipo: 'TIPO_FUTURO', activa: true, etiqueta: 'Tipo futuro', descripcion: 'Tipo de notificación añadido recientemente.', conocido: false },
    ]);
  });

  it('solo muestra lo que el backend entrega: no completa tipos ausentes', () => {
    const grupos = groupNotificationPreferences([{ tipo: 'RECORDATORIO_EVENTO', activa: true }]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].items.map((item) => item.tipo)).toEqual(['RECORDATORIO_EVENTO']);
  });

  it.each([
    ['lista vacía', []],
    ['tipo vacío', [{ tipo: '', activa: true }]],
    ['tipo no textual', [{ tipo: 7 as never, activa: true }]],
  ])('%s no produce grupos', (_nombre, preferencias) => {
    expect(groupNotificationPreferences(preferencias)).toEqual([]);
  });

  it('un tipo repetido se muestra una sola vez y un valor no booleano cuenta como inactivo', () => {
    const grupos = groupNotificationPreferences([
      { tipo: 'TAREA_ASIGNADA', activa: 'true' as never },
      { tipo: 'TAREA_ASIGNADA', activa: true },
      { tipo: 'constructor', activa: true },
    ]);
    expect(grupos.map((grupo) => [grupo.id, grupo.items.map((item) => `${item.tipo}:${item.activa}`)])).toEqual([
      ['tareas', ['TAREA_ASIGNADA:false']],
      ['otras', ['constructor:true']],
    ]);
  });
});
