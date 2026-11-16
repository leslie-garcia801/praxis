# 0053 — Reporte de métricas del piloto (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 7 |
| Specs | §12 (piloto y métricas de éxito), RN-08, RN-15, RN-18, RNF-07 |
| Proyecto | backend |

## Descripción

Comando de solo lectura para que la oficina (o quien tenga acceso a Railway) obtenga durante y después del piloto las 3 métricas de éxito que la app puede calcular sola, para un grupo de alumnos. Las otras dos métricas de §12 (diferencia contra la hoja en papel ≤ 2 % y utilidad percibida ≥ 4.5) se miden de forma manual; el reporte lo recuerda al final.

- **Dominio** `domain/metricasPiloto.ts`: las definiciones como funciones puras (`semanasCompletas`, `diasRegistradosEnSemana`, `resumirRegistro`, `clasificarValidacion`, `resumirValidacion`, `clasificarTurno`, `resumirTurnos`, `evaluarMeta`).
- **Módulo** `modules/metricasPiloto/`: `args` (Zod + `parseArgs`), `service` (solo carga datos con SELECT y llama al dominio), `formato` (texto y CSV).
- **Script** `src/scripts/metricasPiloto.ts`; `pnpm job:metricas-piloto`; producción `node dist/scripts/metricasPiloto.js`.

## Checklist

- [x] Pruebas del dominio: exactamente 4 días / 3 días, semana parcial dentro y fuera del rango, `fechaInicio` a mitad de semana, límite de medianoche de Monterrey, validada a exactamente 7 días / 7 días y 1 minuto, turno abierto hoy / ayer, denominadores en cero
- [x] Pruebas del servicio contra la base de pruebas: filtros (carrera, semestre, grupo, tipo), regla de población, otro plantel excluido, el comando no escribe (conteos de tablas sin cambios), CSV
- [x] Pruebas de argumentos: válidos, falta `--desde`/`--hasta`, `--hasta` anterior a `--desde`, `--tipo` inválido, carrera desconocida
- [x] Script y comando `job:metricas-piloto`; `pnpm build` genera `dist/scripts/metricasPiloto.js`
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` en verde

## Fuera de alcance

- Las métricas manuales (diferencia contra papel, utilidad percibida).
- Pantalla en la app o endpoint de la API: es un comando.
- Historial de estados del expediente (no se guarda; ver «Población»).

## Notas

### Uso

```bash
# Local
pnpm job:metricas-piloto -- --desde 2026-11-16 --hasta 2026-12-20 [--carrera Programación] [--semestre 5] [--grupo A] [--tipo SERVICIO_SOCIAL|PRACTICAS] [--plantel <id>] [--csv ruta.csv]

# Producción (Railway)
railway ssh -- node dist/scripts/metricasPiloto.js --desde 2026-11-16 --hasta 2026-12-20 --carrera Programación --semestre 5
```

- Las fechas son días calendario de `America/Monterrey` (RN-15), inclusivos.
- `--carrera` se busca por nombre sin distinguir mayúsculas ni acentos; una carrera desconocida es un error y muestra las disponibles.
- Con más de un plantel se exige `--plantel <id>` (el error lista los ids); con uno solo se usa ese.
- Código de salida: `0` bien, `1` falla inesperada, `2` argumentos inválidos (se imprime el uso en español).
- **CSV**: `--csv ruta.csv` escribe el archivo **dentro del contenedor**, donde nadie lo recoge. Para obtenerlo en la computadora local usa `--csv -`: el CSV sale por la salida estándar y el reporte de texto por la salida de errores, así que se puede redirigir:

```bash
railway ssh -- node dist/scripts/metricasPiloto.js --desde 2026-11-16 --hasta 2026-12-20 --csv - > metricas.csv
```

### Población
Expedientes de los alumnos que cumplen los filtros (plantel, carrera, semestre actual del alumno, grupo, y tipo si se indica) con `estado` EN_PROCESO, SUSPENDIDO o FINALIZADO **ahora**, `fechaInicio ≤ hasta` y (`fechaTermino` vacía o `fechaTermino ≥ desde`). Los datos no guardan el historial de estados, así que esta es la aproximación a «estuvo EN_PROCESO en algún momento del rango». Se excluyen PENDIENTE, CANCELADO y los expedientes sin `fechaInicio`. La unidad es el expediente: un alumno con servicio social y prácticas cuenta dos veces.

### Definiciones
1. **Registro ≥ 4 días por semana** (meta ≥ 80 %). Unidad: alumno-semana (expediente + semana). Las semanas son lunes a domingo (Monterrey), completas dentro del rango y con lunes igual o posterior a `fechaInicio` (la semana en la que empieza el expediente a mitad de semana no cuenta). Un día cuenta si hay al menos una entrada de asistencia (cualquier estado) cuya entrada cae en ese día local. Métrica = alumno-semanas con ≥ 4 días ÷ alumno-semanas. Se imprime el desglose por semana y los alumnos con menos de 4 días.
2. **Semanas validadas dentro de 7 días** (meta ≥ 70 %). Unidad: semana con `enviadaEn` dentro del rango. A tiempo = estado VALIDADA y `validadoEn − enviadaEn ≤ 7 × 24 h` (exactamente 7 días cuenta; 7 días y 1 minuto, no). VALIDADA sin `validadoEn` cuenta como tardía (no se puede probar). Se informan validadas a tiempo, tardías, rechazadas y pendientes (ENVIADA/BORRADOR), y de estas cuántas llevan más de 7 días esperando (RN-18). Métrica = a tiempo ÷ enviadas.
3. **Turnos incompletos** (meta ≤ 10 %). Unidad: turno con entrada dentro del rango (de todos los expedientes de la población, no solo de las semanas completas). Incompleto = INCOMPLETA, o ABIERTA con entrada en un día local anterior a hoy (RN-08 los cierra de forma diferida en el siguiente escaneo). Los ABIERTA de hoy se excluyen (aún no se deciden). Métrica = incompletos ÷ (cerrados + incompletos).

Cuando un denominador es 0 se imprime «sin datos» en lugar de un porcentaje. El veredicto es «CUMPLE» / «NO CUMPLE».

### CSV
Una fila por alumno-semana: Alumno, Matrícula, Tipo, Semana, Días registrados, Cumple 4 días, Semanas enviadas y Validadas a tiempo (0 o 1, de la bitácora de esa semana, sin importar si `enviadaEn` cae en el rango), Turnos (cerrados + incompletos de la semana; los abiertos hoy no cuentan) y Turnos incompletos. UTF-8 con BOM para que Excel lea bien los acentos, separador coma, saltos CRLF. Los textos que empiezan con `=`, `+`, `-` o `@` se prefijan con `'` para evitar fórmulas. Sin CURP ni otros datos prohibidos (RNF-07).

### Decisiones
- Solo SELECT: el comando nunca escribe (hay una prueba que compara los conteos de las tablas antes y después).
- `hoy` y el rango se calculan en hora de Monterrey; la hora actual se inyecta en el servicio (`ahora`) para poder probarlo.
- Con `--csv -`, el reporte de texto va a stderr para no mezclarse con el CSV.
