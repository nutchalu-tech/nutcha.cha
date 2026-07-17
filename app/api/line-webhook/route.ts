import { validateSignature, WebhookEvent } from "@line/bot-sdk";
import { NextRequest, NextResponse } from "next/server";
import { askClaude } from "@/lib/claude";
import { DEFAULT_REPLY } from "@/lib/constants";
import { buildReplyMessage, getDisplayName, getLineClient } from "@/lib/line";

export const runtime = "nodejs";
export const maxDuration = 30;

async function handleTextEvent(event: WebhookEvent) {
  if (event.type !== "message" || event.message.type !== "text") {
    return;
  }
  const replyToken = event.replyToken;
  const userMessage = event.message.text;
  const userId = event.source.userId;

  let replyText = DEFAULT_REPLY;
  try {
    const client = getLineClient();
    const displayName = userId ? await getDisplayName(client, userId) : "สมาชิก";
    replyText = await askClaude(displayName, userMessage);
  } catch (err) {
    console.error("[line-webhook] failed to build reply:", err);
    replyText = DEFAULT_REPLY;
  }

  try {
    const client = getLineClient();
    await client.replyMessage({
      replyToken,
      messages: [buildReplyMessage(replyText)],
    });
  } catch (err) {
    console.error("[line-webhook] failed to send reply to LINE:", err);
  }
}

export async function POST(req: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    console.error("[line-webhook] LINE_CHANNEL_SECRET is not set");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";

  if (!validateSignature(body, channelSecret, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let events: WebhookEvent[] = [];
  try {
    events = JSON.parse(body).events ?? [];
  } catch (err) {
    console.error("[line-webhook] failed to parse body:", err);
    return NextResponse.json({ ok: true });
  }

  try {
    await Promise.all(events.map(handleTextEvent));
  } catch (err) {
    console.error("[line-webhook] unexpected error:", err);
  }

  // Always 200 so LINE doesn't retry delivery.
  return NextResponse.json({ ok: true });
}
