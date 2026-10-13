# Cómo correr el E2E (Playwright) a mano

Desde el 13/10 el E2E ya no corre solo en GitHub (ni en los PR ni en el
deploy): hay que dispararlo a propósito, antes de cada entrega. Dos formas:
en tu máquina (esta guía) o el workflow manual en GitHub Actions (al final).

## 1. Base de datos y Redis

Desde la raíz del repo, con Docker:

```bash
docker compose up -d postgres redis
```

Eso usa las variables de tu `.env` (copia `.env.example` si no lo tienes).
Asegúrate de tener `DB_PASSWORD`, `JWT_SECRET` y `JWT_REFRESH_SECRET`
definidos ahí (valores sintéticos de prueba, no los de producción).

## 2. Backend: migraciones, seed y arranque

```bash
cd apps/backend
npm ci
npx prisma migrate deploy
npm run seed
npm run build
npm run start:prod
```

Deja esa última terminal abierta: es el backend real (compilado, no
`start:dev`) escuchando en `http://localhost:3001`. Verifica con
`curl http://localhost:3001/api` en otra terminal antes de seguir.

## 3. Frontend: build de producción

En otra terminal:

```bash
cd apps/frontend
npm ci
npm run build
```

Playwright arranca el frontend solo cuando lo necesite (ver paso 4); no hace
falta dejarlo corriendo a mano.

## 4. Correr la suite

Todavía en `apps/frontend`, con `E2E_PRODUCTION_SERVER=1` para que Playwright
use `npm run start` (el build de producción) en vez de `npm run dev`:

- bash/macOS/Linux:
  ```bash
  E2E_PRODUCTION_SERVER=1 npm run test:e2e:local
  ```
- PowerShell:
  ```powershell
  $env:E2E_PRODUCTION_SERVER = '1'
  npm run test:e2e:local
  ```

`test:e2e:local` corre primero la accesibilidad con axe
(`test:e2e:a11y`) y después el resto de la suite de humo
(`test:e2e:sin-a11y`), igual que el workflow manual. El reporte HTML queda en
`apps/frontend/playwright-report/` (ábrelo con `npx playwright show-report`).

Para correr solo un spec: `npx playwright test e2e/<archivo>.spec.ts`.

## 5. Dispararlo a mano en GitHub (sin tocar tu máquina)

GitHub → pestaña **Actions** → workflow **E2E manual** → botón
**Run workflow** → elige la rama → **Run workflow**. Corre los mismos 3
shards + axe que antes corrían en cada PR hacia `main`; el reporte combinado
queda como artefacto de la corrida (o el reporte por shard, si algo falló).

## Por qué cambió

El E2E (3 shards con Postgres/Redis/backend/frontend efímeros + navegador
real) es la parte más lenta y más cara en minutos de GitHub Actions de todo
el pipeline. Para bajar ese consumo, dejó de correr automáticamente tanto en
`ci.yml` (PR/push) como en `deploy.yml`; se corre a propósito, a mano, antes
de cada entrega. El resto de CI (lint, typecheck, build, tests unitarios y de
integración) sigue corriendo igual en todo PR y push.
