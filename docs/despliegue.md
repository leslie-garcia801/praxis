# Despliegue a producción (Railway + Vercel)

Guía para publicar la app por primera vez. Después, cada merge a `main` se despliega solo en ambos servicios.

Orden: **1) Railway** (base de datos y API) → **2) `vercel.json`** con la URL de Railway → **3) Vercel** → **4) volver a Railway** con la URL de Vercel → **5) primer administrador** → **6) correo semanal**.

## 1. Railway: base de datos y API

1. Crea un proyecto y agrega **PostgreSQL** (Add → Database → PostgreSQL).
2. Agrega un servicio desde el repo de GitHub. En *Settings*:
   - **Root Directory:** `backend`
   - Si Railway no detecta `backend/railway.json`, pon en *Config as code* la ruta `/backend/railway.json`.
   - Ese archivo define el build (`pnpm build`), el arranque (`pnpm start`) y el chequeo de salud (`/api/health`).
   - **Pre-deploy Command:** ponlo también a mano en *Settings → Deploy*: `pnpm prisma migrate deploy`. En el primer despliegue real, Railway no ejecutó el comando de `railway.json` y la API arrancó sin tablas. No dependas del archivo para esto.
3. En *Variables* del servicio de la API:

| Variable | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al servicio de PostgreSQL) |
| `BETTER_AUTH_SECRET` | Cadena aleatoria de 32+ caracteres (`openssl rand -base64 48`) |
| `FRONTEND_ORIGIN` | La URL pública de Vercel, por ejemplo `https://praxis-cbtis258.vercel.app` (se completa en el paso 4) |
| `BETTER_AUTH_URL` | La misma URL de Vercel (se completa en el paso 4) |
| `RESEND_API_KEY` | Clave de Resend |
| `MAIL_FROM` | Remitente con dominio verificado en Resend, por ejemplo `Praxis <no-reply@tu-dominio.mx>`. Para un demo sin dominio: `Praxis <onboarding@resend.dev>`, que solo entrega correos a la dirección de tu cuenta de Resend |
| `APP_TIMEZONE` | `America/Monterrey` |

`PORT` lo pone Railway. En producción la API **no arranca** sin `RESEND_API_KEY` y `MAIL_FROM`.

4. En *Settings → Networking* genera un dominio público. Anota la URL (`https://<servicio>.up.railway.app`).
5. Comprueba: `curl https://<servicio>.up.railway.app/api/health` → `{"status":"ok"}`.
6. En los logs del despliegue debe aparecer `All migrations have been successfully applied`. Si no, revisa el Pre-deploy Command.

## 2. `frontend/vercel.json`

Reemplaza `REPLACE-WITH-RAILWAY-SERVICE.up.railway.app` por el dominio del paso 1.4 y haz commit. El navegador nunca llama a Railway directamente; todo pasa por `/api` del mismo dominio (RNF-05).

## 3. Vercel

1. Importa el repo. **Root Directory:** `frontend`. Framework: Vite (se detecta solo).
2. No necesita variables de entorno.
3. Despliega y anota la URL pública.

## 4. Volver a Railway

Pon esa URL en `FRONTEND_ORIGIN` y `BETTER_AUTH_URL` y redespliega la API. Si no coinciden exactamente con el dominio que abre el navegador, el inicio de sesión falla.

## 5. Primer administrador

Corre el seed **dentro del contenedor de la API** con el CLI de Railway. Así usa la URL interna de la base y no necesitas exponer ni copiar `DATABASE_PUBLIC_URL`:

```bash
railway login
railway link          # proyecto, entorno y servicio de la API
railway ssh -- sh -c "SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD='...' node dist/scripts/seed.js"
```

`railway run` no sirve para esto: corre en tu equipo y `DATABASE_URL` apunta a `postgres.railway.internal`, que solo existe dentro de Railway.

La contraseña lleva 12+ caracteres y la app pide cambiarla al primer inicio de sesión. Después, el administrador crea los usuarios de cada oficina e importa alumnos e instituciones desde la app.

**No uses `db:seed:demo` en producción:** se niega a correr con `NODE_ENV=production` o con una base que no sea local.

## 6. Correo semanal al supervisor (RF-21a)

Crea un **segundo servicio** en Railway desde el mismo repo (fork, rama `main`):

1. **Root Directory:** `backend`.
2. **Config as code:** pon la ruta `/backend/railway.cron.json`. Ese archivo define el arranque (`node dist/scripts/resumenSemanal.js`), el horario `0 14 * * 1` (Railway usa UTC: lunes 14:00 UTC = lunes 8:00 en Monterrey, sin horario de verano) y que no se reinicie. Es un archivo distinto de `railway.json` a propósito: así el servicio no hereda el arranque `pnpm start` ni el chequeo de salud de la API, porque el cron no escucha en ningún puerto.
3. **Variables:** las mismas que la API (la tarea arranca con la misma validación de entorno). Lo más cómodo es copiarlas con *Variables → Raw Editor*. Sin `RESEND_API_KEY` y `MAIL_FROM` no arranca.
4. No hace falta Pre-deploy Command: las migraciones las corre la API.

El servicio se despliega una vez al crearse y después solo corre los lunes. Cada ejecución aparece en *Deployments* con sus logs: ahí se ve cuántos supervisores se notificaron y los envíos fallidos.

### Disparar el correo sin esperar al lunes (pruebas y demo)

Con el CLI de Railway enlazado al proyecto (`railway link`, servicio de la API), desde cualquier carpeta:

```bash
railway ssh -- node dist/scripts/resumenSemanal.js --forzar
```

`--forzar` salta la protección de 12 horas que evita mandar dos enlaces seguidos al mismo supervisor. Úsalo solo en pruebas o en el demo. La tarea envía las semanas en `ENVIADA`, y también envía sola las semanas ya cerradas que sigan en borrador. Con `MAIL_FROM=onboarding@resend.dev` solo llega el correo si el supervisor tiene la dirección de tu cuenta de Resend.

## Si algo falla

| Síntoma | Causa probable |
| --- | --- |
| `502 Application failed to respond` | La API no arrancó. Revisa los logs: casi siempre falta una variable (`Invalid environment variables`) |
| `403 INVALID_ORIGIN` al iniciar sesión | `FRONTEND_ORIGIN` o `BETTER_AUTH_URL` no coinciden con la URL de Vercel, o llevan `/` al final |
| `500` al iniciar sesión y `table public.users does not exist` en los logs | No se aplicaron las migraciones: configura el Pre-deploy Command |
| `/api/...` por Vercel devuelve 404 con cabeceras `x-railway-*` | `frontend/vercel.json` sigue con el dominio de Railway equivocado o con el placeholder |

## Lista de verificación después de desplegar

- [ ] `https://<vercel>/api/health` responde `{"status":"ok"}` (pasa por el rewrite)
- [ ] Inicio de sesión del administrador, y cambio de contraseña
- [ ] Crear un usuario de vinculación e importar un Excel de prueba
- [ ] Instalar la app en un iPhone y en un Android, y probar la cámara (necesita HTTPS)
- [ ] Enviar un enlace de validación a un correo real
- [ ] Respaldos automáticos de la base activados en Railway (RNF-08)
