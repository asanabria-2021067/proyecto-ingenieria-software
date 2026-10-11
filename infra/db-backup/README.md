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
- **Sin credenciales a la vista:** la contraseña llega por `PGPASSWORD` o
  `PGPASSFILE`, nunca por argumentos, y el script no imprime ni registra
  credenciales. El archivo de configuración debe tener permisos 600 o 400.
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

## Pruebas

```bash
bash infra/db-backup/test/pg-backup-contract.sh
```

No necesita PostgreSQL: usa un `pg_dump` y un `pg_restore` falsos para
provocar cada fallo.
