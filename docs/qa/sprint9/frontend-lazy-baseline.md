# T-293 — Carga diferida: línea base del bundle de producción

Estado medido **antes** de optimizar. El resultado posterior se añade al final
de este documento (sección «Después») cuando se repite la medición.

## Cómo se mide

```bash
cd apps/frontend && npm run build
node scripts/qa/sprint9-bundle-measure.mjs            # tabla de todas las rutas
node scripts/qa/sprint9-bundle-measure.mjs --json admin
```

El script lee el build de producción (`apps/frontend/.next`) y, por cada página,
suma el tamaño de los chunks de JavaScript que su HTML inicial referencia: los
del arranque de Next (`rootMainFiles`) más los de la página, sus layouts y su
límite de error (`entryJSFiles`). Los módulos cargados con `next/dynamic` quedan
en chunks aparte que no figuran en esas listas, así que diferir un módulo baja
la cifra de la ruta.

Qué es y qué no es esta cifra:

- Es **JS inicial referenciado por ruta**, en bytes sin comprimir y con gzip
  (nivel por defecto de Node). Es determinista para un mismo código.
- No es tiempo de carga, LCP ni una medición de red. No se afirma ninguna
  mejora de velocidad percibida a partir de ella.
- Los nombres de los chunks cambian en cada build; las sumas por ruta no.

## Línea base

Build de producción de Next 16.3.6 (Turbopack) sobre el código de
`sprint9/vernel-workstream` en `2a959054` (último cambio de código de la
aplicación: `5439c8b0`).

| Ruta | Chunks | JS (bytes) | JS gzip (bytes) |
|---|---:|---:|---:|
| `/dashboard/proyectos/[id]/sprints/analytics` | 28 | 1651879 | 485989 |
| `/dashboard/proyectos/[id]/sprints/[sprintId]/analytics` | 28 | 1636530 | 481135 |
| `/dashboard/proyectos/[id]/sprints/[sprintId]/informes/burndown` | 28 | 1625651 | 478228 |
| `/dashboard/proyectos/[id]/sprints/informes/velocidad` | 27 | 1580606 | 464442 |
| `/dashboard/admin` | 25 | 1561069 | 460712 |
| `/dashboard/calendario` | 26 | 1379390 | 415320 |
| `/dashboard/projects/[id]/kanban` | 28 | 1349218 | 406359 |
| `/dashboard/proyectos/[id]` | 27 | 1296237 | 390703 |
| `/dashboard` | 23 | 1118231 | 340802 |
| `/dashboard/admin/usuarios` | 23 | 1114487 | 339157 |
| `/dashboard/perfil` | 22 | 1099781 | 336242 |
| `/dashboard/admin/seguridad` | 22 | 1088746 | 333678 |
| `/` | 12 | 1050746 | 326798 |
| `/login` | 14 | 786051 | 233130 |

Las 62 rutas se obtienen con el comando de arriba; aquí van las más pesadas y
las de referencia.

### Qué pesa en cada una

Buscando una cadena propia de cada librería en los chunks de cada ruta:

| Librería | Rutas que la cargan de entrada |
|---|---|
| `recharts` | `/dashboard/admin` y las cuatro de analítica e informes de sprint |
| `@tsparticles` (fondo de partículas) | `/` |
| `@dnd-kit` | `/dashboard/projects/[id]/kanban` |
| `cmdk`, `react-day-picker` | `/dashboard/calendario` |
| `leaflet` | Ninguna: ya se carga con `next/dynamic` al abrir el selector de lugar |

- En `/dashboard/admin`, un único chunk de la página pesa **102 818 bytes
  gzip**: es la sección «Tendencias de uso» con `recharts`. El resto del panel
  no usa gráficos.
- En `/`, un único chunk de la página pesa **138 406 bytes gzip** y agrupa las
  animaciones y el fondo de partículas de la sección de características.

## Candidatos y decisión

| Candidato | Decisión | Motivo |
|---|---|---|
| «Tendencias de uso» en `/dashboard/admin` | **Diferir** | Sección secundaria, debajo de la cola de atención y de los indicadores; ya tiene su propio estado de carga. |
| Fondo de partículas de la landing | **Diferir** | Decorativo, fuera de la primera pantalla y ya no se pinta hasta que su motor arranca en el cliente: diferirlo no cambia lo que se ve ni mueve contenido. |
| Gráficos de analítica e informes de sprint | No diferir | El gráfico es el contenido principal de esas páginas. |
| Tablero Kanban (`@dnd-kit`) | No diferir | Arrastrar tarjetas es la función principal de la ruta. |
| Calendario | No tocar | Pertenece a la HU-184 de otro responsable. |
| Mapa de lugar del evento | Ya diferido | Verificado en `components/calendar/event-form-dialog.tsx`. |

## Objetivos

| Ruta | Línea base (gzip) | Objetivo |
|---|---:|---|
| `/dashboard/admin` | 460 712 | Bajar al menos un 15 % |
| `/` | 326 798 | Bajar al menos un 10 % |
| Resto de rutas | — | No subir |

T-293 solo se da por cumplida si la medición posterior, con el mismo script y
el mismo tipo de build, alcanza estos objetivos.
