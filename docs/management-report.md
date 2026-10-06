# Reporte de management (Q4 2026) — guía de configuración y operación

Todo lo nuevo viene **apagado por defecto**. Nada de esto envía mensajes ni cambia
vistas hasta que se activen las banderas de abajo. Las definiciones y metas de la
propuesta son **borradores pendientes de validar**, no acuerdos.

## Qué cambia

| Pieza | Qué hace | Dónde |
|---|---|---|
| Check-in del equipo (jueves) | Sigue siendo el único flujo del equipo. Ahora además se guarda **primero en EOS** (`CheckinEvidence`) con autor, mensaje original y permalink; Notion sigue siendo la proyección. Ediciones = revisión; borrados = marca, nunca se pierde. | `src/lib/integrations/checkin.ts`, `src/app/api/checkin/route.ts` |
| Check-in de líderes (jueves 16:00 CR, igual que hoy) | Con `LEADER_CHECKIN_V2=1` pasa a cinco bloques precargados (Rock, scorecard, wins, acuerdos, IDS). Con la bandera apagada se conserva el flujo anterior. | `src/lib/integrations/kpiCheckin.ts` |
| Selección de métricas por trimestre | **Una sola lista** (`QuarterMetricSelection`) que leen Plan H2, Scorecard, L10 y los check-ins. Ocultar = no estar en la lista; los datos, fuentes e histórico no se tocan. Con `REPORT_SELECTION_ENABLED=1`. | `src/lib/selection/` |
| Cierre de reunión → resumen | «Cerrar y enviar resumen» (o «Cerrar sin enviar» con motivo) guarda el snapshot, la intención de publicar y las entregas en una transacción; luego un worker envía. | `src/lib/report/`, `src/app/api/l10/meetings/close` |

Fuera del MVP (no se hizo): módulo «Mi semana», encuesta del viernes, compensación,
evaluaciones, ranking, migración de Notion, cambio de permisos de páginas o canales.

## Variables de entorno (nombres, sin valores)

| Variable | Efecto |
|---|---|
| `REPORT_SELECTION_ENABLED=1` | Las vistas usan la selección trimestral. Apagada = comportamiento anterior (`isActive`). |
| `LEADER_CHECKIN_V2=1` | Check-in de líderes de cinco bloques. |
| `REPORT_PUBLISH_ENABLED=1` **y** `REPORT_CHANNEL_ID=<canal>` | Habilita «Cerrar y enviar». Sin ambas solo se puede «Cerrar sin enviar». El canal **no** se infiere del de la prelectura privada. |
| `REPORT_NOTION_PARENT_PAGE_ID` | Opcional: proyección unidireccional del resumen en una página de Notion. |
| `REPORT_COMPANY_METRICS` | Opcional: nombres (coma) de métricas de empresa (NDR, MRR, clientes nuevos) que se pueden mostrar a esta audiencia. Vacío = no se muestran. |
| `REPORT_REPLACE_MONDAY_DIGEST=1` | Apaga **solo** el resumen general del lunes (`/api/checkin/digest`) cuando el nuevo lo sustituye. No toca el L10 privado. |
| `HUBSPOT_WRITE_RATE_ENTRIES=1` | Escribe show rate / % de cierre mensual a `ScorecardEntry` (sin meta confirmada → `pending`). Ya corregidos: paginación completa y denominadores. Dejar apagada hasta validar definiciones con Ventas. |
| `CRON_SECRET` | **Obligatorio**: los 4 crons ahora fallan cerrado (401) sin él. `/api/checkin/digest` ya lo exigía; confirmar que está en Vercel antes de desplegar. |

## Orden de activación sugerido

1. **Migración** (aditiva): `prisma migrate deploy` aplica `20261006000000_management_report`. No borra ni cambia tipos; los acuerdos y reuniones cerradas existentes se rellenan sin riesgo (las cerradas quedan con `close_origin = 'migration'`, así que nada las publica).
2. **Configurar** (simulación primero): `npm run report:config -- config/management-report.q4-2026.json` y, si se ve bien, `... --apply`. Crea las 5 áreas (Ventas/Lore, Growth/Fede, Customer, Producto, Ingeniería), la selección Q4 con las 8 métricas **todas pendientes** y mapea `PlanKPI → ScorecardMetric` solo cuando es inequívoco. Lo ambiguo sale en «Para revisión».
3. Completar el roster (`members` en el JSON: `slackUserId`, `verified`) y los suplentes. Sin vínculo verificado, la persona queda «pendiente de mapeo»; nunca se asocia por nombre.
4. Encender `REPORT_SELECTION_ENABLED=1` y revisar Scorecard / Plan H2 / L10.
5. Probar `LEADER_CHECKIN_V2=1` con un solo líder (`/api/checkin/kpi?preview=1&onlyEmail=…` solo envía a esa persona y no guarda nada).
6. Con canal y audiencia confirmados: `REPORT_CHANNEL_ID` + `REPORT_PUBLISH_ENABLED=1`; primera reunión en un **canal de prueba**.
7. Recién entonces `REPORT_REPLACE_MONDAY_DIGEST=1`.

## Inventario de emisores (verificar contra el despliegue real)

Según `vercel.json` y `docs/checkins.md` (no prueba qué está desplegado ni los programadores externos):

