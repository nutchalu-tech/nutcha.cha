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

async function pushToAdmin(
  client: messagingApi.MessagingApiClient,
  text: string
): Promise<void> {
  const adminUserId = process.env.ADMIN_LINE_USER_ID?.trim();
  if (!adminUserId) {
    return;
  }
  if (!/^U[0-9a-f]{32}$/i.test(adminUserId)) {
    console.error(
      "[line] ADMIN_LINE_USER_ID does not look like a valid LINE userId:",
      adminUserId
    );
    return;
  }
  try {
    await client.pushMessage({
      to: adminUserId,
      messages: [{ type: "text", text }],
    });
  } catch (err) {
    console.error("[line] failed to notify admin:", err);
  }
}

export async function notifyAdminBotCouldNotAnswer(
  client: messagingApi.MessagingApiClient,
  displayName: string,
  question: string
): Promise<void> {
  await pushToAdmin(
    client,
    `บอทตอบไม่ได้ ⚠️\nลูกค้า: ${displayName}\nคำถาม: ${question}`
  );
}

export async function notifyAdminCustomerRequestedStaff(
  client: messagingApi.MessagingApiClient,
  displayName: string
): Promise<void> {
  await pushToAdmin(
    client,
    `ลูกค้าขอคุยกับแอดมินโดยเฉพาะ 🙋\nลูกค้า: ${displayName}`
  );
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
