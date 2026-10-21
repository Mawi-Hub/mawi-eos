# Check-in semanal y resumen de empresa

## Calendario (hora de Costa Rica)

| Cuándo | Qué | Ruta (Vercel Cron) |
|---|---|---|
| Jue 15:00 | DM a cada persona del roster con el botón del formulario de su equipo | `/api/checkin/team?step=open` |
| Vie 07:00 | Sincroniza ChartMogul, HubSpot, PostHog y KPIs del plan | `/api/sync/cron` |
| Vie 07:00 | Abre la L10 del día (pre-read hasta las 09:00) | `/api/l10/cron` |
| Vie 08:00 | Recordatorio a quien no respondió | `/api/checkin/team?step=remind` |
| Vie 08:00 | Preparación de los managers (Rock, métricas, wins del equipo, acuerdos, IDS) | `/api/checkin/kpi` |
| Vie 08:45 | Aviso a los managers con algo pendiente, con lo que falta | `/api/checkin/kpi/nudge` |
| Vie 09:15 | Pre-read de la L10 | `/api/l10/digest` |
| Vie 12:00 | Borrador del resumen semanal + DM a quien facilita | `/api/weekly/cron` |
| Vie ≤15:00 | Quien facilita revisa en **EOS → Semana** y envía a `#weekly-check-ins` | (manual) |

El resumen de los lunes se eliminó: lo reemplaza el resumen del viernes.

## Check-in del equipo (formulario de Slack)

- **Quién**: `ReportMember` verificado, vigente, con `slackUserId` y `teamKey`.
  El roster vive en `config/team-roster.json` y se carga con
  `npx tsx scripts/apply-team-roster.ts config/team-roster.json [--apply]`.
- **Preguntas**: `src/lib/checkin/teams.ts`. Todos los equipos tienen el mismo
  esqueleto — resultado (con evidencia), aprendizaje, una pregunta opcional del
  equipo, números personales sin fuente, bloqueo/ayuda y compromiso para la
  próxima semana — redactado según el Rock y los KPIs del área.
- **Números de sistemas**: el formulario muestra, precargadas, las métricas de la
  selección trimestral del área (filtradas por prefijo para Soporte, Onboarding y
  Success). No se piden.
- **Energía**: la primera pregunta es la energía de la semana (1–5, obligatoria)
  y un "¿por qué?" opcional. El número se guarda en EOS solo para mostrar el
  promedio del equipo y cuántas personas están en 1–2 (página Semana; en el
  resumen público, solo el promedio y con 3 respuestas o más). El "por qué" va
  únicamente a Notion (columnas Energía y Por qué); EOS no lo guarda.
- **Compromiso anterior**: si la persona dejó uno la semana pasada, el
  formulario exige marcar Cumplido / Parcial / No se cumplió.
- **Guardado**: `/api/checkin/interactivity` (Slack Interactivity) verifica la
  firma, valida, guarda `TeamCheckin` y lo refleja en `CheckinEvidence`
  (resultado = win, bloqueo = reto) para la preparación de líderes y el resumen
  de management. Después actualiza el DM ("Recibimos tu check-in · Editar") y
  copia a Notion (`NOTION_DATABASE_ID`, columnas Área, Win, Aprendizaje, Reto,
  Compromiso, Compromiso anterior, Números; solo se escriben las que existen).
- Se puede editar hasta que se publique el resumen; cada edición guarda una revisión.

## Página Semana (`/semana`)

Participación (quién falta), respuestas por área, acuerdos/decisiones de la L10
cerrada esa semana y el borrador del resumen. CEO o facilitador pueden ocultar
o destacar respuestas, ocultar acuerdos, regenerar o editar el texto y enviarlo.
Lo oculto no le llega a Claude ni a Slack. Los IDS de management nunca se
publican: solo los acuerdos y resúmenes compartibles aprobados al cerrar la L10.
El envío usa `WEEKLY_CHANNEL_ID` y es único por semana (reclamo atómico).
Claude solo redacta "qué avanzó por área" y "lo que aprendimos"; números, Rocks,
bloqueos, acuerdos y compromisos salen tal cual de los datos.

