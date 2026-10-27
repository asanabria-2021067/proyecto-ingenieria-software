# Modelo de datos

La fuente de verdad del modelo es `apps/backend/prisma/schema.prisma`; las
migraciones viven en `apps/backend/prisma/migrations/`. Este documento solo
recoge los criterios que no se leen directamente del esquema.

## Acciones referenciales (`onDelete`)

IESUC-568 (RTF 2 · 3.5). Toda relación con `fields:` declara `onDelete` de
forma explícita, para que el comportamiento al borrar se lea en el esquema y
no dependa de un valor implícito de Prisma.

- Relación **obligatoria** (`campo Modelo`): `onDelete: Restrict`. No se puede
  borrar el padre mientras existan hijos.
- Relación **opcional** (`campo Modelo?`): `onDelete: SetNull`. Al borrar el
  padre, la referencia del hijo queda en `NULL`.
- `Cascade` u otra acción solo se usa cuando el dominio lo exige, y siempre
  queda escrita en el esquema con su migración.

Son exactamente los valores por defecto de Prisma, así que declararlos no
cambia la base: `prisma migrate diff` entre el esquema anterior y el nuevo, y
entre la base migrada y el nuevo esquema, devuelve una migración vacía. Al
agregar una relación nueva se sigue el mismo criterio.

## Invariantes fuera de Prisma

Algunos índices no se pueden expresar en `schema.prisma` (parciales o de
expresión) y existen solo en SQL de migración; cada modelo afectado lo indica
en su comentario `///`. Prisma los ignora en `migrate diff`. Ejemplos:
`sprint_operable_unique`, `participacion_proyecto_activa_unique`,
`s7_ajuste_vigente` y `amistad_par_no_ordenado_key` (un solo registro de
amistad por par de usuarios, sin importar el sentido).
