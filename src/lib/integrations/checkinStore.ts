// Persistencia de la evidencia del check-in (EOS primero, Notion es la
// proyección) detrás de una interfaz pequeña para poder simularla en pruebas.
// El cliente de Prisma se importa de forma diferida: importar este módulo en
// una prueba sin base de datos no abre ninguna conexión.

// Error con la etapa que falló. Solo `step` y el nombre de la causa llegan a
// SlackEvent.lastError: nunca el mensaje (puede traer texto de personas o datos
// de las APIs).
export class StepError extends Error {
  constructor(public readonly step: string, public readonly cause: unknown) {
    super(`${step} failed`);
    this.name = "StepError";
  }
}

export function safeErrorLabel(error: unknown): string {
  const clean = (v: unknown) => String(v ?? "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40);
  if (error instanceof StepError) return `${clean(error.step)}:${safeErrorLabel(error.cause)}`;
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" && /^[A-Z0-9_]{2,20}$/.test(code) ? `${clean(error.name)}:${code}` : clean(error.name) || "Error";
  }
  return "unknown";
}

export type EvidenceRevision = {
  at: string; // ISO
  text: string;
  win: string | null;
  challenge: string | null;
};

export type EvidenceRecord = {
  id: string;
  channelId: string;
  messageTs: string;
  slackUserId: string;
  userId: string | null;
  areaKey: string | null;
  authorName: string;
  periodStart: Date;
  reportedAt: Date;
  originalText: string;
  win: string | null;
  challenge: string | null;
  permalink: string | null;
  notionPageId: string | null;
  revisions: EvidenceRevision[];
  deletedAt: Date | null;
};

export type NewEvidence = Omit<EvidenceRecord, "id" | "notionPageId" | "revisions" | "deletedAt">;

export type EvidencePatch = Partial<
  Pick<EvidenceRecord, "userId" | "areaKey" | "win" | "challenge" | "permalink" | "notionPageId" | "revisions" | "deletedAt">
>;

export type MemberMatch = { userId: string | null; areaKey: string | null };

export type CheckinStore = {
  findEvidence(channelId: string, messageTs: string): Promise<EvidenceRecord | null>;
  // Idempotente: si (channelId, messageTs) ya existe devuelve la fila existente.
  createEvidence(data: NewEvidence): Promise<{ record: EvidenceRecord; created: boolean }>;
  updateEvidence(id: string, patch: EvidencePatch): Promise<EvidenceRecord>;
  // Solo vínculos verificados y vigentes al momento del mensaje. Nunca por nombre.
  resolveMember(slackUserId: string, at: Date): Promise<MemberMatch | null>;
};

type Row = {
  id: string; channelId: string; messageTs: string; slackUserId: string; userId: string | null;
  areaKey: string | null; authorName: string; periodStart: Date; reportedAt: Date; originalText: string;
  win: string | null; challenge: string | null; permalink: string | null; notionPageId: string | null;
  revisions: unknown; deletedAt: Date | null;
};

function toRecord(row: Row): EvidenceRecord {
  return { ...row, revisions: Array.isArray(row.revisions) ? (row.revisions as EvidenceRevision[]) : [] };
}

async function db() {
  return (await import("@/lib/db")).prisma;
}

export const prismaCheckinStore: CheckinStore = {
  async findEvidence(channelId, messageTs) {
    const prisma = await db();
    const row = await prisma.checkinEvidence.findUnique({ where: { channelId_messageTs: { channelId, messageTs } } });
    return row ? toRecord(row) : null;
  },

  async createEvidence(data) {
    const prisma = await db();
    try {
      const row = await prisma.checkinEvidence.create({ data });
      return { record: toRecord(row), created: true };
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const row = await prisma.checkinEvidence.findUnique({
        where: { channelId_messageTs: { channelId: data.channelId, messageTs: data.messageTs } },
      });
      if (!row) throw error;
      return { record: toRecord(row), created: false };
    }
  },

  async updateEvidence(id, patch) {
    const prisma = await db();
    const { revisions, ...rest } = patch;
    const row = await prisma.checkinEvidence.update({
      where: { id },
      data: { ...rest, ...(revisions ? { revisions: revisions as unknown as object } : {}) },
    });
    return toRecord(row);
  },

  async resolveMember(slackUserId, at) {
    const prisma = await db();
    const members = await prisma.reportMember.findMany({
      where: {
        slackUserId,
        identityVerified: true,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      include: { area: { select: { key: true } } },
      orderBy: { validFrom: "desc" },
    });
    if (members.length === 0) return null;
    const userIds = new Set(members.map((m) => m.userId).filter((v): v is string => !!v));
    const areaKeys = new Set(members.map((m) => m.area.key));
    // Ambiguo (varias personas o varias áreas) = no se asigna; queda para revisión.
    return {
      userId: userIds.size === 1 ? [...userIds][0] : null,
      areaKey: areaKeys.size === 1 ? [...areaKeys][0] : null,
    };
  },
};
