# Asociaciones oficiales y juntas: API (ASO, parte 1)

Una asociacion oficial no es una organizacion: solo la gestiona el administrador del sistema. Todas las rutas llevan prefijo `/api`, `JwtAuthGuard` y verifican permisos en servidor.

## Modelo

- `Asociacion`: nombre unico, logo (URL de Cloudinary), descripcion, `archivada`.
- `AsociacionCarrera`: carreras que representa (al menos una).
- `JuntaAsociacion`: un usuario por cargo y un cargo por usuario en cada asociacion. Cargos: `PRESIDENTE`, `VICEPRESIDENTE`, `SECRETARIO`, `TESORERO`, `VOCAL`. Nivel de permiso: `ADMINISTRADOR`, `EDITOR`, `LECTURA`.
- `Proyecto.idAsociacion` (opcional): proyecto publicado a nombre de la asociacion.

Nivel por defecto segun cargo (el admin puede cambiarlo por integrante):

| Cargo | Nivel |
| --- | --- |
| Presidente | ADMINISTRADOR |
| Vicepresidente, Secretario, Tesorero | EDITOR |
| Vocal | LECTURA |

Cambiar el cargo sin indicar nivel reinicia al nivel por defecto del nuevo cargo.

## Administracion (rol `administrador`, `RolesGuard`)

| Ruta | Efecto |
| --- | --- |
| `GET /admin/asociaciones` | Lista con carreras y junta |
| `GET /admin/asociaciones/:idAsociacion` | Detalle |
| `POST /admin/asociaciones` | Crea (`nombre`, `idsCarreras`, `descripcion?`, `logoUrl?`) |
| `PATCH /admin/asociaciones/:idAsociacion` | Edita; `archivada: true/false` archiva o restaura |
| `POST /admin/asociaciones/:idAsociacion/junta` | Nombra (`idUsuario`, `cargo`, `nivelPermiso?`); solo usuarios ACTIVO |
| `PATCH /admin/asociaciones/:idAsociacion/junta/:idUsuario` | Cambia cargo y/o nivel |
| `DELETE /admin/asociaciones/:idAsociacion/junta/:idUsuario` | Quita al integrante |

Cada cambio escribe en `bitacora_auditoria` (`tipoObjeto = ASOCIACION`, acciones `ASOCIACION_CREADA`, `ASOCIACION_EDITADA`, `ASOCIACION_ARCHIVADA`, `ASOCIACION_RESTAURADA`, `JUNTA_ASIGNADA`, `JUNTA_ACTUALIZADA`, `JUNTA_REMOVIDA`) en la misma transaccion, y las operaciones de junta notifican al usuario (`JUNTA_ASOCIACION`, por socket y campana). No se modifica la junta de una asociacion archivada, salvo quitar integrantes. Errores: 409 nombre duplicado, cargo ocupado o usuario ya en la junta; 400 carreras inexistentes o usuario no activo.

## Usuario autenticado

| Ruta | Efecto |
| --- | --- |
| `GET /asociaciones/mis-juntas` | Juntas del usuario (no archivadas): `idAsociacion`, `nombre`, `logoUrl`, `cargo`, `nivelPermiso`. Alimenta el cambio de vista Estudiante / Asociacion |
| `GET /asociaciones/:idAsociacion/membresia` | Membresia propia; 403 si no es de la junta |

## Verificacion de membresia reutilizable

- `JuntaGuard` (`src/associations/junta.guard.ts`): para cualquier ruta con `:idAsociacion`. Va despues de `JwtAuthGuard`; 403 si el usuario no es de esa junta (tampoco pasa el admin del sistema) y deja la membresia en `request.junta`. El dashboard de asociacion lo usa en todas sus rutas.
- `membresiaJunta(db, idAsociacion, idUsuario)` y `assertPuedePublicarComoAsociacion(db, idAsociacion, idUsuario)` (`src/associations/junta-access.ts`) para validar en servicios, dentro de una transaccion si hace falta.

## Publicar a nombre de la asociacion

`POST /proyectos` acepta `idAsociacion`. Solo el Presidente o quien tenga nivel EDITOR o superior en una asociacion no archivada puede usarlo (403 en otro caso). El proyecto sigue el flujo normal y pasa por revision de la autoridad.
