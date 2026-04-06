import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ rockId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rockId } = await params;
  const rock = await prisma.rock.findUnique({ where: { id: rockId } });

  if (!rock || rock.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  const updated = await prisma.rock.update({
    where: { id: rockId },
    data: {
      progress: body.progress ?? rock.progress,
      status: body.status ?? rock.status,
      risk: body.risk !== undefined ? body.risk : rock.risk,
      finalStatus: body.finalStatus ?? rock.finalStatus,
    },
  });

  return NextResponse.json(updated);
}
