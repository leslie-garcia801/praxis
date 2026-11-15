# Prueba del flujo del supervisor (producción)

Guía para probar de punta a punta, en producción, que una bitácora llega al supervisor por correo, que él la valida o la rechaza desde su enlace, y que el efecto se ve del lado del alumno (RF-19, RF-20, RF-21, RF-21a, RF-22).

**Cuándo:** desde el lunes 16 de noviembre de 2026. La bitácora de una semana solo se puede enviar cuando la semana ya terminó; antes, la pantalla dice "Podrás enviarla a partir del lunes".

**Cuánto tarda:** unos 20 minutos, con dos personas.

## Quién hace qué

| Rol | Quién | Qué hace |
| --- | --- | --- |
| Alumna | Valeria Demo Cantú (`22000000000005`) | Escribe y envía la bitácora, corrige si la rechazan |
| Supervisora | Leslie, desde su correo `leslie.garcia.alp@cbtis258.edu.mx` | Abre el enlace, rechaza y después valida |
| Técnico | Quien tenga el CLI de Railway | Dispara el correo |

El supervisor no tiene cuenta: entra solo con el enlace del correo, que vale 14 días.

## Antes de empezar

- [ ] El supervisor asignado al expediente de Valeria tiene el correo de Leslie (Editar institución → Supervisores → Editar). Con el remitente de pruebas `onboarding@resend.dev`, Resend solo entrega a esa dirección.
- [ ] Valeria tiene turnos **cerrados** (entrada y salida) en la semana del lunes 9 al domingo 15 de noviembre.
- [ ] El CLI de Railway está enlazado desde `backend/` (`railway status` muestra el servicio `praxis`).
- [ ] La PWA del iPhone se cerró del todo y se abrió de nuevo, para tener la versión más reciente.

## 1. Alumna: escribir y enviar la bitácora

1. Valeria entra a la app y abre **Historial**. Se ve la semana del 9 al 15 con sus días, turnos y total.
2. En la bitácora escribe las actividades (**mínimo 50 caracteres**) y pulsa **Guardar**.
3. Pulsa **Enviar a mi supervisor**.

**Resultado esperado:** la semana queda en solo lectura con "Enviada a tu supervisor el …".

Si en lugar del botón ves "Podrás enviarla a partir del lunes", la semana todavía no terminó.

## 2. Técnico: disparar el correo

Desde la carpeta `backend/`:

```bash
railway ssh --service praxis -- node dist/scripts/resumenSemanal.js --forzar
```

`--forzar` salta la protección de 12 horas contra enlaces repetidos al mismo supervisor; úsalo solo en pruebas y demos.

**Resultado esperado** en la salida:

```
Resumen semanal
  Semanas enviadas automáticamente: 0
  Supervisores notificados: 1
  ...
  Envíos fallidos: 0
```

- `Supervisores notificados: 1` → salió el correo.
- `Envíos fallidos: 1` → Resend lo rechazó. Revisa que el correo del supervisor sea el de la cuenta de Resend.
- `Supervisores notificados: 0` → no hay semanas enviadas, o ya se envió un enlace hace menos de 12 horas.

El resumen del lunes a las 8:00 (cron) también envía solas las semanas ya cerradas cuya bitácora quedó lista (50 caracteres o más). Si lo corriste después de esa hora, puede que el correo ya haya salido sin que hicieras nada.

## 3. Supervisora: abrir el enlace

1. Leslie abre el correo de Praxis (revisa también spam) y pulsa el enlace. La dirección tiene la forma `https://praxis-five-self.vercel.app/validar/<token>`.
2. Debe ver un saludo con su nombre y la semana de Valeria con sus turnos, las horas fuera de horario y la bitácora. No se muestran el número de control ni otros datos del alumno (RNF-07).

## 4. Primero rechazar

1. Leslie pulsa **Rechazar**. Escribe el **Motivo del rechazo** (5 a 1000 caracteres, obligatorio), por ejemplo "Detalla las actividades", y confirma.
2. Del lado de Valeria, al abrir la app aparece un pendiente de semana rechazada con **"Comentario de tu supervisor: «…»"**.
3. Valeria edita la bitácora, **Guarda** y vuelve a pulsar **Enviar a mi supervisor**.

**Resultado esperado:** la semana vuelve a "Enviada". Sus horas siguen en "Registradas sin validar".

## 5. Después validar

1. El técnico repite el comando del paso 2 (con `--forzar`). Leslie recibe un correo nuevo.
2. Leslie abre el enlace nuevo y pulsa **Validar** (con varias semanas pendientes, **Validar todo** valida todas a la vez).
3. En la app de Valeria, la pantalla de avance debe mostrar las horas de esa semana como **"Validadas por tu supervisor"**, subir el porcentaje y bajar "Registradas sin validar".

## 6. Comprobaciones de enlace

| Prueba | Cómo | Resultado esperado |
| --- | --- | --- |
| Semana ya resuelta | Volver a abrir el enlace del paso 5 | "Esta semana ya se había resuelto" |
| Enlace inventado | Cambiar un carácter del token en la dirección | "Este enlace no es válido." |
| Enlace vencido | No se puede probar en producción (vale 14 días) | "Este enlace venció. Usa el del correo más reciente." |

## Registro de resultados

Anota quién lo probó, la fecha y el resultado de cada punto:

- [ ] El correo llegó, y llevaba el enlace correcto
- [ ] La pantalla del supervisor muestra turnos y bitácora
- [ ] Rechazar: el comentario aparece al alumno
- [ ] Reenviar tras corregir funciona
- [ ] Validar: las horas pasan a "Validadas"
- [ ] El enlace ya resuelto y el inválido muestran su mensaje

## Si algo falla

| Síntoma | Qué revisar |
| --- | --- |
| No llega el correo | Carpeta de spam; el panel de Resend (Emails → Logs) dice si fue entregado o rebotó; que el supervisor tenga el correo de la cuenta de Resend |
| El comando dice `Supervisores notificados: 0` | Que la semana esté en "Enviada" y que no haya salido otro enlace en las últimas 12 horas (usa `--forzar`) |
| El enlace abre la app pero no la pantalla del supervisor | Que la dirección sea la de Vercel y termine en `/validar/<token>` completo |
| "No linked project found" en el CLI | Ejecuta el comando desde `backend/` (el enlace se guarda por carpeta) o haz `railway link` |
| La PWA muestra pantallas viejas | Cerrarla del todo y abrirla; a veces hace falta repetirlo |

## Después de la prueba

Las horas validadas de Valeria cuentan como reales en producción. Para el demo ante la escuela, usa a otro alumno de prueba con la semana sin enviar, y deja a Valeria como evidencia de que el flujo ya se probó.
