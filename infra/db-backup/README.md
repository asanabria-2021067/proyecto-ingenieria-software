# Respaldos de PostgreSQL (T-313)

`pg-backup.sh` hace un volcado de la base con `pg_dump` en formato custom
(`-Fc`) y lo deja en un directorio del **host**, fuera del contenedor de la
base y fuera del repositorio.

Restaurar un respaldo completo no es parte de esta tarea (T-314).

## Qué garantiza

- **Un volcado fallido nunca parece un respaldo.** Se escribe en un temporal
  oculto, se verifica y solo entonces se renombra. Si `pg_dump` falla, el
  temporal se borra y los respaldos anteriores no se tocan.
- **Verificación antes de aceptar:** el archivo no está vacío, empieza por la
  firma `PGDMP` y `pg_restore --list` reconoce su contenido.
- **Sin credenciales a la vista:** con `PG_CONTAINER` no hace falta contraseña
  (`pg_dump` entra por el socket local del contenedor). Sin él, llega por
  `PGPASSWORD` o `PGPASSFILE`, nunca por argumentos. El script no imprime ni
  registra credenciales y exige permisos 600 o 400 en el archivo de
  configuración.
- **Un respaldo a la vez** (`flock`): una ejecución solapada termina con 75.
- **Permisos:** directorio 700, archivos 600.
- **No escribe dentro de un repositorio Git:** los respaldos contienen datos
  personales.
- Cada respaldo lleva su suma `sha256` al lado.

## Uso

```bash
install -d -m 700 /etc/uvgenius
install -m 600 infra/db-backup/backup.example.env /etc/uvgenius/backup.env
# editar /etc/uvgenius/backup.env con los valores reales
infra/db-backup/pg-backup.sh /etc/uvgenius/backup.env
```

Resultado: `BACKUP_DIR/<prefijo>_<base>_<AAAAMMDDTHHMMSSZ>.dump` y su
`.sha256`. La hora del nombre es UTC.

| Código | Significado |
|---:|---|
| 0 | Respaldo creado y verificado |
| 64 | Configuración incompleta o insegura |
| 73 | Destino inválido, sin permisos o sin espacio |
| 74 | Falló el volcado o su verificación |
| 75 | Ya hay otro respaldo en curso |

## Rotación

Después de cada respaldo verificado se borran los respaldos propios con más de
`BACKUP_RETENTION_DAYS` días (7 por defecto), junto con su `.sha256`.

- **Si el volcado o su verificación fallan no se borra nada:** el último
  respaldo válido se conserva aunque ya haya vencido.
- Solo se borran archivos con el nombre exacto que genera el script
  (`<prefijo>_<base>_<marca de tiempo>.dump`). Respaldos de otra base, con otro
  prefijo, copias manuales y cualquier otro archivo del directorio no se tocan.
- La antigüedad se mide por la fecha de modificación del archivo.
- También se limpian los temporales de más de un día que haya dejado una
  ejecución interrumpida.

Con un respaldo diario y 7 días de retención, el directorio mantiene 7 u 8
respaldos. Antes de empezar, el script exige `BACKUP_MIN_FREE_MB` de espacio
libre; conviene fijarlo por encima del tamaño de un respaldo.

## Programación diaria

`pg-backup.cron.example` es la plantilla: respaldo diario a las **02:30 de
Guatemala** y, media hora después, `verify-backup.sh` comprueba que existe un
respaldo reciente e íntegro.

> **Estado: no instalado.** Este repositorio solo entrega el paquete. Instalar
> el cron en el servidor requiere acceso y autorización de quien administra la
> infraestructura, y no se ha hecho.

Guatemala es UTC−6 todo el año. La plantilla asume un servidor con reloj en UTC
(08:30 y 09:00); si `timedatectl` muestra `America/Guatemala`, cambiar las
horas a 2 y 3.

### Instalación manual

Como administrador del servidor, con el repositorio en `/opt/uvgenius`:

```bash
# 1. Usuario sin sesión que ejecuta el respaldo; necesita hablar con Docker.
useradd --system --shell /usr/sbin/nologin uvgbackup
usermod -aG docker uvgbackup

# 2. Configuración, directorio de respaldos y de registro: solo de ese usuario.
install -d -m 700 -o uvgbackup -g uvgbackup /etc/uvgenius /var/backups/uvgenius/postgres /var/log/uvgenius
install -m 600 -o uvgbackup -g uvgbackup /opt/uvgenius/infra/db-backup/backup.example.env /etc/uvgenius/backup.env
#    editar /etc/uvgenius/backup.env con los valores reales

# 3. Probar a mano antes de programar.
sudo -u uvgbackup /opt/uvgenius/infra/db-backup/pg-backup.sh /etc/uvgenius/backup.env
sudo -u uvgbackup /opt/uvgenius/infra/db-backup/verify-backup.sh /etc/uvgenius/backup.env

# 4. Programar.
install -m 644 -o root -g root /opt/uvgenius/infra/db-backup/pg-backup.cron.example /etc/cron.d/uvgenius-pg-backup
```

Pertenecer al grupo `docker` equivale a ser administrador del servidor. Si eso
no es aceptable, dejar `PG_CONTAINER` vacío y usar un `pg_dump` del host de la
misma versión mayor que el servidor, contra `PGHOST`/`PGPORT`.

### Rotación del registro

`/etc/logrotate.d/uvgenius-pg-backup`:

```
/var/log/uvgenius/pg-backup.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    create 600 uvgbackup uvgbackup
}
```

### Aviso de fallos

Las dos tareas escriben un error en el registro del sistema cuando fallan:

```bash
journalctl -t pg-backup -p err --since "-2 days"
```

`verify-backup.sh` detecta también el caso en que el respaldo ni siquiera
llegó a ejecutarse (servidor apagado, cron detenido): termina con 1 si el
último respaldo tiene más de `BACKUP_MAX_AGE_HOURS` horas (26 por defecto),
falta, está vacío o no coincide con su `sha256`. No hay aviso por correo ni por
chat: conectar `logger` a un canal de alertas queda para quien opere el
servidor.

### Reversión

```bash
rm /etc/cron.d/uvgenius-pg-backup /etc/logrotate.d/uvgenius-pg-backup
```

Quitar la programación no borra los respaldos ya hechos.

### Cómo comprobar que quedó activo

```bash
ls -l /etc/cron.d/uvgenius-pg-backup
ls -l /var/backups/uvgenius/postgres | tail -n 4     # al día siguiente
tail -n 5 /var/log/uvgenius/pg-backup.log
```

## Pruebas

```bash
bash infra/db-backup/test/pg-backup-contract.sh
```

No necesita PostgreSQL: usa un `pg_dump` y un `pg_restore` falsos para
provocar cada fallo. Cubre el volcado, la rotación, `verify-backup.sh` y la
sintaxis de la plantilla de cron.

El mismo contrato corre con la suite unitaria del backend
(`apps/backend/test/fg13-db-backup-contract.spec.ts`), y por tanto en CI.

### Con PostgreSQL real

```bash
bash infra/db-backup/test/pg-backup-integration.sh
```

Levanta su propio contenedor de PostgreSQL (datos en memoria, sin puertos
publicados), crea una base de prueba, la respalda con el script real y borra el
contenedor al terminar. No se conecta a ninguna otra base. Requiere Docker, así
que no corre en CI: se ejecuta a mano.

Comprueba que el respaldo queda en el host y no dentro del contenedor, que
`pg_restore --list` encuentra las tablas, sus datos y sus claves foráneas, que
una base inexistente o caída termina en 74 sin dejar archivos, y que la
rotación conserva los respaldos cuando el volcado falla.

Última ejecución registrada: 2026-10-11, `postgres:17-alpine`, 24 de 24.

## Estado

| Parte | Estado |
|---|---|
| Script de volcado, rotación y vigilancia | Probados (contrato y PostgreSQL desechable) |
| Plantilla de cron y guía de instalación | Listas |
| Cron instalado en el servidor de producción | **No instalado ni verificado** |
| Primer respaldo real de producción | **No realizado** |
| Restauración de un respaldo | Fuera de alcance (T-314) |

La tarea no está completa en operación hasta que alguien con acceso al servidor
instale la programación y confirme, al día siguiente, que existe el respaldo.
