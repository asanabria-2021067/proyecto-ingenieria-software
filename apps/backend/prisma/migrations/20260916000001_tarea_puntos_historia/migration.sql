-- Story points de la tarea (nullable): HU-160/T-240 exige que la velocidad y el
-- eje del burndown se expresen en story points, no en horas ni en conteo de
-- tareas. Una tarea sin puntos asignados aporta 0 al eje de puntos pero sigue
-- contando en el eje de "número de tareas".
ALTER TABLE "tarea" ADD COLUMN "puntos_historia" INTEGER;
