// Fires a conversation log entry to a Google Apps Script Web App endpoint
// (LOG_SHEET_WEBHOOK_URL). Best-effort and non-blocking -- never throws,
// never delays or fails the customer-facing reply.
export async function logConversation(entry: {
  displayName: string;
  userId: string;
  question: string;
  answer: string;
  answered: boolean;
}): Promise<void> {
  const url = process.env.LOG_SHEET_WEBHOOK_URL?.trim();
  if (!url) {
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        ...entry,
      }),
    });
  } catch (err) {
    console.error("[log] failed to log conversation:", err);
  }
}
