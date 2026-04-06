import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ceo") {
    return NextResponse.json({ error: "Solo el CEO puede cerrar trimestres" }, { status: 403 });
  }

  const { quarterId } = await request.json();

  const current = await prisma.quarter.findUnique({
    where: { id: quarterId },
    include: { rocks: true },
  });

  if (!current || !current.isActive) {
    return NextResponse.json({ error: "Trimestre no encontrado o no activo" }, { status: 400 });
  }

  // Determine next quarter
  const nextQ = current.quarter === 4 ? 1 : current.quarter + 1;
  const nextYear = current.quarter === 4 ? current.year + 1 : current.year;
  const nextStart = new Date(nextYear, (nextQ - 1) * 3, 1);
  const nextEnd = new Date(nextYear, nextQ * 3, 0);

  await prisma.$transaction(async (tx) => {
    // Mark current rocks without finalStatus as not_done
    for (const rock of current.rocks) {
      if (!rock.finalStatus) {
        await tx.rock.update({
          where: { id: rock.id },
          data: { finalStatus: rock.status === "done" ? "done" : "not_done" },
        });
      }
    }

    // Deactivate current quarter
    await tx.quarter.update({
      where: { id: quarterId },
      data: { isActive: false },
    });

    // Create or activate next quarter
    await tx.quarter.upsert({
      where: { year_quarter: { year: nextYear, quarter: nextQ } },
      update: { isActive: true },
      create: {
        year: nextYear,
        quarter: nextQ,
        startDate: nextStart,
        endDate: nextEnd,
        isActive: true,
      },
    });
  });

  return NextResponse.json({ success: true, nextQuarter: `Q${nextQ} ${nextYear}` });
}