Recomendado: cerrar la L10 con **"cerrar sin enviar"** (o dejar
`REPORT_PUBLISH_ENABLED` apagado) para que el resumen de management no salga
como un segundo mensaje: sus acuerdos ya entran en el resumen semanal.

## Configuración de Slack

- Interactivity & Shortcuts → Request URL: `https://<app>/api/checkin/interactivity`.
- Scopes del bot: `chat:write`, `im:write`, `users:read`, `users:read.email`
  (ya estaban) y el bot invitado a `#weekly-check-ins`.
- Variables: `WEEKLY_CHANNEL_ID` (canal `#weekly-check-ins`), y las existentes
  (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `CRON_SECRET`, `NOTION_*`,
  `ANTHROPIC_API_KEY`, `REPORT_COMPANY_METRICS` para los números de empresa).
- Apagar el Workflow de Slack que preguntaba en `#weekly-check-ins`
  (`CHECKIN_CHANNEL_ID`) los jueves a las 09:02. Si alguien igual responde
  ahí, se sigue capturando como antes; las respuestas en el hilo del resumen
  semanal se ignoran.

---

# Historial: check-in por canal (`#team-checkins`)

La pregunta de `#team-checkins` se programa en Slack: jueves a las 09:02,
a partir del 10 de septiembre de 2026. Confirmar que el horario del workflow
sea el de Costa Rica. No hay que agregar otro envío en Vercel.

La aplicación recibe respuestas mediante `/api/checkin`, extrae energía,
motivo, logros y retos/pedidos de ayuda con Claude y los guarda en Notion.
A partir de este cambio, los check-ins nuevos tienen `Tipo = Jueves`,
incluso cuando la respuesta llega otro día. Se aceptan respuestas parciales.
La fecha guardada corresponde al mensaje original en `America/Costa_Rica`.

Los registros históricos de Miércoles/Viernes/Otro se conservan y siguen
participando en los resúmenes. La propiedad `Tipo` de Notion sigue siendo
un select: la API agrega `Jueves` al guardar el primer registro si la
integración tiene permiso de escritura sobre la base. Si las vistas de
Notion filtran por Miércoles/Viernes, agregar Jueves a esos filtros.
No se requiere una migración de Prisma.

## Captura duradera (EOS primero)

`/api/checkin` verifica la firma de Slack, **guarda el evento** en `SlackEvent`
(único por `event_id`) y recién entonces responde 200; el procesamiento corre
en segundo plano con `after()`.

- Duplicados y reintentos se deduplican por `event_id`, no por el encabezado
  `x-slack-retry-num`. Un evento ya procesado se confirma sin hacer nada; uno
  que quedó sin procesar (falló) puede reprocesarse en un reintento de Slack.
  Si no se puede guardar el evento se responde 500 para que Slack reintente.
  `SlackEvent` registra intentos, `processedAt` y un `lastError` seguro (etapa
  y tipo de error, nunca texto de mensajes ni secretos).
- Cada respuesta se guarda como `CheckinEvidence` (único por canal + `ts`)
  **antes** de Notion: texto original verbatim, autor, win/reto extraídos,
  `periodStart` (semana del jueves, también para respuestas tardías o en hilo),
  enlace al mensaje y revisiones. La energía y el motivo personal **no** se
  guardan en EOS; siguen viajando a Notion como hasta ahora.
- La persona se identifica solo por `ReportMember.slackUserId` verificado y
  vigente al momento del mensaje. Si no hay vínculo queda pendiente de revisión
  (sin `userId` ni `areaKey`); nunca se asocia por nombre.
