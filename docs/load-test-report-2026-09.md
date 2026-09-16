# Informe de carga — T-201 (2026-09-16)

## Entorno objetivo

- **Backend desplegado real**: `http://158.23.57.118:3001` (fallback de
  `NEXT_PUBLIC_API_URL` en `.github/workflows/deploy.yml`), no local.
- **VM de despliegue: 842 MiB de RAM total.** De eso, ~430 MiB los usa el
  sistema operativo y ~91 MiB los cuatro contenedores (backend, frontend,
  Postgres, Redis) en reposo. Quedan de margen real unos **320 MiB** antes de
  que el kernel empiece a usar swap. Cualquier número de este informe hay que
  leerlo con esa memoria de fondo: **no es que la aplicación sea lenta, es
  que la máquina es chica.**

## Alcance real de esta corrida (y por qué)

Se ejecutó contra `GET /api/proyectos` (sin guard, `ProjectsController.findAll`
— confirmado leyendo el controller, no asumido) porque **no había
credenciales reales de ese entorno desplegado** para ejercitar flujos
autenticados o mutables (login, Kanban) sin adivinar contraseñas de una
cuenta real — algo que no se debe hacer contra un entorno que no es propio.
Si se quiere ampliar esta corrida a flujos autenticados/mutables, hace falta
que alguien con acceso a esa base de datos provea `K6_USER_EMAIL` /
`K6_USER_PASSWORD` de una cuenta real de ese entorno (o corra el fixture
`seed-k6-fixture.ts` contra esa `DATABASE_URL`).

## Resultado principal: el primer recurso que se satura no es CPU ni RAM

Con solo **4 VUs sostenidos (~5.4 req/s agregados) desde un único origen**,
el 44% de las peticiones ya volvían **429 Too Many Requests** — no errores
de servidor, no timeouts, no conexión rechazada. Confirmado inspeccionando
`app.module.ts`: `ThrottlerModule.forRoot` define tres cubos globales por IP
(`short`: 10 req/s, `medium`: 50 req/10s ≈ 5 req/s sostenido, `long`: 200
req/60s ≈ 3.3 req/s sostenido) aplicados a **toda ruta** vía `ThrottlerGuard`
global, salvo que un endpoint declare su propio `@Throttle` más estricto (como
`/auth/login`). El cubo `medium` es, en la práctica, el techo real bajo
tráfico sostenido de un solo origen: ronda los 5 req/s, no los 10 que sugiere
el cubo `short` en aislamiento.

**Esto es correcto y deliberado como protección** — pero significa que,
probado desde una sola IP (como cualquier corrida de k6 sin infraestructura
distribuida), **el limitador de tasa por IP se satura mucho antes que el
hardware**, y una corrida de un solo origen no puede, por diseño, medir la
capacidad real de CPU/memoria del backend. Para medir eso hace falta tráfico
desde múltiples IPs (varios runners) o levantar temporalmente los umbrales
del throttler en una ventana de prueba controlada — ninguna de las dos cosas
se hizo acá, porque habría significado debilitar una protección de seguridad
real en el entorno compartido sin coordinarlo antes con el equipo.

## Corrida 1 — rampa 1→20 VUs (85 s, identifica el techo)

| Etapa | Resultado |
| --- | --- |
| Total requests | 1598 |
| Éxito (200) | 218 (13.6%) |
| 429 (rate limit) | 1380 (86.4%) |
| Errores de servidor/timeout/conexión | 0 |
| Latencia (`expected_response:true`) | avg 142.6 ms · p90 159.4 ms · p95 200.3 ms |

A partir de ~5-6 VUs sostenidos el 429 domina la respuesta. La VM respondió
`200` a una petición de verificación inmediatamente después de la corrida —
nunca dejó de responder.

## Corrida 2 — baseline limpio, 4 VUs / 45 s (bajo el techo teórico del cubo `short`)

| Métrica | Valor |
| --- | --- |
| Requests totales | 244 |
| Éxito (200) | 136 (55.7%) |
| 429 | 108 (44.3%) |
| Latencia en los que SÍ pasaron | avg 143.4 ms · p90 173.7 ms · p95 183.3 ms · max 248 ms |

La latencia de las peticiones que sí lograron pasar el throttler se mantuvo
**estable y baja en las tres corridas** (130–200 ms, sin degradación
progresiva). Eso es evidencia indirecta — no una métrica de sistema leída
directamente del host — de que ni CPU ni memoria estuvieron bajo presión real
en ningún momento: si la VM hubiera empezado a usar swap bajo esta carga, la
latencia habría subido de forma marcada y progresiva, no habría quedado plana.

## ¿Llegó a swap la VM?

**No se puede confirmar ni descartar con certeza**: esta corrida se hizo
contra el puerto público de la API, sin acceso SSH/monitoreo al host, así que
no hay una lectura directa de memoria/swap del sistema operativo. La señal
indirecta (latencia plana y baja en las tres corridas, sin degradación al
subir VUs) apunta a que no — el cuello de botella observado fue enteramente
el rate limiter, que rechaza antes de llegar al handler real y por lo tanto
no consume memoria de aplicación. Para una confirmación directa hace falta
`free -h` / `vmstat` en el host durante una corrida futura.

## Conclusión

1. **El primer punto de saturación real es el rate limiter por IP
   (`ThrottlerGuard`, `app.module.ts`), no la RAM ni el CPU de la VM de 842
   MiB.** Un solo cliente sostenido por encima de ~5 req/s ya empieza a
   recibir 429.
2. Todo lo que el backend sí procesó respondió rápido y estable (~130–200 ms
   p95) en las tres corridas, sin señales de degradación.
3. Esta corrida **no** responde todavía "cuántos usuarios concurrentes reales
   aguanta la VM" — esa pregunta requiere tráfico multi-origen (o una ventana
   de prueba coordinada con el throttler relajado), que no se hizo acá para no
   debilitar sin aviso una protección de un entorno compartido.
4. Recomendación concreta para una próxima corrida más completa: coordinar
   con el equipo una ventana de prueba, conseguir credenciales de una cuenta
   de ese entorno para ejercitar flujos autenticados/mutables reales
   (`k6:kanban`), y correr desde más de un origen (o con el throttler
   temporalmente relajado) para encontrar el techo real de CPU/memoria en vez
   del techo del limitador de tasa.
