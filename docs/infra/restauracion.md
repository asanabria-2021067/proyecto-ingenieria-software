# Restauración de un respaldo de PostgreSQL (T-314)

Explica cómo usar `infra/db-backup/pg-restore.sh` para restaurar un respaldo
hecho con `pg-backup.sh` (ver `infra/db-backup/README.md`). Pensado para
quien tenga que hacerlo en una emergencia y no haya escrito el script.

## Cuándo se usa

- **Para practicar o verificar un respaldo**, sin arriesgar nada: se restaura
  en una base nueva y temporal, nunca sobre una base real.
- **Para recuperar producción** después de un borrado accidental, una
  migración que salió mal, o cualquier incidente que deje la base en mal
  estado y haga falta volver a un punto anterior.

En ambos casos el script primero comprueba que el respaldo no esté dañado
(suma `sha256`) y aborta si no coincide.

## Dónde están los respaldos en la VM

- Archivos: `/var/backups/uvgenius/postgres/<prefijo>_<base>_<fecha>.dump` y su
  `.sha256` al lado.
- Configuración (usuario, base, credenciales): `/etc/uvgenius/backup.env`.
- Registro de los respaldos diarios: `/var/log/uvgenius/pg-backup.log`.

## Restaurar en una base de prueba (sin riesgo)

Esto es el modo por defecto: crea una base nueva llamada
`uvg_collab_restore_<fecha>` y restaura ahí. No toca la base real.

```bash
infra/db-backup/pg-restore.sh /var/backups/uvgenius/postgres/uvgenius_uvg_collab_20261012T023000Z.dump /etc/uvgenius/backup.env
```

Al terminar imprime cuántas filas quedaron en `usuario`, `proyecto`, `tarea`,
`sprint`, `notificacion` y `actividad_proyecto`, y el nombre de la base nueva
para revisarla a mano (por ejemplo `psql -d uvg_collab_restore_20261012T023000Z`).
Cuando ya no se necesite:

```bash
dropdb -U <usuario> uvg_collab_restore_20261012T023000Z
```

## Restaurar sobre producción (reemplaza los datos actuales)

Esto **borra y reemplaza** el contenido de la base productiva. Hace falta:

1. El flag `--sobre-produccion`.
2. Escribir, exactamente, la frase que el script pide (incluye el nombre de
   la base, para evitar restaurar sobre la base equivocada por error de
   copiar y pegar).
3. El script hace primero, automáticamente, un respaldo de seguridad de la
   base actual con `pg-backup.sh` (usando el mismo archivo de configuración).
   Si ese respaldo falla, no se restaura nada.

Procedimiento completo, como administrador del servidor:

```bash
# 1. Detener el backend: nadie debe escribir en la base durante la restauración.
docker compose stop backend

# 2. Restaurar (pide confirmación escrita; antes hace un respaldo de seguridad).
infra/db-backup/pg-restore.sh /var/backups/uvgenius/postgres/uvgenius_uvg_collab_20261012T023000Z.dump \
  /etc/uvgenius/backup.env --sobre-produccion

# 3. Aplicar las migraciones de Prisma (el respaldo puede ser de una versión
#    anterior del esquema).
npx prisma migrate deploy

# 4. Levantar el backend otra vez.
docker compose up -d backend
```

Si el paso 2 termina en un código distinto de 0, **no se siguió con la
restauración**: revisar el mensaje de error antes de reintentar. El respaldo
de seguridad que el script hizo en el paso 2 queda disponible para volver
atrás si algo salió mal.

## Códigos de salida

| Código | Significado |
|---:|---|
| 0 | Restauración completa y verificada |
| 64 | Configuración incompleta, flags inválidos, o confirmación faltante/incorrecta |
| 73 | No se pudo crear o abrir la base destino |
| 74 | Falló la restauración o la verificación del respaldo (incluye `.sha256` que no coincide) |
| 75 | Ya hay otra restauración de ese mismo respaldo en curso |

## Pruebas

```bash
bash infra/db-backup/test/pg-restore-contract.sh      # sin PostgreSQL ni Docker; corre en CI
bash infra/db-backup/test/pg-restore-integration.sh   # PostgreSQL real y desechable; a mano
```

El contrato (31 comprobaciones) verifica entre otras cosas: que el respaldo
se verifica antes de tocar cualquier base, que por defecto se crea una base
nueva `uvg_collab_restore_<fecha>`, que `--sobre-produccion` exige el flag,
la confirmación exacta y el respaldo de seguridad previo, y que una
restauración simultánea del mismo respaldo termina en 75.

### Prueba con PostgreSQL real

`pg-restore-integration.sh` levanta su propio contenedor desechable
(`postgres:17-alpine`), crea las seis tablas principales con datos
sintéticos, hace un respaldo real con `pg-backup.sh`, restaura ese respaldo
en una base nueva con `pg-restore.sh` y compara el conteo de filas contra el
original. Borra la base temporal y el contenedor al terminar.

Última ejecución registrada: 2026-10-13, `postgres:17-alpine`, **13 de 13**.
Tiempo total de la prueba (crear el contenedor, sembrar los datos, respaldar,
restaurar y comparar): **8 segundos**. Solo la restauración
(`pg-restore.sh`, sin contar el respaldo ni la siembra de datos) tomó
alrededor de 2-3 segundos para este volumen de datos.

Conteo de filas comparado (original vs. restaurado — coincidieron en los seis):

| Tabla | Filas |
|---|---:|
| usuario | 120 |
| proyecto | 40 |
| tarea | 300 |
| sprint | 80 |
| notificacion | 500 |
| actividad_proyecto | 60 |
