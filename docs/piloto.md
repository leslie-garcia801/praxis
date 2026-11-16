# Guía del piloto

Esta guía te lleva de la preparación al cierre del piloto de Praxis en el CBTIS 258: qué dejar listo antes del primer día, qué revisar cada semana, cómo medir si funcionó y qué hacer cuando algo falla. Es para Leslie (responsable técnica) y para las jefas de las dos oficinas.

Las guías cortas para cada persona están en [`guias/`](guias/): [alumno](guias/alumno.md), [supervisor](guias/supervisor.md) y [vinculación](guias/vinculacion.md). La encuesta final está en [`encuesta-piloto.md`](encuesta-piloto.md).

## El piloto en una tabla

| Aspecto | Definición (specs §12) |
| --- | --- |
| Grupo | Alumnos de 5.º semestre de Programación, de servicio social y de prácticas, para probar las dos oficinas |
| Usuarias de vinculación | Mtra. Delfina Hernández Mendoza (Prácticas) e Ing. Stephany Zúñiga Regino (Servicio Social) |
| Duración | 4 a 6 semanas |
| Instituciones | Solo las de los alumnos del piloto |
| Convivencia con el proceso actual | La hoja o libreta en papel **se sigue llenando** durante todo el piloto, para comparar |
| Autorización | Se presenta a la directora a través de la Mtra. Delfina |

## Antes de empezar

Marca cada punto cuando esté hecho. La persona responsable es la que debe confirmarlo.

| Hecho | Qué | Responsable |
| :---: | --- | --- |
| [ ] | **Autorización** de la directora, presentada por la Mtra. Delfina | Mtra. Delfina |
| [ ] | **Producción al día:** el fork desde el que se despliega está sincronizado con `main` (Sync fork en GitHub) y Vercel y Railway terminaron de desplegar. Las migraciones se aplican solas al desplegar la API | Leslie |
| [ ] | `https://<dominio>/api/health` responde `{"status":"ok"}` | Leslie |
| [ ] | **Correo semanal** funcionando: el servicio cron de los lunes existe y el remitente puede enviar a correos reales. Con `onboarding@resend.dev` solo llega a la cuenta de Resend, así que hace falta un dominio verificado ([`despliegue.md`](despliegue.md), sección 6) | Leslie |
| [ ] | **Recordatorios push** (recomendado, no obligatorio): claves VAPID y los dos servicios cron de recordatorios ([`despliegue.md`](despliegue.md), sección 7). Sin ellos la app funciona igual, pero no aparece la tarjeta **Recordatorios** | Leslie |
| [ ] | **Respaldos automáticos** de la base de datos activados en Railway | Leslie |
| [ ] | **Usuarios de oficina creados:** en **Usuarios** (solo administrador), con nombre, correo y oficina. La contraseña temporal se muestra una sola vez; se entrega fuera de la app y cada persona la cambia al entrar | Leslie (administradora) |
| [ ] | **Jefas de oficina capturadas** en **Firmas de las oficinas** (nombre y cargo de cada oficina, para la firma del reporte PDF) | Leslie, con datos de cada oficina |
| [ ] | **Alumnos importados** con la plantilla de **Importar alumnos** (carrera Programación, 5.º semestre) y con la columna **Tipo** llena: `Servicio social` o `Prácticas` | Cada oficina, para sus alumnos |
| [ ] | **Instituciones** del piloto creadas o importadas (**Importar instituciones** o **Nueva institución**) | Cada oficina |
| [ ] | **Supervisores con correo real** en cada institución (**Editar** la institución, sección **Supervisores**, **Nuevo supervisor**). Revisa letra por letra: un correo mal escrito significa semanas sin validar | Cada oficina |
| [ ] | **QR impreso por institución** (**Descargar QR**) y pegado en un lugar visible de la institución. Descargarlo otra vez genera uno nuevo y el impreso deja de funcionar | Cada oficina |
| [ ] | **Cada institución confirmó que acepta el QR impreso** (specs §13, pregunta 8). Si alguna no, el alumno usa el código corto de 6 caracteres que va junto al QR | Cada oficina |
| [ ] | **Aviso de privacidad:** el texto que muestra la app al activar la cuenta es **provisional** y dice "Texto provisional pendiente de aprobación del plantel". Confirmar con vinculación y dirección el texto definitivo (specs §13, pregunta 7) y pedir que se cambie antes del piloto | Mtra. Delfina e Ing. Stephany; Leslie lo cambia |
| [ ] | **Alumnos activan su cuenta e instalan la app** (guía del alumno). Revisa en el panel que todos aparezcan en **Alumnos por confirmar** o ya confirmados | Cada oficina y Leslie |
| [ ] | **Expedientes confirmados:** cada oficina abre el detalle del alumno y pulsa **Confirmar** cuando institución y supervisor están correctos | Cada oficina |
| [ ] | **Prueba de punta a punta con un alumno:** entrada, salida, bitácora, correo al supervisor, validación y reporte ([`prueba-supervisor.md`](prueba-supervisor.md)) | Leslie |
| [ ] | **Hoja en papel lista** para cada alumno del piloto, para llenarla en paralelo | Cada oficina |