- Notion se escribe solo si la evidencia aún no tiene `notionPageId`, y el id de
  la página se guarda. Si Notion falla, la evidencia queda y un reintento
  completa la misma fila y la misma página (sin duplicados).
- Ediciones (`message_changed`): se agrega una revisión, se conserva el original
  y se actualizan Win/Reto de la misma página de Notion (best effort). Borrados
  (`message_deleted`): solo se marca `deletedAt`.
- No hay barrido automático de eventos sin procesar: solo un reintento de Slack
  los vuelve a ejecutar.

## Check-in de líderes v2 (`LEADER_CHECKIN_V2=1`)

Con la bandera apagada el DM de los viernes 08:00 es el flujo de siempre
(win → métricas → challenges). Con `LEADER_CHECKIN_V2=1`, quien lidera (o es
alterno de) un `ReportArea` recibe la preparación en cinco bloques, guardada en
`LeaderPrep` de la reunión próxima/en curso; quien no tiene área recibe el flujo
anterior (el cron lo informa en `legacyFallback`). Si el alterno y el líder del
mismo área reciben DM, la preparación es del líder. Las sesiones v2 usan pasos
`prep_*`; los pasos antiguos siguen funcionando para conversaciones en curso.
Las sesiones de prueba (`preview`) siguen usando el flujo anterior.

1. **Rock principal**: el de `AreaQuarterConfig` (o el primero del líder) con su
   estado. El líder responde 1) en camino, 2) en riesgo, 3) completado y el hito
   real; si se desvió, qué cambió y el próximo paso. `Rock.status` se escribe
   solo con lo que dijo el líder.
2. **Scorecard**: lista las métricas de su área en la selección del trimestre
   (valor, meta, período, fuente). Solo se piden las manuales propias sin dato
   válido del período vigente; las mensuales dicen "mes a la fecha". "Pendiente"
   se guarda como pendiente y nunca escribe 0.
3. **Wins del área**: aportes de `CheckinEvidence` del período y del área
   (omite contenido sensible). Se destacan 1–2 (`WinChallenge` con
   `highlighted=true`, `shareable=false`).
4. **Acuerdos anteriores**: `L10Commitment` abiertos/pendientes de las personas
   del área. `listo` → `done`; `pendiente` exige motivo y próximo paso, y una
   nueva fecha se registra en `dateChanges` conservando `originalDueDate`. Nunca
   se cierra nada por su cuenta.
5. **IDS y bloqueos**: máximo 3 por persona y reunión, ligados a un Rock o
   métrica (si no, se descartan con la explicación), con impacto, decisión y
   fecha. Se guardan como `L10Issue` privados (`shareable=false`).

Cada bloque guarda un borrador; al final "confirmar" marca `LeaderPrep` como
confirmada. Claude solo extrae a un esquema estricto (campos desconocidos y
evidencia ausente se rechazan); si falla, los atajos (números, "listo",
"pendiente") siguen funcionando y no se escribe nada a partir de una extracción
fallida. El texto de los mensajes es dato: no cambia responsables, metas ni
canales ni publica nada.

## Resumen de los lunes

Se eliminó (ruta, cron y código): lo reemplaza el resumen semanal del viernes.

## Verificación y vista previa

```sh
# Pruebas unitarias (sin red ni base de datos)
node_modules/.bin/tsx --test src/lib/integrations/*.test.ts
# Pruebas con Postgres LOCAL (nunca producción): src/lib/integrations/db.test.ts
TEST_DATABASE_URL=postgresql://localhost:5432/mawi_eos_dev node_modules/.bin/tsx --test src/lib/integrations/db.test.ts
npm run test:checkin:unit
npm run test:checkin
```

La primera prueba usa APIs simuladas y no necesita secretos. La segunda
prueba la extracción real de Claude con mensajes ficticios; necesita
`ANTHROPIC_API_KEY` en `.env.local` y no escribe en Notion ni Slack.
Los cambios del código entran en vigor al desplegar la aplicación.
