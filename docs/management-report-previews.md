# Vistas previas de los mensajes de Slack

> Generado con `npx tsx scripts/preview-report.ts --write`. **Datos de prueba**: nombres, cifras y enlaces son ficticios. No se envió nada.

## 1. Check-in del equipo (jueves) — texto de la pregunta única, sin cambios de flujo

```
Equipo, compartamos los wins y challenges de esta semana.

Rocks vigentes por área:
• Ventas: Proceso comercial repetible
• Growth: Experimentos de adquisición priorizados
• Customer: por definir

¿Qué avance o resultado concreto lograste y cómo ayuda a ese Rock? ¿Qué se trabó y qué ayuda necesitás? Si podés, agregá un ejemplo o enlace. Si fue trabajo operativo importante fuera del Rock, contalo igual e indicá por qué aportó.
```

## 2. Check-in de líderes (jueves por la noche) — cinco bloques precargados

```
Lider Ventas, preparemos management de 9 oct. Esto está precargado con EOS y los reportes de tu equipo; confirmá o corregí lo que haga falta.

*1. Rock principal:* Proceso comercial repetible (en camino). ¿Va en camino, está en riesgo o está completado? ¿Qué hito o avance real hubo? Si se desvió, ¿qué cambió y cuál es el siguiente paso?

*2. Scorecard del trimestre:*
• Show rate: 66.7% (8/12) · meta por confirmar · mes a la fecha (oct 2026) · HubSpot
• Porcentaje de cierre: pendiente · meta por confirmar · mes a la fecha (oct 2026) · HubSpot
Confirmá los datos o completá los pendientes. Para métricas mensuales usá mes a la fecha o último mes cerrado; no inventés un resultado semanal.

*3. Wins del área:* elegí uno o dos resultados que valga la pena destacar, quiénes contribuyeron y por qué importan. Ya tenés las respuestas del equipo (4/5).

*4. Acuerdos anteriores de management:*
• Entregar el playbook comercial v1 — Lider Ventas, vence 2026-10-09
Marcá cumplido o pendiente. Si sigue pendiente, indicá la razón y el siguiente paso; una nueva fecha conserva la fecha original y su motivo.

*5. IDS y bloqueos:* ¿qué problema necesita discusión o ayuda de otra área? Indicá impacto, decisión que necesitás y fecha real si existe. Podés proponer una solución, pero no es obligatorio tenerla antes de pedir ayuda.

Acciones: *Guardar borrador* / *Confirmar preparación*. Confirmar registra los datos y su procedencia; no publica el contenido privado ni asigna tareas a otra área por sí solo. Registro de la reunión: https://eos.example.test/l10
```

## 3.1 Resumen al cerrar management — mensaje principal

```
*Mawi · Management del 9 oct*
Objetivo del trimestre (Q4 2026): Llegar a un proceso comercial repetible y a un primer flujo real del cliente (DATO DE PRUEBA)
_Información al viernes, 9 de octubre, 11:40 · Reunión cerrada por Facilitador de Prueba_

*Rocks y avances*
*Ventas* · Lider Ventas · Proceso comercial repetible · en camino (45%)
   Avance: El playbook pasó la primera prueba con 2 demos sin el founder. Próximo paso: Validar el cierre con 3 oportunidades más.
*Growth* · Lider Growth · Experimentos de adquisición priorizados · en riesgo (20%)
   Avance: sin novedades compartidas. _(preparación sin confirmar)_
*Customer* · Lider Customer · Rock principal por definir
   Avance: pendiente de preparación del líder.

*Scorecard del trimestre*
_Ventas_
• Show rate · 66.7% (8/12) · meta pendiente · mes a la fecha (oct 2026)
• Porcentaje de cierre: falta el dato de mes a la fecha (oct 2026). Responsable: Lider Ventas. Último valor válido: 22% de último mes cerrado (sep 2026) (anterior; no define el estado actual).
_Growth_
• Leads calificados nuevos originados por Marketing · _pendiente de configuración (definición, fuente o meta sin aprobar)_
_Resultados de empresa_
• NDR · 97.2% · meta pendiente · último mes cerrado (sep 2026)

*Wins y contribuciones*
• Primer cierre sin intervención del founder (USD 450 MRR) — Persona A, Persona B. Por qué importa: Prueba que el playbook funciona
_Las contribuciones del equipo, agrupadas por área, están en este hilo ↓_

*Bloqueos y decisiones*
• El importador necesita apoyo de Ingeniería para el piloto · puede ayudar: Lider Ingeniería · fecha necesaria: 2026-10-30 · decisión pendiente

*Acuerdos*
• Entregar el playbook comercial v1 · responsable Lider Ventas · fecha 2026-10-16 (fecha original 2026-10-09; motivo: Depende de la validación de Producto) · estado pendiente · siguiente paso: Cerrar el borrador el lunes
• Definir el flujo real de onboarding · responsable Lider Customer · fecha 2026-10-23 · estado propuesto (aún no aceptado)

Detalle y fuentes: https://eos.example.test/l10
```

## 3.2 Resumen al cerrar management — respuesta en el hilo

```
*Contribuciones del equipo · Ventas*
• Persona A: Cerré la demo y dejé el seguimiento en HubSpot
• Persona B: Preparé el material de la demo · Reto: faltó el dato de asistencia

*Contribuciones del equipo · Growth*
• Persona C: Lancé 2 experimentos de anuncios _(llegó después del corte)_
```

## 3.x Actualización posterior (mismo hilo, versionada) — primeras líneas

```
*Mawi · Management del 9 oct* — ✏️ *Actualización*
_Corrige la versión 1: Se completó el playbook. Lo publicado antes se conserva._
Objetivo del trimestre (Q4 2026): Llegar a un proceso comercial repetible y a un primer flujo real del cliente (DATO DE PRUEBA)
_Información al viernes, 9 de octubre, 11:40 · Reunión cerrada por Facilitador de Prueba_
```

## 4. Faltantes y errores

```
• Porcentaje de cierre: falta el dato de oct 2026. Responsable: Lider Ventas. Último valor válido: 22% de sep 2026, anterior; no define el semáforo actual.
• Show rate: la fuente no se actualiza desde 2026-09-28. Falta validar el período actual.
• Falta confirmar el bloque 4 (acuerdos anteriores) para management de 9 oct. Lo demás ya quedó guardado: https://eos.example.test/l10
• No pude guardar toda tu respuesta. Tu mensaje original sigue disponible; te confirmaremos cuando se recupere.
• La reunión y el reporte están guardados, pero falló el envío a Slack. Estado y reintento: https://eos.example.test/l10
• No pudimos confirmar si se publicó. Pausamos el reenvío hasta verificarlo: https://eos.example.test/l10
```
