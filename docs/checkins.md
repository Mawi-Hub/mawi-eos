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