Preguntas abiertas que pueden cambiar lo que ven las oficinas (specs §13): la 1 y la 2 definen la duración y la alerta **En riesgo**, y la 5 (días inhábiles) hoy se resuelve contando todos los días. Anótalas si aparecen durante el piloto.

## Calendario semana a semana

Los lunes a las 8:00 (Monterrey) sale el correo a los supervisores y se envían solas las semanas cerradas con bitácora lista. Los domingos a las 18:00 llega el recordatorio de bitácora a quien activó los recordatorios.

| Semana | Qué pasa | Qué revisar en el panel |
| --- | --- | --- |
| **0. Preparación** | Se completa la lista de arriba | **Alumnos por confirmar** y **Supervisores por confirmar** deben llegar a 0 |
| **1** | Primeros registros. El lunes siguiente sale el primer correo | Primer día: que cada alumno tenga al menos un registro (columna **Último registro**). Alerta **Sin registros en 7 días** |
| **2** | Primeras validaciones | **Semanas sin validar (más de 7 días)**: llamar al supervisor. **Turnos incompletos** y cola de **Correcciones**. **Métricas:** primera corrida del script (ver abajo) y revisión de 2 o 3 alumnos contra el papel |
| **3** | Ritmo normal | Los mismos puntos, más el filtro **Solo en riesgo**. Primera comparación formal con el papel |
| **4** | Ritmo normal. Si el piloto dura 4 semanas, se cierra aquí | Los mismos puntos. Corrida del script de métricas |
| **5 y 6 (si aplica)** | Ritmo normal | Los mismos puntos |
| **Cierre** | Se deja de registrar. Se espera una semana para que los supervisores validen lo último | Corrida final del script, comparación final con el papel y encuesta |

### Revisión semanal (10 minutos, cada lunes por la tarde)

1. Abre el **Panel** de tu oficina y mira las tarjetas de alerta. Pulsa una para filtrar la tabla.
2. **Sin registros en 7 días:** pregunta al alumno qué pasó (¿sin señal?, ¿no sirve el QR?).
3. **Semanas sin validar (más de 7 días):** avisa al supervisor por teléfono o pídele que use el enlace del correo más reciente.
4. **Turnos incompletos:** abre **Correcciones**; aprueba o rechaza cada solicitud con un comentario claro.
5. Marca **Solo en riesgo** y revisa quién va atrasado.
6. Compara con el papel a 2 o 3 alumnos: abre su detalle, **Historial por semana**, y revisa que el total de la semana coincida.
7. Anota cualquier problema, aunque parezca pequeño: es la materia prima de la decisión del cierre.

## Métricas

Metas de éxito (specs §12). Tres las calcula un comando; dos se miden a mano.

| # | Métrica | Meta | Cómo se mide |
| --- | --- | --- | --- |
| 1 | Registro de al menos 4 días por semana | ≥ 80 % | Comando |
| 2 | Semanas validadas por el supervisor dentro de 7 días | ≥ 70 % | Comando |
| 3 | Turnos incompletos (sin salida) | ≤ 10 % | Comando |
| 4 | Diferencia entre horas de la app y de la hoja en papel | ≤ 2 % | A mano (comparación con el papel) |
| 5 | Utilidad percibida al final (escala de 1 a 5) | ≥ 4.5 | A mano (encuesta final) |

### Las tres métricas automáticas

