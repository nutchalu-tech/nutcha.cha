import { validateSignature, WebhookEvent } from "@line/bot-sdk";
import { NextRequest, NextResponse } from "next/server";
import { isWithinBusinessHours, OUTSIDE_BUSINESS_HOURS_REPLY } from "@/lib/businessHours";
import { askClaude } from "@/lib/claude";
import { buildContactStaffAckReply, CONTACT_STAFF_MESSAGE, DEFAULT_REPLY } from "@/lib/constants";
import {
  buildReplyMessage,
  getDisplayName,
  getLineClient,
  notifyAdminBotCouldNotAnswer,
  notifyAdminCustomerRequestedStaff,
} from "@/lib/line";
import { logConversation } from "@/lib/log";
import { appendHistory, getHistory } from "@/lib/memory";
import { joinQueue } from "@/lib/queue";
import { checkRateLimit, RATE_LIMIT_REPLY } from "@/lib/rateLimit";
import { getRecentSurveys } from "@/lib/surveys";

export const runtime = "nodejs";
export const maxDuration = 30;

async function handleTextEvent(event: WebhookEvent) {
  if (event.type !== "message" || event.message.type !== "text") {
    return;
  }
  const replyToken = event.replyToken;
  const userMessage = event.message.text;
  const userId = event.source.userId;

  console.log("[line-webhook] incoming from userId:", userId);

  const client = getLineClient();

  if (userId) {
    const rateLimitResult = await checkRateLimit(userId);
    if (rateLimitResult === "silent") {
      // Already warned recently and still spamming — drop without a reply
      // to avoid burning more Claude/LINE calls on a runaway loop.
      return;
    }
    if (rateLimitResult === "warn") {
      try {
        await client.replyMessage({
          replyToken,
          messages: [buildReplyMessage(RATE_LIMIT_REPLY)],
        });
      } catch (err) {
        console.error("[line-webhook] failed to send reply to LINE:", err);
      }
      return;
    }
  }

  const displayName = userId ? await getDisplayName(client, userId) : "สมาชิก";

  // Customer pressed the "contact staff" quick reply — skip Claude entirely
  // so this always reaches the admin, instead of depending on the model
  // recognizing the message as unanswerable.
  if (userMessage.trim() === CONTACT_STAFF_MESSAGE) {
    let ackText = OUTSIDE_BUSINESS_HOURS_REPLY;
    if (isWithinBusinessHours()) {
      try {
        const { position, estimatedWaitMinutes } = await joinQueue(userId ?? displayName);
        ackText = buildContactStaffAckReply(position, estimatedWaitMinutes);
      } catch (err) {
        console.error("[line-webhook] failed to join queue:", err);
        ackText = buildContactStaffAckReply(1, 1);
      }
    }
    try {
      await client.replyMessage({
        replyToken,
        messages: [buildReplyMessage(ackText)],
      });
    } catch (err) {
      console.error("[line-webhook] failed to send reply to LINE:", err);
    }
    await notifyAdminCustomerRequestedStaff(client, displayName);
    await logConversation({
      displayName,
      userId: userId ?? "",
      question: userMessage,
      answer: ackText,
      answered: false,
    });
    return;
  }

  let replyText = DEFAULT_REPLY;
  try {
    const history = userId ? await getHistory(userId) : [];
    const recentSurveys = await getRecentSurveys();
    replyText = await askClaude(displayName, userMessage, history, recentSurveys);
  } catch (err) {
    console.error("[line-webhook] failed to build reply:", err);
    replyText = DEFAULT_REPLY;
  }

  // Claude sometimes tacks on extra text around the default reply despite
  // being told not to (a greeting prefix, a "let me know if..." suffix).
  // Force it back to the exact configured message whenever that happens,
  // so customers always see a clean default and the notification/log below
  // work off consistent text.
  if (replyText !== DEFAULT_REPLY && replyText.includes(DEFAULT_REPLY)) {
    replyText = DEFAULT_REPLY;
  }

  try {
    await client.replyMessage({
      replyToken,
      messages: [buildReplyMessage(replyText)],
    });
  } catch (err) {
    console.error("[line-webhook] failed to send reply to LINE:", err);
  }

  const answered = !replyText.includes(DEFAULT_REPLY);
  if (!answered) {
    await notifyAdminBotCouldNotAnswer(client, displayName, userMessage);
  }

  if (userId) {
    await appendHistory(userId, { role: "user", content: userMessage });
    await appendHistory(userId, { role: "assistant", content: replyText });
  }

  await logConversation({
    displayName,
    userId: userId ?? "",
    question: userMessage,
    answer: replyText,
    answered,
  });
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
