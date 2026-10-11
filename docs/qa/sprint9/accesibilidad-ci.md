# Sprint 9 · Comprobación de accesibilidad con axe en la suite E2E y en CI (T-318)

## 1. Qué comprueba

`apps/frontend/e2e/accesibilidad.spec.ts` abre, con sesión autenticada, las cinco pantallas de la auditoría de
T-316 en tema claro y oscuro (10 combinaciones) y ejecuta axe-core con las reglas WCAG 2.0 y 2.1 de nivel A y AA.

| Aspecto | Valor |
|---|---|
| Motor | axe-core 4.10.3, mediante `@axe-core/playwright` 4.10.2 (dependencia de desarrollo, versión exacta) |
| Reglas | Etiquetas `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` |
| Qué hace fallar el test | Cualquier violación de impacto `serious` o `critical` (o de impacto no informado) |
| Qué no lo hace fallar | Las violaciones `moderate` y `minor`: se adjuntan al reporte, no se ocultan |
| Exclusiones | Ninguna: no hay reglas desactivadas ni selectores excluidos |
| Datos | Solo lectura sobre las cuentas sintéticas del seed |

Pantallas: `/dashboard`, `/dashboard/admin`, `/dashboard/admin/proyectos?grupo=activos`, `/dashboard/calendario` y
`/dashboard/perfil/editar` (ver `docs/qa/sprint9/a11y-screen-inventory.md`).

## 2. Cómo se ejecuta

```bash
# Solo la comprobación de accesibilidad (15 tests: 10 de pantallas y 5 del contrato de la puerta)
npm run test:e2e:a11y

# La suite E2E completa también la incluye
npm run test:e2e
```

Necesita la aplicación levantada con datos de prueba. En local, contra la pila aislada:

```bash
scripts/e2e/isolated-stack.sh up && scripts/e2e/isolated-stack.sh migrate && scripts/e2e/isolated-stack.sh apps
scripts/e2e/isolated-stack.sh e2e e2e/accesibilidad.spec.ts e2e/a11y-gate-contract.spec.ts
```

## 3. Dónde corre en CI

En `.github/workflows/ci.yml`, job `e2e`, en dos pasos:

| Paso | Comando | Papel |
|---|---|---|
| «Accesibilidad con axe (cinco pantallas, claro y oscuro)» | `npm run test:e2e:a11y` | Propio y **bloqueante**. Corre antes de la suite completa: su resultado se ve aparte y un fallo de otro flujo no lo oculta |
| «Ejecutar suite de humo E2E» | `npm run test:e2e` | La suite completa, que vuelve a incluir estos specs |

El paso de accesibilidad no lleva `continue-on-error` ni condición propia. Su reporte se publica como artefacto
`a11y-axe-report`, pase o falle, durante 7 días: contiene, por pantalla y tema, el JSON de axe con regla, impacto,
criterio y selector, **sin** el HTML de la página.

### Cuándo se ejecuta el job `e2e`

Las condiciones del job **no se cambiaron**:

| Evento | ¿Corre? |
|---|---|
| Pull request hacia `main` | Sí |
| Ejecución manual (`workflow_dispatch`) | Sí |
| Llamado desde el workflow de despliegue (`e2e: run`) | Sí |
| Push o pull request hacia `develop` | **No** |

El job E2E necesita base de datos, Redis, backend y frontend reales y tarda más de 10 minutos; por eso el equipo
decidió no correrlo en cada cambio hacia `develop`. Esa decisión se respetó: la comprobación de accesibilidad
protege todo lo que llega a `main` y a despliegue, no cada PR intermedio. Ampliarla a `develop` es una decisión
del equipo sobre el coste del pipeline.

## 4. La puerta falla cuando debe

`apps/frontend/e2e/a11y-gate-contract.spec.ts` le da a la misma función que usa la comprobación real una página de
prueba con cuatro defectos conocidos y verifica que los detecta, uno por regla:

| Defecto introducido | Regla de axe | Impacto | WCAG |
|---|---|---|---|
| Imagen sin texto alternativo | `image-alt` | crítico | 1.1.1 |
| Campo sin etiqueta | `label` | crítico | 4.1.2 |
| Botón sin nombre | `button-name` | crítico | 4.1.2 |
| Texto gris claro sobre blanco | `color-contrast` | grave | 1.4.3 |

Luego corrige los cuatro en la misma página y verifica que vuelve a pasar. La página de prueba es HTML escrito en
el propio spec: no toca la aplicación.

### Demostración del código de salida

Medido en local el 2026-10-11, contra la pila aislada:

| Comando | Resultado | Código de salida |
|---|---|---:|
| `npm run test:e2e:a11y` | 15 pasan | **0** |
| `A11Y_GATE_SELFTEST=fail npm run test:e2e:a11y` | 15 pasan y 1 falla, listando las cuatro violaciones | **1** |

Con `A11Y_GATE_SELFTEST=fail` el spec añade un test que aplica la afirmación de la puerta real a la página
defectuosa: debe fallar y deja el comando en rojo. Esa variable no se define en CI ni en la suite normal; existe
solo para poder repetir esta demostración.

## 5. Equivalente local del paso de CI

El paso se reprodujo en local con las mismas condiciones que usa el runner: `CI=1` (un solo worker, un reintento),
`E2E_PRODUCTION_SERVER=1` (Playwright arranca él mismo `next start` sobre el build de producción) y el reporte en
`playwright-report-a11y`. Resultado: 10 de 10, código de salida 0, y el servidor quedó detenido al terminar. El
workflow se valida como YAML y por contrato en `apps/backend/test/fg11-a11y-ci-contract.spec.ts`, que falla si el
paso desaparece, se vuelve opcional, ignora su fallo o corre antes de que exista el build.

## 6. Lo que NO está verificado

**`CI_REMOTE_VERIFICATION_PENDING`.** Ninguna ejecución de GitHub Actions ha corrido este paso todavía: la rama no
se ha publicado y no hay un pull request. Lo comprobado es el workflow, su contrato y su equivalente local. Que
el pipeline remoto lo ejecuta y pasa solo se podrá afirmar con una corrida real, tras el primer PR hacia `main` o
una ejecución manual. Al hacerlo conviene revisar:

1. que el paso «Accesibilidad con axe» aparece y termina en verde;
2. que el artefacto `a11y-axe-report` se publica;
3. el tiempo que añade al job.

## 7. Estabilidad

Las 10 combinaciones se repitieron tres veces seguidas (`--repeat-each=3`) sin un solo fallo intermitente. El tema
se fija antes de cargar cada pantalla y se espera a que la red quede en reposo y el titular sea visible antes de
analizar.

## 8. Límites

- Cubre cinco pantallas en su estado inicial y a 1440 × 900: no los diálogos, menús, estados de error ni el resto
  de la aplicación.
- axe no comprueba todo WCAG. Que este test pase no certifica AA.
- Sigue abierto A11Y-08 (nombre accesible del menú de cuenta y del botón del chat): axe no lo marca como violación,
  así que esta puerta no lo detecta. Está registrado en `docs/qa/sprint9/accesibilidad-auditoria.md`.