Solo quien tiene el CLI de Railway enlazado al servicio de la API puede correr el comando. Es de solo lectura: no cambia nada en la base.

```bash
railway ssh -- node dist/scripts/metricasPiloto.js --desde 2026-11-16 --hasta 2026-12-20 --carrera Programación --semestre 5
```

- Cambia `--desde` y `--hasta` por el primer y el último día del piloto (días de calendario, inclusivos).
- Para ver una sola oficina, agrega `--tipo SERVICIO_SOCIAL` o `--tipo PRACTICAS`.
- Para guardar el resultado en una hoja de cálculo, usa `--csv -` y redirige a un archivo. El CSV sale por la salida normal y el resumen en texto por la de errores:

```bash
railway ssh -- node dist/scripts/metricasPiloto.js --desde 2026-11-16 --hasta 2026-12-20 --carrera Programación --semestre 5 --csv - > metricas.csv
```

Cada métrica termina con `CUMPLE`, `NO CUMPLE` o `sin datos`. Cómo leerlas:

| Métrica | Qué cuenta el comando | Lectura |
| --- | --- | --- |
| 1. Registro ≥ 4 días | Cada alumno en cada semana completa (lunes a domingo) cuenta una vez; cumple si registró en 4 días o más. El resultado es el porcentaje de esas "semanas de alumno" que cumplen. Muestra el desglose por semana y quién tiene menos de 4 días | Si baja en una semana, mira qué alumnos faltaron y pregunta el motivo. La semana en la que un expediente empieza a mitad de semana no cuenta |
| 2. Validadas en 7 días | De las semanas enviadas dentro del rango, cuántas se validaron en 7 días o menos desde el envío. También informa tardías, rechazadas y pendientes | Una semana enviada hace menos de 7 días aún puede cumplir: corre el comando al menos una semana después del último envío. Una semana rechazada no cuenta como validada a tiempo |
| 3. Turnos incompletos | Turnos sin salida (INCOMPLETA, o abiertos desde un día anterior) entre todos los turnos con entrada en el rango. Los abiertos de hoy no cuentan | Un porcentaje alto suele significar olvidos de salida: refuerza el recordatorio o revisa si el QR de la institución falla |

Cuándo correrlo: **semana 2** (primera mirada), **semana 4** y **al cierre**, una semana después de la última entrada para dar tiempo a las validaciones.

### Diferencia contra el papel (métrica 4)

1. **Elige a los alumnos:** todos si el grupo es chico, o al menos 10 de distintas instituciones y de ambas oficinas.
2. **Elige las semanas:** las mismas semanas completas para app y papel (por ejemplo, semanas 2 a 4).
3. **Suma el papel:** horas totales de esas semanas en la hoja o libreta de cada alumno.
4. **Suma la app:** en el detalle del alumno, **Historial por semana**, anota el **Total de la semana** de cada una (son horas acreditadas).
5. **Calcula** por alumno y en total: `diferencia % = |horas de la app − horas del papel| ÷ horas del papel × 100`.
6. **Explica cada diferencia.** Algunas no son errores: la app acredita máximo 6 h 30 min por día y no acredita turnos de menos de 15 minutos, y el papel puede no aplicar esas reglas. Anota cuáles diferencias vienen de las reglas y cuáles de errores reales (salida olvidada, hora mal escrita).
7. Meta: diferencia total ≤ 2 %.

Usa una tabla como esta, una fila por alumno:

| Alumno | Horas en papel | Horas en la app | Diferencia % | Motivo |
| --- | --- | --- | --- | --- |
| (nombre) | | | | |

### Utilidad percibida (métrica 5)

Se mide con la encuesta final de [`encuesta-piloto.md`](encuesta-piloto.md): la pregunta principal va de 1 a 5 y el promedio general debe ser **≥ 4.5**. Aplícala en la última semana, a alumnos, supervisores y oficinas.

## Qué hacer si…

