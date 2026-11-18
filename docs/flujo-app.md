# Flujo de la app desde la interfaz

Este documento muestra cómo se usa la app **hoy**, pantalla por pantalla, para cada rol: administrador, vinculación, alumno y supervisor. Describe lo que está construido en `frontend/`, no lo que piden las specs; los huecos conocidos están al final.

> Estado: 15 de noviembre de 2026, después de la tarea 0054 (guías del piloto). Cuando se agregue una pantalla, actualiza el diagrama del rol que la usa.

## Mapa de pantallas

| Ruta | Pantalla | Quién entra |
| --- | --- | --- |
| `/entrar` | Inicio de sesión | Cualquiera sin sesión |
| `/activar` | Activar cuenta | Alumno importado, sin sesión |
| `/cambiar-contrasena` | Cambio de contraseña obligatorio | Usuario con `debeCambiar` |
| `/alumno` | Mi avance (inicio) | Alumno |
| `/alumno/registrar` | Registrar asistencia (QR o código corto) | Alumno |
| `/alumno/expediente` | Completar expediente | Alumno |
| `/alumno/historial` | Historial semanal y bitácora | Alumno |
| `/vinculacion` | Panel de la oficina | Vinculación y administrador |
| `/vinculacion/instituciones` | Catálogo de instituciones | Vinculación y administrador |
| `/vinculacion/instituciones/nueva` y `/:id/editar` | Formulario de institución | Vinculación y administrador |
| `/vinculacion/importar/alumnos` | Importar alumnos | Vinculación y administrador |
| `/vinculacion/importar/instituciones` | Importar instituciones | Vinculación y administrador |
| `/vinculacion/expedientes/:id` | Detalle del alumno: acciones sobre el expediente, semanas, reporte y auditoría | Vinculación y administrador |
| `/vinculacion/correcciones` | Correcciones pendientes | Vinculación y administrador |
| `/vinculacion/usuarios/nuevo` | Crear usuario de oficina | Solo administrador |
| `/vinculacion/oficinas/firmas` | Firmas de las oficinas | Solo administrador |
| `/validar/:token` | Validar semanas | Supervisor (enlace del correo, sin cuenta) |
| Cualquier otra | "Página no encontrada" | Cualquiera |

## Entrada a la app (todos los roles)

Todos usan la misma pantalla de inicio de sesión. El campo acepta matrícula (alumno) o correo (vinculación y administrador). Antes de mostrar cualquier pantalla, la app revisa si el usuario debe cambiar su contraseña.

```mermaid
flowchart TD
    A([Abre la app en /]) --> B{¿Tiene sesión?}
    B -- No --> L["/entrar<br/>Matrícula o correo + contraseña"]
    L -- "¿No tienes cuenta?" --> ACT["/activar<br/>Solo alumnos importados"]
    L -- Credenciales correctas --> C
    B -- Sí --> C{¿debeCambiar?}
    C -- Sí --> CC["/cambiar-contrasena<br/>Actual, nueva y confirmación"]
    CC -- Guardada --> D
    C -- No --> D{¿Rol?}
    D -- ALUMNO --> AL["/alumno<br/>Mi avance"]
    D -- VINCULACION o ADMIN --> VI["/vinculacion<br/>Panel"]
    ACT -- Cuenta activada --> AL
```

- `debeCambiar` se activa cuando el administrador crea un usuario o cuando vinculación restablece una contraseña (contraseña temporal, RF-04).
- Si un usuario abre una ruta de otro rol, la app lo regresa a su propio inicio.
- "Cerrar sesión" está en el encabezado de ambos layouts y lleva a `/entrar`. Junto a él hay un selector **Tema** (Claro, Oscuro o Sistema).
- Un alumno que ya inició sesión antes puede abrir la app sin conexión: ve su nombre y los botones **Registrar** e **Historial** (ver Registrar asistencia).

## Administrador

