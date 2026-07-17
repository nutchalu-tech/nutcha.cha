import { messagingApi } from "@line/bot-sdk";
import { CONTACT_STAFF_LABEL, CONTACT_STAFF_MESSAGE } from "./constants";

const { MessagingApiClient } = messagingApi;

export function getLineClient() {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  }
  return new MessagingApiClient({ channelAccessToken });
}

export async function getDisplayName(
  client: messagingApi.MessagingApiClient,
  userId: string
): Promise<string> {
  try {
    const profile = await client.getProfile(userId);
    return profile.displayName || "สมาชิก";
  } catch (err) {
    console.error("[line] failed to fetch profile:", err);
    return "สมาชิก";
  }
}

export async function notifyAdmin(
  client: messagingApi.MessagingApiClient,
  displayName: string,
  question: string
): Promise<void> {
  const adminUserId = process.env.ADMIN_LINE_USER_ID;
  if (!adminUserId) {
    return;
  }
  try {
    await client.pushMessage({
      to: adminUserId,
      messages: [
        {
          type: "text",
          text: `บอทตอบไม่ได้ ⚠️\nลูกค้า: ${displayName}\nคำถาม: ${question}`,
        },
      ],
    });
  } catch (err) {
    console.error("[line] failed to notify admin:", err);
  }
}

export function buildReplyMessage(text: string): messagingApi.TextMessage {
  return {
    type: "text",
    text,
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "message",
            label: CONTACT_STAFF_LABEL,
            text: CONTACT_STAFF_MESSAGE,
          },
        },
      ],
    },
  };
}
