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

export type LogRow = {
  timestamp: string;
  displayName: string;
  userId: string;
  question: string;
  answer: string;
  answered: boolean | string;
};

export async function getLogRows(): Promise<LogRow[]> {
  const url = process.env.LOG_SHEET_WEBHOOK_URL?.trim();
  if (!url) {
    throw new Error("LOG_SHEET_WEBHOOK_URL is not set");
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Sheet log fetch failed with status ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Sheet log response was not an array");
  }

  return data as LogRow[];
}