El administrador ve todo lo que ve vinculación, de ambas oficinas, más las opciones **Usuarios** (crear cuentas de vinculación) y **Firmas de las oficinas**.

```mermaid
flowchart TD
    IN([Primer inicio con la contraseña del seed]) --> CC[Cambiar contraseña]
    CC --> P[Panel general<br/>con filtro Tipo: ambas oficinas]
    P --> NAV{Menú}
    NAV --> U[Usuarios]
    NAV --> FI[Firmas de las oficinas]
    NAV --> OTRAS[Panel, Correcciones, Instituciones,<br/>Importar alumnos, Importar instituciones<br/>igual que vinculación]

    U --> F[Nombre, correo y oficina:<br/>Servicio social, Prácticas o Ambas]
    F --> R[Se muestra la contraseña temporal una sola vez<br/>con botón Copiar]
    R --> E[Entregar la contraseña al usuario<br/>fuera de la app]
    E --> N[El nuevo usuario entra y<br/>debe cambiarla al primer inicio]
    R -- "Crear otro usuario" --> F

    FI --> FF[Una tarjeta por oficina:<br/>nombre y cargo de la jefa]
    FF -- Guardar --> FS[Salen como firma<br/>en el reporte PDF del alumno]
```

- La oficina define qué expedientes ve el usuario de vinculación (RN-03b). "Ambas" equivale a `oficina = null`.
- No hay pantalla para listar, editar ni desactivar usuarios; solo para crearlos.
- **Firmas de las oficinas** solo existe para el administrador (RF-27, RF-29): el nombre y el cargo de cada oficina se imprimen en la firma del reporte PDF.

## Vinculación

Vinculación prepara el catálogo (instituciones y alumnos) y da seguimiento desde el panel. Solo ve los expedientes de su oficina; el filtro "Tipo" aparece únicamente si tiene ambas oficinas o es administrador.

En pantalla no aparece la palabra "vinculación": cada usuario ve el nombre de su oficina (specs §4). Las rutas siguen siendo `/vinculacion/...`, pero eso es interno.

| Usuario | Título del panel | Etiqueta del encabezado |
| --- | --- | --- |
| Administrador | Panel general | Administrador |
| Oficina de prácticas | Panel de Prácticas Profesionales | Oficina de Prácticas Profesionales |
| Oficina de servicio social | Panel de Servicio Social y Titulación | Oficina de Servicio Social y Titulación |
| Usuario con ambas oficinas | Panel general | Ambas oficinas |

### Preparar el semestre

```mermaid
flowchart TD
    V([Panel de la oficina]) --> I[Instituciones]
    V --> IA[Importar alumnos]
    V --> II[Importar instituciones]

    subgraph Instituciones
        I --> NI[Nueva institución]
        I --> ED[Editar]
        I --> QR[Descargar QR]
        NI --> FORM[Datos generales, domicilio, contacto,<br/>programas, turnos, carreras, cupo, activa]
        ED --> FORM
        FORM -- Guardar --> I
        QR --> CONF{"¿Generar un QR nuevo?<br/>El anterior deja de funcionar"}
        CONF -- Sí --> PDF[PDF con QR y código corto nuevos<br/>para imprimir y pegar en la institución]
    end

    subgraph "Importar desde Excel o CSV (alumnos o instituciones)"
        IA --> S1[1. Descargar plantilla y subir archivo]
        II --> S1
        S1 -- Revisar archivo --> S2[2. Vista previa:<br/>crear, actualizar u omitir, y errores por fila]
        S2 -- "Hay errores" --> S1
        S2 -- Confirmar importación --> S3[3. Resultado con conteos]
    end

    S3 -. "Alumnos importados<br/>con expediente PENDIENTE" .-> AL([El alumno ya puede activar su cuenta])
```

