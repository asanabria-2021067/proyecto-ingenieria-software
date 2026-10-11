-- HU-176 (T-294): completa una base local sembrada con `npm run seed` hasta el
-- volumen de la medición base de T-290 (docs/qa/sprint9/secciones-lentas.md):
-- 236 tareas en el Sprint 4 del proyecto 5, 144 notificaciones del
-- administrador y 534 registros de bitácora.
--
-- Solo agrega filas nuevas, no modifica ni borra las del seed. Correr una sola
-- vez, sobre una COPIA de la base local, nunca contra staging ni producción:
--   psql -U postgres -d uvg_collab -f docs/qa/sprint9/datos-medicion.sql

BEGIN;

-- Tareas: copia el patrón de las tareas del seed del proyecto 5 (hito, rol,
-- estimación, puntos) y reparte estados y prioridades. La descripción de
-- ~200 caracteres aproxima el tamaño del tablero de la medición base.
INSERT INTO tarea (
  id_proyecto, id_hito, titulo_tarea, descripcion_tarea, estado_tarea, prioridad,
  creada_por, fecha_creacion, fecha_limite, id_rol_proyecto, tiempo_estimado_horas,
  orden, id_sprint, puntos_historia
)
SELECT
  5,
  plantilla.id_hito,
  'Tarea de carga ' || g,
  'Tarea generada para la medición de rendimiento de HU-176. Revisar requisitos, '
    || 'implementar el cambio acordado con el equipo, probarlo y documentar el resultado en la bitácora del proyecto.',
  (ARRAY['POR_HACER', 'EN_PROGRESO', 'EN_REVISION', 'HECHO'])[1 + g % 4]::"EstadoTarea",
  (ARRAY['BAJA', 'MEDIA', 'ALTA'])[1 + g % 3]::"Prioridad",
  plantilla.creada_por,
  now() - make_interval(mins => g::int),
  plantilla.fecha_limite,
  plantilla.id_rol_proyecto,
  plantilla.tiempo_estimado_horas,
  100 + g,
  4,
  plantilla.puntos_historia
FROM generate_series(1, 236 - (SELECT count(*) FROM tarea WHERE id_proyecto = 5)) AS g
CROSS JOIN LATERAL (
  SELECT *
  FROM tarea
  WHERE id_proyecto = 5 AND titulo_tarea NOT LIKE 'Tarea de carga %'
  ORDER BY id_tarea
  OFFSET (g % 6)
  LIMIT 1
) AS plantilla;

-- Notificaciones del administrador (un tercio leídas).
INSERT INTO notificacion (
  id_usuario, tipo_notificacion, titulo_notificacion, mensaje_notificacion, datos_json, creada_en, leida_en
)
SELECT
  u.id_usuario,
  'TAREA_ACTUALIZADA',
  'Aviso de carga ' || g,
  'Notificación generada para la medición de rendimiento de HU-176.',
  jsonb_build_object('projectId', 5),
  now() - make_interval(mins => g::int),
  CASE WHEN g % 3 = 0 THEN now() END
FROM usuario AS u
CROSS JOIN generate_series(
  1,
  144 - (SELECT count(*) FROM notificacion n JOIN usuario a USING (id_usuario) WHERE a.correo = 'admin@uvg.edu.gt')
) AS g
WHERE u.correo = 'admin@uvg.edu.gt';

-- Bitácora: cambios de estado de las tareas de carga, con el mismo
-- detalle_json que escribe TasksService.
INSERT INTO bitacora_auditoria (id_usuario, accion, tipo_objeto, id_objeto, detalle_json, ip_origen, fecha_evento)
SELECT
  t.creada_por,
  'TASK_STATUS_CHANGED',
  'TAREA',
  t.id_tarea::text,
  jsonb_build_object(
    'idSprint', 4,
    'idProyecto', 5,
    'valorNuevo', jsonb_build_object('estadoTarea', 'EN_PROGRESO'),
    'valorAnterior', jsonb_build_object('estadoTarea', 'POR_HACER')
  ),
  '127.0.0.1',
  now() - make_interval(mins => g::int)
FROM generate_series(1, 534 - (SELECT count(*) FROM bitacora_auditoria)) AS g
JOIN LATERAL (
  SELECT id_tarea, creada_por
  FROM tarea
  WHERE id_proyecto = 5 AND titulo_tarea LIKE 'Tarea de carga %'
  ORDER BY id_tarea
  OFFSET (g % 230)
  LIMIT 1
) AS t ON true;

COMMIT;
