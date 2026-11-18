# MCP de EOS (solo lectura)

`/api/mcp` expone todo lo que se registra en EOS como un servidor MCP para Claude:
rocks, scorecard, métricas del trimestre, wins y retos, reuniones L10 (issues,
votos, compromisos, anotaciones, coverage, preparación, reportes), check-ins del
equipo y su evidencia, resúmenes semanales y el plan.

- **Solo lectura**: ninguna herramienta escribe.
- **Sin estado**: Streamable HTTP; cada POST es un mensaje JSON-RPC con su respuesta en JSON. No usa sesiones ni SSE.
- **Fuera de la sesión de la app**: el middleware no lo protege; lo protege `MCP_TOKEN`.

## Exclusiones

- `password_hash` nunca sale.
- La energía del check-in del equipo se devuelve **solo agregada por semana**
  (promedio y cuántas personas marcaron 1–2), igual que en la app.

## Configuración

1. Generar un token largo y guardarlo en Vercel (Production):

   ```bash
   openssl rand -hex 32
   ```

   ```bash
   vercel env add MCP_TOKEN production
   ```

   Sin `MCP_TOKEN` el endpoint responde 401 a todo (falla cerrado).

2. Redeploy.

## Conectarlo

**Claude Code** (token en header):

```bash
claude mcp add --transport http mawi-eos https://<dominio>/api/mcp --header "Authorization: Bearer <MCP_TOKEN>"
```

**Claude (web/desktop), conector personalizado**: Configuración → Conectores →
Agregar conector personalizado, con la URL
`https://<dominio>/api/mcp?token=<MCP_TOKEN>`. Esos conectores no permiten
headers fijos, por eso se acepta el token en la URL. Trátala como una contraseña.

Para rotar el token: cambiar `MCP_TOKEN` en Vercel, redeploy y actualizar el conector.

## Herramientas

| Herramienta | Qué devuelve |
|---|---|
| `guia` | Definiciones y estados; el modelo la lee primero |
| `personas` | Usuarios, accountability chart, áreas con líder/alterno/miembros |
| `trimestres` | Trimestres, objetivo, plan, conteos |
| `rocks` | Rocks con avance, estado e issues ligados (default: trimestre activo) |
| `scorecard` | Métricas y entradas por período (default: trimestre activo) |
| `seleccion_metricas` | Lista oficial de métricas por área del trimestre |
| `wins_retos` | Wins y retos de líderes |
| `l10_reuniones` | Lista de L10 con conteos |
| `l10_reunion` | Detalle completo de una L10 (por id o fecha) |
| `issues` | Issues de todas las L10 (`estado: "abiertos"`) |
| `compromisos` | Compromisos (`estado: "vencidos"`) |
| `checkins_equipo` | Respuestas del check-in del equipo + energía agregada |
| `evidencia_checkins` | Texto original de cada check-in con permalink |
| `resumenes_semanales` | Resúmenes de #weekly-check-ins |
| `plan` | Plan con KPIs, entradas, acciones, riesgos y propuestas |
| `reportes_reunion` | Snapshots publicados de cada L10 cerrada |

Filtros comunes: `trimestre` ("2026-Q4" | "activo" | "todos"), `persona`
(nombre, apodo o email), `desde`/`hasta` (AAAA-MM-DD, hora de Costa Rica), `limite`.

## Prueba rápida

```bash
curl -s -X POST https://<dominio>/api/mcp -H "authorization: Bearer $MCP_TOKEN" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