- Descargar el QR **siempre rota** el token y el código corto (RF-13, RF-15). Hazlo solo cuando vayas a reemplazar el impreso.
- Al importar alumnos se crea su expediente en estado PENDIENTE con la meta de horas del programa (RN-02).

### Seguimiento en el panel

```mermaid
flowchart LR
    P([Panel]) --> AL[Tarjetas de alerta]
    P --> FI[Filtros]
    P --> TB[Tabla de alumnos]
    P --> EX[Exportar]

    AL --> A0[Alumnos por confirmar]
    AL --> A1[Sin registros en 7 días]
    AL --> A2[Semanas sin validar<br/>más de 7 días]
    AL --> A3[Turnos incompletos]
    AL --> A4[Supervisores por confirmar]
    A4 -- "Clic: se despliega la lista<br/>supervisor e institución" --> LS[Lista de supervisores]
    A0 & A1 & A2 & A3 -- "Clic: filtra la tabla" --> TB

    EX --> E1[Exportar tabla<br/>Excel con los filtros de la tabla]
    EX --> E2[Exportar para Edumedia<br/>Excel con los filtros de la tabla]

    FI --> F1[Estado, carrera, semestre, grupo,<br/>turno, institución, tipo, solo en riesgo]
    F1 --> TB

    TB --> COL[Horas validadas vs meta, horas sin validar,<br/>último registro, semanas pendientes,<br/>fecha estimada y riesgo]
    TB -- "Clic en el nombre" --> DET["/vinculacion/expedientes/:id<br/>Detalle del alumno"]
```

- El panel solo consulta; las acciones sobre un alumno están en su detalle.
- **Alumnos por confirmar** filtra la tabla por expedientes PENDIENTE. **Supervisores por confirmar** no filtra: despliega una lista.
- Las exportaciones usan los filtros de la tabla, pero no el filtro de la tarjeta de alerta; si hay una activa, la pantalla lo avisa.
- "En riesgo" sigue la regla RN-06a; el panel solo muestra lo que calcula la API.

### Detalle del alumno

```mermaid
flowchart TD
    D([Detalle del alumno]) --> S1[Encabezado: nombre, estado, matrícula,<br/>tipo, carrera, semestre, grupo y turno]
    D --> S2[Expediente: programa, institución,<br/>supervisor, fechas y días pactados]
    D --> S3[Avance: horas validadas vs meta,<br/>registradas, faltantes y fecha estimada]
    D --> S4[Historial por semanas]
    D --> S5[Reporte: descargar PDF]
    D --> S6[Auditoría del expediente]

    S1 --> ACC{Acciones según el estado}
    ACC -- PENDIENTE --> A1[Confirmar, Cancelar]
    ACC -- EN_PROCESO --> A2[Suspender, Cancelar, Transferir]
    ACC -- SUSPENDIDO --> A3[Reactivar, Cancelar, Transferir]
    ACC -- "FINALIZADO o CANCELADO" --> A4[Sin acciones]
    A1 -- "Faltan datos" --> FAL[Lista de lo que falta]

    S1 --> RB[Restablecer contraseña]
    RB --> CF{"¿Restablecer?<br/>La actual deja de funcionar<br/>y se cierran sus sesiones"}
    CF -- Cancelar --> D
    CF -- Restablecer --> PT[Contraseña temporal, una sola vez,<br/>con botón Copiar]
    PT --> EN[Entregar la contraseña al alumno]
    EN --> AL[El alumno entra con ella<br/>y debe elegir una nueva]

    S2 --> ES[Editar supervisor]
    S4 --> SEM{Semana ENVIADA}
    SEM --> V[Validar en nombre del supervisor]
    SEM --> RE[Rechazar con comentario]
    S4 --> CO[Turno con corrección pendiente:<br/>Aprobar corrección o Rechazar]
```

