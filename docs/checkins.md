# Check-in semanal del equipo

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

Con la bandera apagada el DM de los jueves 16:00 es el flujo de siempre
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

El cron existente en `vercel.json` sigue llamando `/api/checkin/digest` los
lunes a las 08:00 de Costa Rica (`0 14 * * 1`). Resume el lunes–domingo
anterior y consulta también la semana previa como comparación.

- Participación por personas distintas, sin asumir el tamaño del equipo.
- Energía calculada por código usando el último valor válido por persona.
  La comparación usa solo personas con energía en ambas semanas y se muestra
  cuando hay al menos dos; no mezcla muestras distintas.
- El mensaje se dirige a toda la empresa: primero todos los bloqueos
  laborales y pedidos de ayuda, con quién los reportó y qué necesita cuando
  lo expresó; después los avances y las formas de colaborar. Se agrupan
  bloqueos relacionados sin perder sus participantes.
- Las propuestas de la IA se etiquetan como sugerencias; no se inventan
  responsables, fechas ni compromisos. Se omiten detalles personales,
  familiares o de salud y puntajes individuales de energía.
- Retos anteriores solo aportan contexto para detectar temas recurrentes.
  No se supone que un reto reportado siga abierto el lunes.
- Si Claude falla, se muestran las estadísticas y todas las personas que
  compartieron retos, invitando a revisar sus respuestas originales. No se
  copian campos históricos que pueden mezclar asuntos laborales y personales.
  La consulta de Notion recorre todas las páginas.

El resumen de management L10 y el check-in privado de KPIs tienen sus propios
horarios y fuentes de datos.

## Verificación y vista previa

```sh
# Pruebas unitarias (sin red ni base de datos)
node_modules/.bin/tsx --test src/lib/integrations/*.test.ts
# Pruebas con Postgres LOCAL (nunca producción): src/lib/integrations/db.test.ts
TEST_DATABASE_URL=postgresql://localhost:5432/mawi_eos_dev node_modules/.bin/tsx --test src/lib/integrations/db.test.ts
npm run test:checkin:unit
npm run test:checkin
npm run preview:checkin -- --date 2026-09-14
```

La primera prueba usa APIs simuladas y no necesita secretos. La segunda
prueba la extracción real de Claude con mensajes ficticios; necesita
`ANTHROPIC_API_KEY` en `.env.local` y no escribe en Notion ni Slack.
La vista previa lee Notion y usa Claude, pero no publica mensajes ni escribe
registros. `--date` es la fecha de publicación a simular; para revisar un
resumen de lunes, usar un lunes. Sin fecha, muestra los siete días completos
anteriores al día actual en Costa Rica.

También se puede usar `/api/checkin/digest?dryRun=1` con
`Authorization: Bearer <CRON_SECRET>`. El endpoint requiere que el secreto
esté configurado, tanto para publicar como para previsualizar.

Los cambios del código entran en vigor al desplegar la aplicación.
