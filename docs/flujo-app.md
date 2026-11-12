# Flujo de la app desde la interfaz

Este documento muestra cómo se usa la app **hoy**, pantalla por pantalla, para cada rol: administrador, vinculación, alumno y supervisor. Describe lo que está construido en `frontend/`, no lo que piden las specs; los huecos conocidos están al final.

> Estado: noviembre de 2026, después de la tarea 0027 (panel de vinculación). Cuando se agregue una pantalla, actualiza el diagrama del rol que la usa.

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
| `/vinculacion/usuarios/nuevo` | Crear usuario de vinculación | Solo administrador |
| `/validar/:token` | Validar semanas | Supervisor (enlace del correo, sin cuenta) |

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
- "Cerrar sesión" está en el encabezado de ambos layouts y lleva a `/entrar`.

## Administrador

El administrador ve todo lo que ve vinculación, de ambas oficinas, más la opción **Usuarios** para crear cuentas de vinculación.

```mermaid
flowchart TD
    IN([Primer inicio con la contraseña del seed]) --> CC[Cambiar contraseña]
    CC --> P[Panel de vinculación<br/>con filtro Tipo: ambas oficinas]
    P --> NAV{Menú}
    NAV --> U[Usuarios]
    NAV --> OTRAS[Panel, Instituciones,<br/>Importar alumnos, Importar instituciones<br/>igual que vinculación]

    U --> F[Nombre, correo y oficina:<br/>Servicio social, Prácticas o Ambas]
    F --> R[Se muestra la contraseña temporal una sola vez<br/>con botón Copiar]
    R --> E[Entregar la contraseña al usuario<br/>fuera de la app]
    E --> N[El nuevo usuario entra y<br/>debe cambiarla al primer inicio]
    R -- "Crear otro usuario" --> F
```

- La oficina define qué expedientes ve el usuario de vinculación (RN-03b). "Ambas" equivale a `oficina = null`.
- No hay pantalla para listar, editar ni desactivar usuarios; solo para crearlos.

## Vinculación

Vinculación prepara el catálogo (instituciones y alumnos) y da seguimiento desde el panel. Solo ve los expedientes de su oficina; el filtro "Tipo" aparece únicamente si tiene ambas oficinas o es administrador.

### Preparar el semestre

```mermaid
flowchart TD
    V([Panel de vinculación]) --> I[Instituciones]
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

    AL --> A1[Sin registros en 7 días]
    AL --> A2[Semanas sin validar<br/>más de 7 días]
    AL --> A3[Turnos incompletos]
    AL --> A4[Supervisores por confirmar<br/>solo lista]
    A1 & A2 & A3 -- "Clic: filtra la tabla" --> TB

    FI --> F1[Estado, carrera, semestre, grupo,<br/>turno, institución, tipo, solo en riesgo]
    F1 --> TB

    TB --> COL[Horas validadas vs meta, horas sin validar,<br/>último registro, semanas pendientes,<br/>fecha estimada y riesgo]
```

- El panel es **de solo lectura**: las filas todavía no abren el detalle del alumno (tarea 0030).
- "En riesgo" sigue la regla RN-06a; el panel solo muestra lo que calcula la API.

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
    W -. "Vinculación confirma<br/>(sin pantalla todavía)" .-> EP[EN_PROCESO]
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
    QR & COD --> API{La API decide}
    API -- "Sin turno abierto" --> EN[Entrada registrada a las HH:MM]
    API -- "Con turno abierto" --> SA[Salida registrada a las HH:MM<br/>y horas acreditadas de hoy]
    SA -.-> AV1[Aviso si pasó el tope de 6 h 30 min<br/>RN-04]
    SA -.-> AV2[Aviso si el turno duró menos de 15 min<br/>RN-09]
    API -- "Error: QR de otra institución,<br/>expediente suspendido, etc." --> ERR[Mensaje e Intentar de nuevo]
    API -- "Sin red" --> RE[Reintentar con el mismo registro<br/>no se duplica]
    EN & SA --> H
```

- El botón Registrar se desactiva si el expediente está SUSPENDIDO.
- Todavía no hay cola sin conexión (RF-16): si no hay red, el alumno reintenta a mano.

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
```

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
    JOB->>APP: Lunes: envía solas las semanas cerradas<br/>en BORRADOR o RECHAZADA corregida
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
- En desarrollo no hay cron: el correo se dispara con `pnpm job:resumen-semanal` o, para un enlace de prueba, `pnpm dev:enlace` (en `backend/`). Sin `RESEND_API_KEY`, el correo se imprime en la consola del backend.

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

## Huecos conocidos de la interfaz

La API ya tiene estos endpoints, pero la interfaz todavía no los usa:

| Qué falta en la UI | Endpoint existente | Efecto en las pruebas |
| --- | --- | --- |
| Confirmar el expediente del alumno | `POST /api/expedientes/:id/confirmar` | Un alumno nuevo se queda en PENDIENTE y no puede registrar asistencia |
| Suspender, reactivar o cancelar un expediente | `PATCH /api/expedientes/:id/estado` | — |
| Transferir de institución | `POST /api/expedientes/:id/transferir` | — |
| Asignar el siguiente programa | `POST /api/expedientes/asignar` | — |
| Restablecer la contraseña de un alumno | `POST /api/alumnos/:id/restablecer-contrasena` | — |
| Editar o confirmar un supervisor | `PATCH /api/supervisores/:id` | La alerta "Supervisores por confirmar" no tiene acción |
| Detalle del alumno desde el panel | — (tarea 0030) | Las filas del panel no abren nada |
| Listar, editar o desactivar usuarios | — | El administrador solo puede crear |

Mientras tanto, para probar el flujo completo de un alumno ya en proceso, usa los datos demo (`pnpm db:seed:demo` en `backend/`): Ana y Bruno ya tienen expedientes EN_PROCESO.