- **Confirmar** pasa el expediente de PENDIENTE a EN_PROCESO (RF-10). Si falta algo, la API responde con la lista y la pantalla la muestra.
- Suspender, reactivar, cancelar y transferir abren un panel con su formulario antes de aplicarse (RF-11, RF-12, RN-12).
- **Validar en nombre del supervisor** y **Rechazar** aparecen en las semanas ENVIADAS y piden un motivo (RF-22).
- Cualquier oficina puede restablecer la contraseña de cualquier alumno del plantel: es soporte, no gestión del expediente.
- Si el alumno nunca activó su cuenta, restablecer se la crea; también sirve cuando la activación falla porque su nombre no coincide.

### Correcciones pendientes

```mermaid
flowchart TD
    M([Menú: Correcciones]) --> L["/vinculacion/correcciones<br/>Correcciones pendientes, la más antigua primero"]
    L --> T[Tarjeta: alumno, turno registrado,<br/>horas propuestas, motivo y fecha]
    T -- "Clic en el nombre" --> DET[Detalle del alumno]
    T --> R{Resolver}
    R -- Aprobar corrección --> OK[El turno se corrige<br/>y el alumno lo ve en su historial]
    R -- Rechazar --> C[Comentario para el alumno]
    C --> NO[Corrección rechazada<br/>con el comentario]
```

- Solo se listan las solicitudes de los alumnos de la oficina del usuario (RN-03b). Sin solicitudes: "No hay correcciones pendientes".
- La misma solicitud se puede resolver desde el historial del alumno en su detalle.

## Alumno

El alumno vive en una sola pantalla de inicio ("Mi avance") y llega a las demás desde sus botones y avisos.

### Activar la cuenta y completar el expediente

```mermaid
flowchart TD
    A([Alumno importado por vinculación]) --> ACT1["/activar paso 1:<br/>matrícula, nombre y primer apellido"]
    ACT1 -- "Datos correctos" --> ACT2[Paso 2: contraseña, correo opcional<br/>y aviso de privacidad]
    ACT1 -- "Cuenta ya activada" --> L["/entrar"]
    ACT2 -- Activar --> H[Mi avance]

    H --> E{Estado del expediente}
    E -- Sin expediente activo --> X[Aviso: acude a vinculación]
    E -- PENDIENTE --> CE[Botón Completar expediente]
    CE --> F[Elegir institución y supervisor<br/>o registrar uno nuevo,<br/>departamento y fecha de inicio]
    F --> T{Tipo de programa}
    T -- Servicio social --> SS[Programa y subprograma]
    T -- Prácticas --> PP[Fecha de término, días pactados,<br/>hora de entrada y salida]
    SS & PP -- Guardar expediente --> R{¿Faltan datos?}
    R -- Sí --> F
    R -- No --> W[Listo: vinculación revisará<br/>tu expediente para confirmarlo]
    W -. "Vinculación pulsa Confirmar<br/>en el detalle del alumno" .-> EP[EN_PROCESO]
    E -- EN_PROCESO --> OK[Avance, turno de hoy,<br/>Registrar e Historial]
```

### Registrar asistencia

```mermaid
flowchart TD
    H([Mi avance]) -- Registrar --> R["/alumno/registrar"]
    R --> CAM{¿Hay cámara y permiso?}
    CAM -- Sí --> QR[Escanear el QR de la institución]
    CAM -- No --> COD[Escribir el código corto<br/>de 6 caracteres]
    QR <-- "Cambiar modo" --> COD
    QR & COD --> RED{¿Hay conexión?}
    RED -- Sí --> API{La API decide}
    API -- "Sin turno abierto" --> EN[Entrada registrada a las HH:MM]
    API -- "Con turno abierto" --> SA[Salida registrada a las HH:MM<br/>y horas acreditadas de hoy]
    SA -.-> AV1[Aviso si pasó el tope de 6 h 30 min<br/>RN-04]
    SA -.-> AV2[Aviso si el turno duró menos de 15 min<br/>RN-09]
    API -- "Error: QR de otra institución,<br/>expediente suspendido, etc." --> ERR[Mensaje e Intentar de nuevo]
    RED -- No --> GU["Registro guardado.<br/>Pendiente de sincronizar."]
    GU --> CT[Contador en Mi avance:<br/>registros pendientes de sincronizar]
    CT -- "Al abrir la app o volver la conexión" --> SY{La API revisa el registro}
    SY -- Aceptado --> HI[Entra al historial con su hora original]
    SY -- "Rechazado, por ejemplo<br/>más de 72 h (RN-14)" --> RZ["Registros que no se aceptaron<br/>mensaje y botón Descartar"]
    EN & SA --> H
```

