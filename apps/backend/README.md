# UVGenius — backend

Servicio NestJS del backend de UVGenius.

```bash
npm run build            # compilación
npm run lint             # eslint sobre src/ y test/
npm run test             # suite unitaria (vitest)
npm run test:integration # suite de integración (requiere PostgreSQL descartable)
npx prisma validate      # validación del schema
npx prisma migrate deploy
```

La suite de integración usa **exclusivamente** `INTEGRATION_DATABASE_URL`, sin
ningún valor por defecto: sin esa variable las pruebas se saltan en lugar de
apuntar por accidente a otra base.

---

## Precondiciones de despliegue de Sprint 7

Lista operativa derivada de 06 v2 §51 y §52. **Aquí solo aparecen NOMBRES de
variables y requisitos; ningún valor secreto vive en el repositorio.**

Estas precondiciones están **documentadas, no ejecutadas**: cada una debe
verificarse en el entorno real antes de habilitar el cierre de proyectos.

### 1. Schema y código de la misma generación

Las migraciones aplicadas deben ser exactamente **M1–M6**. El código desplegado
y el schema tienen que provenir de la misma generación: un backend nuevo contra
un schema viejo, o al revés, no está soportado.

```bash
npx prisma migrate deploy   # debe dejar M1…M6 aplicadas y ninguna pendiente
```

### 2. Diagnóstico legacy P-01…P-07 ejecutado y controlado

Antes de habilitar el cierre hay que ejecutar el diagnóstico en modo **solo
lectura** y resolver o aceptar explícitamente cada hallazgo:

```bash
npm run legacy:s7 -- diagnose --admin <idUsuarioAdministrador>
```

`diagnose` no escribe ninguna fila. La conciliación (`apply --manifest`) exige
un manifiesto revisado por una persona y **no debe ejecutarse** como parte del
despliegue automático. Un proyecto con datos ambiguos queda bloqueado para
consolidar y cerrar, con su diagnóstico, mientras el resto del sistema sigue
operativo.

### 3. Capacidad y credenciales de Cloudinary verificadas

Debe comprobarse que la cuenta admite el volumen previsto de documentos de
cierre (hasta 10 MiB por documento) antes del primer cierre real.

Variables requeridas (solo nombres):

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

### 4. Material criptográfico provisionado

```text
CLOSURE_KEKS                   conjunto de claves de cifrado de clave
CLOSURE_ACTIVE_KEY_ID          identificador de la KEK activa
CLOSURE_TICKET_HMAC_SECRET     secreto HMAC de los tickets, independiente de las KEKs
```

**El ensayo de backup y restauración de este material debe completarse ANTES
del primer documento real.** Un documento cifrado cuya clave no pueda
restaurarse es un documento perdido: no existe camino de recuperación posterior.

### 5. Administrador de barrido válido

```text
CLOSURE_SWEEPER_ADMIN_ID       debe ser el id entero de un administrador REAL en la base
```

Sin un administrador válido, las superficies de limpieza quedan deshabilitadas y
el arranque lo registra como `SWEEPER_ADMIN_ID_AUSENTE`.

### 6. Proyectos legacy en solicitud de cierre

Los proyectos que ya estuvieran en `EN_SOLICITUD_CIERRE` en el baseline de
migración y **sin ninguna** `RevisionCierreProyecto` requieren la vía
administrativa de devolución a ejecución antes de poder cerrarse por el flujo
normal. Deben inventariarse antes del despliegue.

### 7. Rendimiento y recursos

El render, el cifrado y la subida de un PDF ocurren **fuera** de toda
transacción, pero consumen memoria y ancho de banda. Debe dimensionarse el
proceso para el tamaño máximo de documento (10 MiB antes de cifrar) y para la
concurrencia esperada de cierres.

### Comprobación de arranque

La validación de entorno informa por log qué superficies quedan deshabilitadas
cuando falta configuración, sin exponer ningún valor:

```text
Closure storage no disponible: faltantes=[...]
Closure cleanup no disponible: motivosCleanup=[...]
```

Un arranque con esos avisos es válido para desarrollo, pero **no** para operar
el cierre de proyectos.
