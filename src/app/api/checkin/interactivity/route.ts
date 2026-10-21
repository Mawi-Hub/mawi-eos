import { after, NextResponse } from "next/server";
import { verifySlackSignature } from "@/lib/integrations/checkin";
import { safeErrorLabel } from "@/lib/integrations/checkinStore";
import { openTeamCheckinModal, submitTeamCheckin } from "@/lib/checkin/teamCheckin";
import { MODAL_CALLBACK_ID, OPEN_ACTION_ID } from "@/lib/checkin/teamForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Slack Interactivity (Slack App → Interactivity & Shortcuts → Request URL).
// Dos interacciones del check-in semanal:
//   block_actions   botón "Responder check-in" → abre el formulario (el
//                   trigger_id vence a los 3 s, así que se abre antes de responder)
//   view_submission envío del formulario → valida, guarda en EOS y cierra; la
//                   copia a Notion y la marca en el DM corren después.
type Payload = {
  type?: string;
  trigger_id?: string;
  user?: { id?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: { values?: Record<string, Record<string, { value?: string | null; selected_option?: { value?: string } | null }>> };
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySlackSignature(rawBody, request.headers.get("x-slack-request-timestamp"), request.headers.get("x-slack-signature"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Payload;
  try {
    payload = JSON.parse(new URLSearchParams(rawBody).get("payload") ?? "") as Payload;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const slackUserId = payload.user?.id;
  if (!slackUserId) return new NextResponse(null, { status: 200 });

  if (payload.type === "block_actions") {
    const action = payload.actions?.find((a) => a.action_id === OPEN_ACTION_ID);
    if (action && payload.trigger_id) {
      try {
        await openTeamCheckinModal({ triggerId: payload.trigger_id, slackUserId, buttonValue: action.value });
      } catch (error) {
        console.error(`[team-checkin] No se pudo abrir el formulario (${safeErrorLabel(error)})`);
      }
    }
    return new NextResponse(null, { status: 200 });
  }

  if (payload.type === "view_submission" && payload.view?.callback_id === MODAL_CALLBACK_ID) {
    try {
      const outcome = await submitTeamCheckin({
        slackUserId,
        privateMetadata: payload.view.private_metadata,
        values: payload.view.state?.values ?? {},
      });
      if (outcome.kind === "errors") return NextResponse.json({ response_action: "errors", errors: outcome.errors });
      if (outcome.kind === "rejected") {
        return NextResponse.json({
          response_action: "errors",
          errors: { result: "No pudimos validar tu formulario. Cerralo y abrilo de nuevo desde el mensaje del check-in." },
        });
      }
      after(() => outcome.followUp().catch((error) => console.error(`[team-checkin] Seguimiento falló (${safeErrorLabel(error)})`)));
      return new NextResponse(null, { status: 200 });
    } catch (error) {
      console.error(`[team-checkin] No se pudo guardar el check-in (${safeErrorLabel(error)})`);
      return NextResponse.json({
        response_action: "errors",
        errors: { result: "No se pudo guardar. Probá de nuevo en un minuto; lo que escribiste sigue acá." },
      });
    }
  }

  return new NextResponse(null, { status: 200 });
}
