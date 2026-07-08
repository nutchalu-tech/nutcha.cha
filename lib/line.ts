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
