# Acceso a EOS

| Rol | Quién | Ve | No ve |
|---|---|---|---|
| `ceo` | Sergio | Todo, más la **Vista CEO** (excepciones y finanzas) | — |
| `sales`, `cs`, `product`, `engineering` | Managers | Todo menos la Vista CEO; operan L10, Semana (respuestas y borrador), Rocks y Scorecard | Vista CEO |
| `team` | Resto del equipo (entra con Google @mawi.io) | **Cómo va Mawi**, Plan, Scorecard, Rocks, Semana (solo lo publicado), Equipo y roles, Trimestres — en lectura | L10, Vista CEO, respuestas individuales del check-in, IDS, editar nada |

La regla vive en `src/lib/access.ts` y la aplica el middleware
(`src/lib/auth.config.ts`): una página de managers redirige al inicio del
rol y una API responde 403.

## Login con Google

1. Google Cloud Console → APIs y servicios → Credenciales → **Crear ID de
   cliente OAuth** (tipo *Aplicación web*).
2. URI de redirección autorizado: `https://<dominio-de-eos>/api/auth/callback/google`.
3. En Vercel: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (y opcional
   `AUTH_ALLOWED_DOMAIN`, por defecto `mawi.io`). Redeploy.

Sin esas variables el botón de Google no aparece y sigue el login con
contraseña. Solo entran cuentas verificadas del dominio. Quien entra por
primera vez queda con rol `team`; los managers existentes se reconocen por su
email y conservan su rol. Para dar rol de manager a alguien, cambiar `role`
en `users`.

## Otras variables

- `HANDBOOK_URL`: link del Handbook en el menú (vacío = se oculta).
- `ROCKS_PER_PERSON_MAX`: tope de Rocks por persona y trimestre (2).
- `PUBLIC_PLAN_SHARE=1`: reactiva el link público viejo del plan (apagado).
