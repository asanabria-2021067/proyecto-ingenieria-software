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

## Después

Misma medición, mismo script y mismo tipo de build, sobre el código con los
tres módulos diferidos.

| Ruta | Antes (gzip) | Después (gzip) | Diferencia | % |
|---|---:|---:|---:|---:|
| `/dashboard/admin` | 460 712 | 324 381 | −136 331 | −29,6 % |
| `/` | 326 798 | 288 104 | −38 694 | −11,8 % |
| `/dashboard` | 340 802 | 322 665 | −18 137 | −5,3 % |
| `/dashboard/perfil` | 336 242 | 318 105 | −18 137 | −5,4 % |
| `/dashboard/mis-horas` | 335 787 | 318 645 | −17 142 | −5,1 % |
| `/dashboard/admin/seguridad` | 333 678 | 315 541 | −18 137 | −5,4 % |
| `/dashboard/calendario` | 415 320 | 395 901 | −19 419 | −4,7 % |
| `/dashboard/projects/[id]/kanban` | 406 359 | 388 222 | −18 137 | −4,5 % |
| `/dashboard/proyectos/[id]/sprints/analytics` | 485 989 | 467 852 | −18 137 | −3,7 % |
| `/login` | 233 130 | 233 130 | 0 | 0 % |

Sin comprimir, `/dashboard/admin` pasa de 1 561 069 a 1 065 260 bytes y `/` de
1 050 746 a 911 870.

### Qué se difirió

| Módulo | Dónde | Efecto medido |
|---|---|---|
| «Tendencias de uso» (`recharts`) | `/dashboard/admin` | −116 912 bytes gzip en esa ruta |
| Fondo de partículas (`@tsparticles`) | `/` | −38 694 bytes gzip en esa ruta |
| Guía de bienvenida (`react-joyride`) | Armazón del estudiante, presente en el layout de todo `/dashboard` | Entre −18 137 y −19 474 bytes gzip en cada una de las 55 rutas de `/dashboard` |

La guía solo se muestra a quien entra por primera vez o la pide desde la ayuda,
pero su librería viajaba en el JS inicial de todas las rutas del panel.

### Objetivos

| Ruta | Objetivo | Resultado |
|---|---|---|
| `/dashboard/admin` | Bajar al menos un 15 % | **−29,6 %: cumplido** |
| `/` | Bajar al menos un 10 % | **−11,8 %: cumplido** |
| Resto de rutas | No subir | 56 de 62 bajan más de 500 bytes; **una sube 98 bytes** (`/registro`, +0,04 %) |

La subida de `/registro` no viene de código nuevo en esa ruta: al cambiar el
grafo de módulos, el empaquetador reparte distinto los chunks compartidos. Tras
el primer cambio ocurrió lo mismo con `/dashboard/mis-horas` (+995 bytes), que
con el segundo terminó bajando.

### Comportamiento

`apps/frontend/e2e/frontend-lazy-loading.spec.ts`, en Chromium contra el build
de producción:

- los tres chunks llegan después y no figuran entre los scripts del HTML inicial;
- con el chunk de gráficos retenido, el panel admin ya se usa, el hueco se
  anuncia como ocupado y, al llegar, el título «Tendencias de uso» no cambia de
  posición; el selector de periodo se alcanza y responde con el teclado;
- llegar con `#metricas` sigue desplazando hasta la sección;
- la landing no registra errores de página ni de hidratación y el fondo se pinta;
- la guía de bienvenida sigue abriéndose cuando se pide.

### Límites de esta medición

- Es tamaño de JS inicial, no tiempo. No se midió LCP ni carga con red limitada,
  y no se afirma una mejora de velocidad percibida.
- Los gráficos de analítica de sprint, el Kanban y el calendario no se tocaron
  (ver «Candidatos y decisión»): siguen siendo las rutas más pesadas.
- Las pruebas de carga con k6 son la T-294 y no forman parte de esta tarea.
