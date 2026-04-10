import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { STATUS_CONFIG } from "@/lib/utils";
import { RockForm } from "./rock-form";
import { RockUpdateForm } from "./rock-update-form";
import { RockEditForm } from "./rock-edit-form";

export default async function RocksPage() {
  const session = await auth();
  const activeQuarter = await prisma.quarter.findFirst({
    where: { isActive: true },
  });

  if (!activeQuarter) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No hay trimestre activo.</p>
      </div>
    );
  }

  const rocks = await prisma.rock.findMany({
    where: { quarterId: activeQuarter.id },
    include: { owner: true },
    orderBy: [{ owner: { name: "asc" } }, { createdAt: "asc" }],
  });

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });

  // Group by owner
  const grouped = users
    .map((user) => ({
      user,
      rocks: rocks.filter((r) => r.ownerId === user.id),
    }))
    .filter((g) => g.rocks.length > 0 || g.user.id === session?.user?.id);

  const currentUserRockCount = rocks.filter((r) => r.ownerId === session?.user?.id).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rocks</h1>
          <p className="mt-1 text-sm text-gray-500">
            Q{activeQuarter.quarter} {activeQuarter.year}
          </p>
        </div>
        {currentUserRockCount < 2 && (
          <RockForm quarterId={activeQuarter.id} />
        )}
      </div>

      {grouped.map(({ user, rocks: userRocks }) => (
        <div key={user.id}>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{user.name}</h2>

          {userRocks.length === 0 ? (
            <p className="text-sm text-gray-400">Sin rocks este trimestre</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {userRocks.map((rock) => {
                const statusConfig = STATUS_CONFIG[rock.status] || STATUS_CONFIG.pending;
                const isOwner = session?.user?.id === rock.ownerId;

                return (
                  <div key={rock.id} className="rounded-lg border border-gray-200 bg-white p-5">
                    <div className="flex items-start justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">{rock.title}</h3>
                      <span className={`ml-2 inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.className}`}>
                        {statusConfig.label}
                      </span>
                    </div>

                    <p className="mt-1 text-[10px] text-gray-400">
                      Actualizado: {new Date(rock.updatedAt).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}
                    </p>

                    <p className="mt-2 text-xs text-gray-500 line-clamp-2">{rock.description}</p>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Avance</span>
                        <span className="font-medium text-gray-900">{rock.progress}%</span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full bg-mawi-600 transition-all"
                          style={{ width: `${Math.min(rock.progress, 100)}%` }}
                        />
                      </div>
                    </div>

                    {rock.risk && (
                      <div className="mt-3 rounded-md bg-amber-50 p-2">
                        <p className="text-xs text-amber-800">
                          <span className="font-medium">Riesgo:</span> {rock.risk}
                        </p>
                      </div>
                    )}

                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-gray-500">
                        <span className="font-medium">Entregable:</span> {rock.deliverable}
                      </p>
                      <p className="text-xs text-gray-500">
                        <span className="font-medium">Criterio:</span> {rock.doneCriteria}
                      </p>
                    </div>

                    {isOwner && (
                      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                        <RockUpdateForm rockId={rock.id} currentProgress={rock.progress} currentStatus={rock.status} currentRisk={rock.risk || ""} />
                        <RockEditForm
                          rockId={rock.id}
                          currentTitle={rock.title}
                          currentDescription={rock.description}
                          currentDeliverable={rock.deliverable}
                          currentDoneCriteria={rock.doneCriteria}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
