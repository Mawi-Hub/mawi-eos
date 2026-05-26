type ProposalStatus = "RECEIVED" | "REVIEWING" | "APPROVED" | "REJECTED";
type MilestoneStatus = "PENDING" | "MET" | "MISSED";

const STATUS_STYLES: Record<ProposalStatus, { label: string; className: string }> = {
  RECEIVED: { label: "Recibida", className: "bg-blue-100 text-blue-800" },
  REVIEWING: { label: "En revisión", className: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Aprobada", className: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "Rechazada", className: "bg-red-100 text-red-800" },
};

const MILESTONE_STYLES: Record<MilestoneStatus, { label: string; className: string }> = {
  PENDING: { label: "Pendiente", className: "text-gray-500" },
  MET: { label: "Cumplido", className: "text-emerald-700" },
  MISSED: { label: "No cumplido", className: "text-red-700" },
};

type Milestone = {
  id: string;
  quarter: string;
  description: string;
  targetDate: Date | string;
  status: MilestoneStatus;
};

export function PlanProposalCard({
  proposal,
}: {
  proposal: {
    id: string;
    area: string;
    status: ProposalStatus;
    content: string;
    owner: { name: string };
    milestones: Milestone[];
    createdAt: Date | string;
  };
}) {
  const statusStyle = STATUS_STYLES[proposal.status];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold capitalize text-gray-900">{proposal.area}</div>
          <div className="text-xs text-gray-500">
            {proposal.owner.name} •{" "}
            {new Date(proposal.createdAt).toLocaleDateString("es", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
        </div>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.className}`}
        >
          {statusStyle.label}
        </span>
      </div>

      <p className="mb-4 whitespace-pre-wrap text-sm text-gray-700">{proposal.content}</p>

      {proposal.milestones.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            Milestones
          </div>
          <ul className="space-y-2">
            {proposal.milestones.map((m) => {
              const mStyle = MILESTONE_STYLES[m.status];
              return (
                <li key={m.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="mr-2 inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                      {m.quarter}
                    </span>
                    <span className="text-gray-700">{m.description}</span>
                  </div>
                  <div className={`text-xs ${mStyle.className}`}>
                    {new Date(m.targetDate).toLocaleDateString("es", {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    · {mStyle.label}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