- El botón Registrar se desactiva si el expediente está SUSPENDIDO.
- Cola sin conexión (RF-16): el registro se guarda en el dispositivo con la hora real y un identificador propio, así que reenviarlo no lo duplica. Se sincroniza al abrir la app y al volver la conexión.
- Un registro con más de 72 h de antigüedad ya no se acepta (RN-14); queda en "Registros que no se aceptaron" hasta que el alumno lo descarta.
- Si la sesión expiró, la app pide iniciar sesión para enviar los registros pendientes.
- Sin conexión, Mi avance muestra "Sin conexión. Puedes registrar tu asistencia; se enviará cuando tengas conexión." y la app abre para un alumno conocido.

### Avisos y recordatorios en Mi avance

```mermaid
flowchart TD
    H([Mi avance]) --> OLV{¿Turno abierto 6 h o más<br/>el mismo día?}
    OLV -- Sí --> AO["¿Olvidaste registrar tu salida?<br/>Registrar salida"]
    H --> RC[Tarjeta Recordatorios]
    RC --> IOS{¿iPhone sin la app instalada?}
    IOS -- Sí --> HINT[Compartir y Agregar a inicio<br/>iOS 16.4 o más reciente]
    IOS -- No --> ACT[Activar recordatorios]
    ACT --> ON[Recordatorios activados<br/>botón Desactivar]
```

- Los recordatorios son notificaciones push (RF-28): salida olvidada y bitácora de la semana. Los envían tareas programadas, no una pantalla.
- Sin las claves del servidor, la tarjeta no aparece; el aviso "¿Olvidaste registrar tu salida?" sí se muestra dentro de la app.

### Bitácora semanal

```mermaid
flowchart TD
    H([Mi avance]) --> PEN[Pendientes:<br/>semana rechazada, bitácora pendiente<br/>o bitácora de esta semana]
    H -- Historial --> HI["/alumno/historial"]
    PEN -- Clic --> HI
    HI --> NAV[Semana anterior / siguiente]
    HI --> DIAS[Días, turnos y total de la semana]
    HI --> B{Estado de la semana}
    B -- "Sin registros" --> B0[Se habilita con tu primer registro]
    B -- "BORRADOR o RECHAZADA" --> ED[Escribir actividades<br/>50 a 5000 caracteres y Guardar]
    ED --> CUR{¿La semana ya terminó?}
    CUR -- "No: semana actual" --> ESP[Podrás enviarla a partir del lunes;<br/>si no, se envía sola]
    CUR -- Sí --> ENV[Enviar a mi supervisor]
    B -- ENVIADA --> RO1[Solo lectura, con fecha de envío]
    B -- VALIDADA --> RO2[Solo lectura]
    B -- RECHAZADA --> COM[Aviso con el comentario del supervisor:<br/>corrígela y vuelve a enviarla]
    COM --> ED
    DIAS --> TU{"¿Turno corregible?<br/>Semana BORRADOR o RECHAZADA"}
    TU -- Sí --> SC[Solicitar corrección]
    SC --> FC[Hora de entrada, hora de salida,<br/>salida al día siguiente y motivo]
    FC -- Enviar solicitud --> REV[Corrección en revisión]
    REV --> RES{La oficina resuelve}
    RES -- Aprueba --> COR[Turno corregido por tu oficina]
    RES -- Rechaza --> RCH[Corrección rechazada<br/>con el comentario de la oficina]
    TU -- "No: semana ENVIADA o VALIDADA,<br/>turno abierto o solicitud en revisión" --> NA[Sin botón]
```

