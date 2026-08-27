import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const MEETING_ID  = "4e6155c8-be5c-4e09-b4d7-0d9731d89a97";
const QUARTER_ID  = "af613349-0a49-4f95-a22c-453f8e90f55b";

const SERGIO = "8fc1a23c-4622-4882-8fac-28c3c11618fe";
const GABY   = "08a408f4-8f68-45ad-bcef-e00f52ea2c06";
const ADRIAN = "510d3953-5ed4-491d-b03a-f405406df040";

// Issue IDs existentes en la reunión del 7 de agosto
const ISSUE_CAMPO        = "00ebbbff-98a5-4218-90de-6f77c5d6fe1e";
const ISSUE_INTEGRACION  = "9186b691-59fe-44c7-9fc5-d260ba5ad216";
const ISSUE_TICKETS      = "f8357d48-e95a-4328-9127-1d483ac0f0bc";
const ISSUE_AGENCY       = "5568f7ad-133f-4bdd-bbde-d791b1ad46fd";

const NOTES = `## IDS discutidos

**1. Activación de campo / residentes** — Sergio
Los residentes son el rol con menor adopción. Clientes que cruzan el umbral de activación en las primeras 4 semanas (100+ eventos, 5+ facturas u OC) tienen 80% de retención vs 50% los que no lo cruzan.
Decisión: el problema se resuelve desde producto, no cultura. Visitar obras con Gaby y Gustavo para observar el flujo real del residente. Identificar 1-2 procesos concretos (pedidos de material, avances de obra) y reducir fricción con lo que ya existe, sin construir features nuevos todavía.

**2. Integraciones contables — 4 clientes con necesidad** — Fede / Gaby
Solo existe integración de facturas, construida hace 8 meses sin planificación ni entorno de prueba. Clientes piden OC, pagos y notas de crédito.
Decisión: no se prometen fechas a ningún cliente. Adrián y Gustavo definen el paquete completo (facturas + OC + pagos + notas de crédito + entorno de prueba) antes de venderlo. Sergio habla con Glory sobre roadmap y recurso dedicado. Ventas vende lo que existe hoy.

**3. Agency adquirida — plataforma de CS sin servicio al 31 de agosto** — Gaby
Usaban Agency para briefs pre-reunión, transcripción + minutas automáticas, health score automatizado (L/M/V) e historial integrado con HubSpot.
Decisión: Gaby y Jay hacen research de alternativas esta semana. Deadline real: 31 de agosto. Decisión sobre qué adoptar la próxima semana. No construir solución in-house por ahora.

## Compromisos acordados

| Dueño | Acción | Deadline |
|-------|--------|----------|
| Adrián | Definir paquete completo de integración contable (facturas, OC, pagos, notas de crédito, entorno de prueba) — base para que Glory y Ventas definan roadmap | 10 ago |
| Gaby | Research herramientas para reemplazar Agency con Jay — shortlist con pros/cons | 14 ago |
| Gaby | Revisar acceso a plataforma y enviar correo masivo a base de clientes (pendiente de semanas anteriores) | 14 ago |
| Gustavo | Enviar prototipo de reglas UX/UI + onboarding al equipo para revisión | 17 ago |`;

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // 1. Resolver issues con sus acuerdos
  await prisma.l10Issue.update({
    where: { id: ISSUE_CAMPO },
    data: {
      idsStatus: "resolved",
      ownerId: SERGIO,
      resolution: "Problema se resuelve desde producto. Próximo paso: visitar obras (Gaby + Gustavo) para observar flujo real del residente. Identificar 1-2 procesos (pedidos de material, avances de obra) y reducir fricción con lo existente. Sin features nuevos todavía.",
    },
  });
  console.log("✓ Issue 'Adopción y Campo' → resolved");

  await prisma.l10Issue.update({
    where: { id: ISSUE_INTEGRACION },
    data: {
      idsStatus: "resolved",
      ownerId: ADRIAN,
      resolution: "No se prometen fechas. Adrián + Gustavo definen paquete completo (facturas + OC + pagos + notas de crédito + entorno de prueba) antes de venderlo. Sergio habla con Glory sobre roadmap y recurso dedicado. Ventas vende solo lo que existe hoy.",
    },
  });
  console.log("✓ Issue 'Integraciones contables' → resolved");

  await prisma.l10Issue.update({
    where: { id: ISSUE_TICKETS },
    data: {
      idsStatus: "resolved",
      ownerId: GABY,
      resolution: "Gustavo se pone al día hoy. Testing de cancelación automática lo cubre Gaby. Adrián disponible para apoyar testing cuando sea necesario.",
    },
  });
  console.log("✓ Issue 'PRODUCTO - Atraso con tickets' → resolved");

  await prisma.l10Issue.update({
    where: { id: ISSUE_AGENCY },
    data: {
      idsStatus: "resolved",
      ownerId: GABY,
      resolution: "Gaby + Jay hacen research de alternativas esta semana. Deadline: 31 de agosto. Decisión la próxima semana. No construir solución in-house por ahora.",
    },
  });
  console.log("✓ Issue 'Agency adquirida' → resolved");

  // 2. Crear compromisos de la reunión
  const created = await prisma.l10Commitment.createMany({
    data: [
      {
        meetingId: MEETING_ID,
        ownerId: ADRIAN,
        action: "Definir paquete completo de integración contable (facturas, OC, pagos, notas de crédito, entorno de prueba) — base para que Glory y Ventas definan roadmap y cuándo se puede vender",
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        done: false,
      },
      {
        meetingId: MEETING_ID,
        ownerId: GABY,
        action: "Research de herramientas para reemplazar Agency con Jay — shortlist con pros/cons antes del 31 de agosto",
        dueDate: new Date("2026-08-14T00:00:00.000Z"),
        done: false,
      },
      {
        meetingId: MEETING_ID,
        ownerId: GABY,
        action: "Revisar acceso a plataforma y enviar correo masivo a base de clientes (pendiente de semanas anteriores)",
        dueDate: new Date("2026-08-14T00:00:00.000Z"),
        done: false,
      },
    ],
  });
  console.log(`✓ ${created.count} compromisos creados`);

  // 3. Cerrar la reunión del 7 de agosto
  await prisma.l10Meeting.update({
    where: { id: MEETING_ID },
    data: {
      status: "completed",
      phase: "closed",
      notes: NOTES,
    },
  });
  console.log("✓ Reunión del 7 de agosto → completed / closed");

  // 4. Crear reunión del 14 de agosto (mañana, 8am Costa Rica = 14:00 UTC)
  const next = await prisma.l10Meeting.create({
    data: {
      quarterId: QUARTER_ID,
      date: new Date("2026-08-14T14:00:00.000Z"),
      status: "upcoming",
      phase: "preread",
    },
  });
  console.log(`✓ Nueva reunión del 14 de agosto creada → ID: ${next.id}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