| Si pasa esto | Haz esto |
| --- | --- |
| **El alumno no puede activar su cuenta** | Revisa que su matrícula (14 dígitos) esté en el archivo importado. Si dice "Tu matrícula no está registrada", impórtalo. Si su nombre o primer apellido no coincide con el archivo, en el detalle del alumno pulsa **Restablecer contraseña**: se crea la cuenta con una contraseña temporal que se muestra una sola vez; entrégasela y el alumno elige una nueva al entrar. Si dice "Tu cuenta ya está activada", pulsa **Ir a iniciar sesión** |
| **El QR no se acepta** | Pide el código corto de 6 caracteres que va junto al QR (**Escribir el código**). Si dice "Este código QR no corresponde a tu institución", ese QR no es el de la institución de su expediente. Si dice "El código QR no es válido", verifícalo con la oficina. Si se descargó un QR nuevo, el impreso viejo ya no sirve: imprime y pega el nuevo. Si la institución no acepta QR, deja solo el código corto |
| **El supervisor no recibió el correo** | Revisa que su correo esté bien escrito en **Editar** institución, **Supervisores**. Pídele que revise correo no deseado. El correo sale los lunes a las 8:00 y solo si hay semanas enviadas. Leslie puede reenviarlo: `railway ssh -- node dist/scripts/resumenSemanal.js --forzar` |
| **El enlace del supervisor venció** (dura 14 días) | Se le envía otro correo con un enlace nuevo. Mientras tanto, la oficina puede validar en nombre del supervisor desde el detalle del alumno, con un motivo que queda en la auditoría |
| **El alumno olvidó su salida** | Si el turno sigue abierto el mismo día, la app avisa **¿Olvidaste registrar tu salida?** y el botón **Registrar salida** lo cierra. Si ya pasó la medianoche, el turno queda incompleto con 0 horas: el alumno pulsa **Solicitar corrección** en **Historial**, con las horas correctas y el motivo, y la oficina la resuelve en **Correcciones**. Solo se puede pedir antes de que la semana se envíe; el lunes a las 8:00 se envían solas las semanas con bitácora lista |
| **El alumno no tiene señal** | Que registre igual: la app guarda el registro en el teléfono (**Pendiente de sincronizar**) y lo envía cuando vuelve la señal o al abrir la app. Si pasan más de 72 horas, se rechaza y aparece en **Registros que no se aceptaron**: pide una corrección a la oficina |
| **No llegan los recordatorios** | Primero, en **Mi avance** busca la tarjeta **Recordatorios**. Si no aparece, el teléfono no los admite o faltan las claves en el servidor (Leslie). En iPhone la app debe estar instalada en la pantalla de inicio y el teléfono tener iOS 16.4 o más reciente. Si dice "Bloqueaste las notificaciones", hay que activarlas en los ajustes del navegador o del teléfono |
| **El alumno no puede instalar la app en iPhone** | Debe abrir la dirección en **Safari** (no en otro navegador), tocar **Compartir** y luego **Agregar a inicio** |
| **La semana de un alumno se rechazó** | Es normal: el alumno ve el comentario del supervisor en **Pendientes**, corrige y vuelve a enviar. Revisa que no se quede atorada más de una semana |
| **El alumno olvidó su contraseña** | **Restablecer contraseña** en su detalle |
| **Algo no está en esta lista** | Anota qué pantalla, qué hizo la persona y qué mensaje vio, y avisa a Leslie |

## Cierre del piloto

### Qué documentar

- Resultados de las cinco métricas, con el comando y las fechas usadas, y el archivo CSV guardado.
- Tabla de comparación con el papel y la explicación de cada diferencia.
- Resultados de la encuesta: promedio de la pregunta principal por grupo y general, y las respuestas abiertas.
- Lista de problemas encontrados, quién los resolvió y cuáles siguen abiertos.
- Respuestas a las preguntas abiertas de las specs que el piloto aclaró (§13: 1, 2, 5, 7, 8 y 9).
- Cambios que piden las oficinas para seguir adelante.

### Criterio de decisión sugerido

| Resultado | Decisión sugerida |
| --- | --- |
| Las cinco metas se cumplen | Presentar a dirección y planear la extensión a más grupos |
| Faltan una o dos, con causa conocida y corregible | Corregir y repetir dos semanas con la métrica que falló |
| Falla la métrica 4 (diferencia con el papel) | No retirar el papel hasta aclarar la causa: las horas son el dato más delicado |
| Fallan tres o más | Revisar los problemas con las oficinas antes de decidir si se continúa |

La decisión final es de las jefas de oficina y de la dirección; esta tabla es solo un punto de partida.