- **Solicitar corrección** (RF-17) solo aparece mientras la semana está en BORRADOR o RECHAZADA, para que la firma del supervisor no cambie. Tampoco aparece con un turno abierto, con el expediente no activo ni si ya hay una solicitud en revisión.
- La entrada se queda en el mismo día (RN-15); la salida puede ser del día siguiente y no puede ser futura.

### Horas de libreta

El alumno puede copiar a la app turnos que ya tenía firmados en su libreta de papel (RF-17a, RN-19).

```mermaid
flowchart TD
    H([Mi avance]) -- "Agregar horas<br/>(solo EN_PROCESO)" --> LP["/alumno/libreta"]
    LP --> F[Filas de turno: fecha, entrada y salida<br/>solo semanas cerradas, desde la fecha de inicio]
    F --> RV[Revisar y enviar, con vista previa por semana]
    RV --> OK[Semanas ENVIADAS con etiqueta Libreta,<br/>sin bitácora]
    OK --> SUP[El supervisor las valida en su enlace semanal<br/>o la oficina en su nombre, RF-22]
    SUP -- Validada --> V[Las horas cuentan como validadas]
    SUP -- Rechazada --> PEN[Pendiente: Corrige las horas<br/>de la semana del…]
    PEN --> CH["Corregir horas: turnos precargados<br/>/alumno/libreta?corregir=lunes"]
    CH -- Reenviar --> OK
```

- Los turnos de libreta no tienen **Solicitar corrección**; se corrigen reemplazándolos cuando se rechaza la semana.
- Las métricas 1 y 3 del piloto los excluyen; la 2 incluye las semanas de libreta (ver [`piloto.md`](piloto.md)).

## Supervisor

El supervisor no tiene cuenta. Recibe un correo con un enlace que vale 14 días y valida desde ahí las semanas de todos sus alumnos.

```mermaid
sequenceDiagram
    actor AL as Alumno
    participant APP as App
    participant JOB as Tarea de los lunes
    actor SUP as Supervisor

    AL->>APP: Escribe la bitácora y la envía (opcional)
    Note over APP: La semana pasa a ENVIADA,<br/>pero todavía no sale ningún correo
    JOB->>APP: Lunes 8:00: envía solas las semanas cerradas<br/>en BORRADOR o RECHAZADA corregida
    JOB->>SUP: Un correo con un enlace<br/>para todas sus semanas ENVIADAS
    SUP->>APP: Abre /validar/:token
    APP-->>SUP: Hola, nombre: semanas pendientes por alumno,<br/>turnos, fuera de horario y bitácora
    alt Validar
        SUP->>APP: Validar (una semana o Validar todo)
        APP-->>AL: Semana VALIDADA: cuenta en sus horas
    else Rechazar
        SUP->>APP: Rechazar con comentario obligatorio (5 a 1000 caracteres)
        APP-->>AL: Semana RECHAZADA: aparece en sus pendientes
    end
```

- Si el enlace no existe: "Este enlace no es válido". Si pasaron 14 días: "Este enlace venció. Usa el del correo más reciente".
- El enlace se puede usar varias veces mientras no venza; una semana ya resuelta muestra "Esta semana ya se había resuelto".
- En producción lo dispara un servicio cron de Railway (lunes 8:00, hora de Monterrey). En desarrollo no hay cron: el correo se dispara con `pnpm job:resumen-semanal` o, para un enlace de prueba, `pnpm dev:enlace` (en `backend/`). Sin `RESEND_API_KEY`, el correo se imprime en la consola del backend.

