# Despliegue a producción (Railway + Vercel)

Guía para publicar la app por primera vez. Después, cada merge a `main` se despliega solo en ambos servicios.

Orden: **1) Railway** (base de datos y API) → **2) `vercel.json`** con la URL de Railway → **3) Vercel** → **4) volver a Railway** con la URL de Vercel → **5) primer administrador** → **6) correo semanal** → **7) recordatorios push**.

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

`PORT` lo pone Railway. En producción la API **no arranca** sin `RESEND_API_KEY` y `MAIL_FROM`. Las claves VAPID de los recordatorios push son opcionales (sección 7).

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

Crea un **segundo servicio** en Railway desde el mismo repo (fork, rama `main`) y configúralo **a mano en el panel**. En este proyecto Railway no aplicó los archivos de configuración (`railway.json`, ni uno específico para el cron), así que no dependas de ellos:

1. **Settings → Source → Root Directory:** `backend`.
2. **Settings → Deploy → Custom Start Command:** `node dist/scripts/resumenSemanal.js`. Si el log muestra `API listening`, el comando no se aplicó y está levantando otra API.
3. **Settings → Deploy → Cron Schedule:** `0 14 * * 1` (Railway usa UTC: lunes 14:00 UTC = lunes 8:00 en Monterrey, sin horario de verano).
4. **Variables:** las mismas que la API (la tarea arranca con la misma validación de entorno). Lo más cómodo es copiarlas con *Variables → Raw Editor*. Sin `RESEND_API_KEY` y `MAIL_FROM` no arranca.
5. No hace falta Pre-deploy Command: las migraciones las corre la API. Deja vacío *Config as code*.

El servicio se despliega una vez al crearse y después solo corre los lunes. La primera ejecución debe imprimir "Resumen semanal" con sus contadores y terminar sola. Cada ejecución aparece en *Deployments*, con cuántos supervisores se notificaron y los envíos fallidos.

### Disparar el correo sin esperar al lunes (pruebas y demo)

Con el CLI de Railway enlazado al proyecto (`railway link`, servicio de la API), desde cualquier carpeta:

```bash
railway ssh -- node dist/scripts/resumenSemanal.js --forzar
```

`--forzar` salta la protección de 12 horas que evita mandar dos enlaces seguidos al mismo supervisor. Úsalo solo en pruebas o en el demo. La tarea envía las semanas en `ENVIADA`, y también envía sola las semanas ya cerradas que sigan en borrador. Con `MAIL_FROM=onboarding@resend.dev` solo llega el correo si el supervisor tiene la dirección de tu cuenta de Resend.

## 7. Recordatorios push (RF-28)

Sin este paso la app funciona igual: el push queda apagado y la tarjeta "Recordatorios" no aparece. El aviso "¿Olvidaste registrar tu salida?" dentro de la app sí se muestra.

### Claves VAPID

1. Genéralas **una sola vez** en tu equipo:

   ```bash
   cd backend
   pnpm exec web-push generate-vapid-keys
   ```

2. Agrega en *Variables* del servicio de la API:

| Variable | Valor |
| --- | --- |
| `VAPID_PUBLIC_KEY` | La *Public Key* que imprimió el comando |
| `VAPID_PRIVATE_KEY` | La *Private Key*. Es secreta: no la subas al repo ni la compartas por chat |
| `VAPID_SUBJECT` | `mailto:` con un correo de vinculación, por ejemplo `mailto:vinculacion@cbtis258.edu.mx` |

Van las tres o ninguna: si falta una, la API no arranca y el log lo dice. Si faltan las tres, la API arranca y el log avisa `las notificaciones push están apagadas`.

**No cambies las claves después.** Si las regeneras, las suscripciones guardadas dejan de servir y cada alumno tiene que volver a tocar "Activar recordatorios".

### Dos servicios cron nuevos

Créalos igual que el del correo semanal (sección 6): mismo repo, Root Directory `backend`, sin Pre-deploy Command, *Config as code* vacío y **las mismas variables que la API, incluidas las tres VAPID**.

| Servicio | Custom Start Command | Cron Schedule (UTC) | Cuándo es en Monterrey |
| --- | --- | --- | --- |
| Recordatorio de salida | `node dist/scripts/recordatorioSalida.js` | `*/15 * * * *` | Cada 15 minutos |
| Recordatorio de bitácora | `node dist/scripts/recordatorioBitacora.js` | `0 0 * * 1` | Domingo a las 18:00 |

- **Salida:** avisa una sola vez por turno, cuando lleva 6 horas o más abierto y sigue siendo el mismo día (RN-08). Si no hay nada que avisar, termina en segundos.
- **Bitácora:** avisa a quien registró asistencia esta semana y aún no tiene una bitácora válida. Una segunda ejecución el mismo día no repite el aviso.
- Cada ejecución imprime cuántos avisos mandó y termina con error si algún envío falló.

Despliega primero la API: ella aplica la migración `recordatorios` que estos servicios necesitan.

### Probar sin esperar

Con el CLI de Railway enlazado al servicio de la API:

```bash
railway ssh -- node dist/scripts/recordatorioSalida.js
railway ssh -- node dist/scripts/recordatorioBitacora.js --forzar
```

`--forzar` repite el aviso de bitácora aunque ya se haya mandado esta semana. Úsalo solo en pruebas.

## Si algo falla

| Síntoma | Causa probable |
| --- | --- |
| `502 Application failed to respond` | La API no arrancó. Revisa los logs: casi siempre falta una variable (`Invalid environment variables`) |
| `403 INVALID_ORIGIN` al iniciar sesión | `FRONTEND_ORIGIN` o `BETTER_AUTH_URL` no coinciden con la URL de Vercel, o llevan `/` al final |
| `500` al iniciar sesión y `table public.users does not exist` en los logs | No se aplicaron las migraciones: configura el Pre-deploy Command |
| `/api/...` por Vercel devuelve 404 con cabeceras `x-railway-*` | `frontend/vercel.json` sigue con el dominio de Railway equivocado o con el placeholder |
| La API no arranca y el log nombra una variable `VAPID_*` | Definiste solo una o dos de las tres claves VAPID |
| La tarjeta "Recordatorios" no aparece | Faltan las claves VAPID en la API, o el navegador no soporta push. En iPhone, la app tiene que estar instalada en la pantalla de inicio |
| Los cron de recordatorios terminan sin enviar nada | Faltan las claves VAPID en el servicio cron (no se heredan de la API), o ningún alumno activó los recordatorios |

## Lista de verificación después de desplegar

- [ ] `https://<vercel>/api/health` responde `{"status":"ok"}` (pasa por el rewrite)
- [ ] Inicio de sesión del administrador, y cambio de contraseña
- [ ] Crear un usuario de vinculación e importar un Excel de prueba
- [ ] Instalar la app en un iPhone y en un Android, y probar la cámara (necesita HTTPS)
- [ ] Enviar un enlace de validación a un correo real (guía paso a paso: [`prueba-supervisor.md`](prueba-supervisor.md))
- [ ] Respaldos automáticos de la base activados en Railway (RNF-08)
- [ ] Recordatorios push en un iPhone (app instalada) y en un Android (pasos en `odd/tasks/0048-despliegue-recordatorios.md`)
- [ ] Registro sin conexión: abrir la app instalada en modo avión, registrar y ver que se envía al volver la señal
