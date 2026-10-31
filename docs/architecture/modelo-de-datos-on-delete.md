# Modelo de datos: criterio de `onDelete`

No existia un documento de modelo de datos en `docs/`; este es el primero y solo cubre la politica de borrado referencial de `apps/backend/prisma/schema.prisma`.

## Regla

Toda relacion con `fields:` declara `onDelete` de forma explicita (RTF-3.5). Antes solo 46 de 151 relaciones con clave foranea lo hacian; el resto dependia del valor implicito de Prisma.

| Valor | Cuando se usa |
| --- | --- |
| `Restrict` | Relacion obligatoria sin regla de negocio que borre en cascada. El padre no se puede borrar mientras existan hijos. Es el valor por defecto de Prisma. |
| `SetNull` | Relacion opcional: al borrar el padre el hijo se conserva con la clave en `NULL`. Es el valor por defecto de Prisma. |
| `Cascade` | Solo donde el hijo no tiene sentido sin el padre (tokens, filas de pertenencia, adjuntos) y ya habia una regla explicita en el schema o el codigo. |

## Cambio aplicado

Las 105 relaciones que no declaraban `onDelete` ahora declaran el valor que Prisma ya aplicaba (`Restrict` si la relacion es obligatoria, `SetNull` si es opcional). No se cambio ningun comportamiento: `prisma migrate diff` entre el schema anterior y el nuevo produce SQL vacio, por lo que no hay migracion.

## Al agregar una relacion

1. Declarar siempre `onDelete`.
2. Usar `Restrict`/`SetNull` salvo que exista una regla de negocio documentada que justifique `Cascade`.
3. Comprobar con `prisma migrate diff --from-schema-datamodel <anterior> --to-schema-datamodel prisma/schema.prisma --script` que el SQL resultante es el esperado.