| Emisor | Cuándo (CR) | Destino | Estado con este cambio |
|---|---|---|---|
| Pregunta general del equipo | Jueves 09:02 (externo, Slack) | `#team-checkins` | Sin cambios |
| Check-in de líderes | Jueves 16:00 (`/api/checkin/kpi`) | DM | Igual; 5 bloques con `LEADER_CHECKIN_V2` |
| Preparación del L10 | Viernes 07:00 (`/api/l10/cron`) | — | Igual; sus cierres de reuniones viejas ahora son `system_cron` y **nunca publican** |
| Prelectura privada | Viernes 09:15 (`/api/l10/digest`) | DM / `L10_CHANNEL_ID` | Sin cambios |
| Resumen general | Lunes 08:00 (`/api/checkin/digest`) | `#team-checkins` | Se apaga con `REPORT_REPLACE_MONDAY_DIGEST` |
| **Resumen de management (nuevo)** | Al cerrar la reunión en EOS | `REPORT_CHANNEL_ID` | Sin cron de hora fija |

`digestPeriod` (7 días previos) sigue solo para el resumen del lunes; el reporte nuevo usa el
período y el corte explícitos de la reunión (lunes→domingo CR, `period_start/period_end/cut_at`).

## Operar y recuperar

- El envío corre justo después del cierre (`after`). Si el proceso muere, las entregas quedan en `report_deliveries` (`pending`/`failed`).
- **Reintentar**: `POST /api/report/reports/<reportId>` con `{"action":"process"}` (CEO o facilitador). Una entrega `failed` puede reiniciarse con `POST /api/report/deliveries/<id>` `{"action":"retry"}`.
- **Resultado incierto** (`uncertain`): el sistema no reenvía. Verificar en Slack/Notion; luego `confirm_sent` (con `messageTs` opcional) o `confirm_not_sent`.
- **Reporte cerrado sin enviar** (`skipped`): queda visible con su motivo; `{"action":"publish_skipped"}` lo publica cuando ya hay canal.
- No se agregó un cron de reintentos a `vercel.json` (un cron más frecuente puede romper el despliegue según el plan de Vercel). Si se quiere, crear uno que llame `process` para reportes `pending`/`failed`.
- Reabrir antes del envío cancela el trabajo pendiente; reabrir tras publicar conserva lo enviado, y al volver a cerrar solo se crea una **actualización** (mismo hilo) si el contenido compartible cambió.

## Privacidad

- El resumen se arma solo con campos explícitos: Rocks, scorecard seleccionado, wins destacados, contribuciones aprobadas, `sharedSummary` de IDS compartibles y acuerdos compartibles. Las notas del L10, `description`/`resolution` de los IDS, energía y motivos personales **no** tienen camino hacia el resumen.
- `screenSensitive` bloquea (sin posibilidad de forzar) texto con salud, compensación, evaluaciones, vida personal, confidencial o journal. Es una red de seguridad: la barrera principal es la lista de campos.
- Las menciones masivas (`@channel`, `@here`) y el markup de enlaces se neutralizan; el texto de los mensajes es dato, nunca instrucción.
- Quien cierra revisa la vista previa (texto, destino, qué se incluye) antes de enviar. No hay lista pública de ausentes, solo cobertura agregada.

## Rollback

1. Apagar `REPORT_PUBLISH_ENABLED`, `LEADER_CHECKIN_V2`, `REPORT_SELECTION_ENABLED` y `REPORT_REPLACE_MONDAY_DIGEST` → vuelve la presentación y los flujos anteriores. Nada se borra.
2. Solo si hace falta revertir el esquema: respaldar y correr `prisma/migrations/20261006000000_management_report/down.sql` (documentado en el archivo; borra únicamente lo creado por esta migración) y `prisma migrate resolve --rolled-back 20261006000000_management_report`.

## Pruebas

```bash
npm run test:unit            # todo src/**/*.test.ts; las pruebas con base de datos se saltan solo si no hay Postgres local
npm run test:checkin:unit    # pruebas del check-in existentes
npm run report:preview       # imprime las vistas previas (datos de prueba; no envía nada)
```

Las pruebas con base de datos **solo corren contra localhost** (`src/test/db.ts`) y usan proveedores falsos de Slack/Notion:

```bash
createdb mawi_eos_dev && DATABASE_URL=postgresql://<usuario>@localhost:5432/mawi_eos_dev npx prisma db push
DATABASE_URL=postgresql://<usuario>@localhost:5432/mawi_eos_dev npm run test:unit
```

Cuidado: `npm run test:checkin` usa Claude real y `preview:checkin` lee Notion y Claude;
`scripts/send-kpi-checkin.ts --preview` crea sesiones y manda DMs, y `--reset` borra sesiones aun con `--dry-run`.
`scripts/test-kpi-checkin.ts` (dry-run) lee la base y Slack sin crear sesiones ni DMs. **No ejecutar `prisma/seed.mjs`** (borra scorecard) ni `prisma/seeds/planH2.ts` (borra PlanKPI fuera de su lista).

## Pendiente / límites conocidos

- Hora del check-in de líderes: se mantiene jueves 16:00 CR (decisión del CEO).
- La personalización «Rock de tu área» en el check-in del equipo **no** se implementó (decisión del CEO); `renderTeamCheckinPrompt` deja el texto listo.
- Métricas de empresa (NDR, MRR, clientes nuevos) por audiencia: configurables con `REPORT_COMPANY_METRICS`; no hay un NDR conciliado como `ScorecardMetric` (el dashboard lo deriva de ChartMogul).
- Definiciones, metas, flujo real de onboarding, lista de fricciones, suplentes y publicador siguen **pendientes de validar** con los líderes; el JSON las carga como borrador.
- Enlace de cita↔oportunidad en HubSpot y `lead_id/first_accepted_at` de Growth no están implementados: requieren definir la fuente.
- Los permisos del `POST`/`DELETE` de `/api/l10/commitments` (cualquier usuario autenticado) son anteriores a este cambio; no se modificaron.