## Ciclo de vida de una semana

```mermaid
stateDiagram-v2
    [*] --> BORRADOR: Primer registro de la semana
    BORRADOR --> ENVIADA: El alumno la envía después del domingo<br/>o la tarea del lunes la envía sola
    ENVIADA --> VALIDADA: El supervisor la valida
    ENVIADA --> RECHAZADA: El supervisor la rechaza con comentario
    RECHAZADA --> ENVIADA: El alumno corrige y reenvía<br/>o la tarea del lunes la envía si fue editada
    VALIDADA --> [*]
```

- Para enviarse, la bitácora necesita al menos 50 caracteres y el expediente debe estar EN_PROCESO o SUSPENDIDO.
- Solo las horas de semanas VALIDADAS cuentan como avance validado; las demás aparecen como "registradas sin validar".

## Tareas programadas (no son pantallas)

Corren en el servidor y alimentan el flujo; se configuran como indica [`despliegue.md`](despliegue.md).

| Tarea | Cuándo | Qué hace |
| --- | --- | --- |
| Resumen semanal (`job:resumen-semanal`) | Lunes 8:00 | Envía solas las semanas cerradas y manda a cada supervisor un correo con su enlace de validación |
| Recordatorio de salida (`job:recordatorio-salida`) | Cada 15 minutos, el mismo día | Notificación push al alumno con un turno abierto que olvidó su salida (RF-28) |
| Recordatorio de bitácora (`job:recordatorio-bitacora`) | Domingo 18:00 | Notificación push a quien tiene la bitácora de la semana pendiente (RF-28) |
| Métricas del piloto (`job:metricas-piloto`) | A mano | Reporte con días por semana, tiempo de validación y turnos incompletos ([`piloto.md`](piloto.md)) |

## Huecos conocidos

Lo que falta o sigue siendo manual hoy:

| Hueco | Efecto |
| --- | --- |
| Asignar el siguiente programa (`POST /api/expedientes/asignar`) no tiene pantalla | Hay que hacerlo por la API |
| Cambiar el supervisor de un expediente ya confirmado (misma institución, `PATCH /api/expedientes/:id`) no tiene pantalla | La oficina no puede reasignar al alumno; por eso un supervisor con expedientes activos no se puede desactivar sin pasar por la API |
| No se pueden listar, editar, desactivar ni restablecer la contraseña de usuarios de oficina | El administrador solo puede crearlos; si alguien de vinculación olvida su contraseña, no hay forma de recuperarla desde la app |
| No hay forma de editar un turno una vez enviada la semana | Las correcciones del alumno solo valen en semanas BORRADOR o RECHAZADA |
| El alumno no tiene las pantallas **Instituciones** ni **Perfil** de las specs (§10) | Instalar la app y activar notificaciones se hace desde Mi avance (tarjeta Recordatorios); no hay buscador de instituciones |
| Falta el aviso de privacidad integral | La app muestra la versión simplificada aprobada y dice que el integral se consulta en las oficinas de vinculación (specs §13, pregunta 7) |
| Pruebas manuales en celulares reales pendientes | Cámara, instalación en iPhone, push y modo sin conexión están cubiertos por pruebas automáticas, no probados en dispositivos |

Ya cubierto por la interfaz, en el detalle del alumno: confirmar el expediente, suspender, reactivar o cancelar, transferir de institución, validar o rechazar semanas en nombre del supervisor, resolver correcciones y editar o confirmar al supervisor. En **Editar institución** la oficina lista, agrega, edita y desactiva o reactiva supervisores; un supervisor con expedientes activos (PENDIENTE, EN_PROCESO o SUSPENDIDO) no se puede desactivar.

Mientras tanto, para probar el flujo completo de un alumno ya en proceso, usa los datos demo (`pnpm db:seed:demo` en `backend/`): Ana y Bruno ya tienen expedientes EN_PROCESO.
