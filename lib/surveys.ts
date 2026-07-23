import { getRedis } from "./redis";

export type SurveyRow = {
  date: string;
  project: string;
  surveyName: string;
  owner: string;
  point: string;
  status: string;
  dataLink: string;
};

const CACHE_KEY = "surveys:recent";
const CACHE_TTL_SECONDS = 5 * 60;
const RECENT_LIMIT = 15;

async function fetchFromSheet(): Promise<SurveyRow[]> {
  const url = process.env.SURVEY_SHEET_WEBHOOK_URL?.trim();
  if (!url) {
    return [];
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Survey sheet fetch failed with status ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Survey sheet response was not an array");
  }

  return (data as Record<string, unknown>[])
    .filter((r) => r["Survey_name"])
    .map((r) => ({
      date: String(r["Date"] ?? ""),
      project: String(r["Project"] ?? ""),
      surveyName: String(r["Survey_name"] ?? ""),
      owner: String(r["Owner"] ?? ""),
      point: String(r["Point"] ?? ""),
      status: String(r["status"] ?? ""),
      dataLink: String(r["Data Link"] ?? ""),
    }));
}

// Cached in Redis for a few minutes so we don't hit the Apps Script Web App
// on every single incoming message.
export async function getRecentSurveys(): Promise<SurveyRow[]> {
  try {
    const redis = getRedis();
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as SurveyRow[];
    }
  } catch (err) {
    console.error("[surveys] redis cache read failed:", err);
  }

  let rows: SurveyRow[] = [];
  try {
    rows = await fetchFromSheet();
  } catch (err) {
    console.error("[surveys] failed to fetch survey sheet:", err);
    return [];
  }

  const recent = rows.slice(-RECENT_LIMIT).reverse();

  try {
    const redis = getRedis();
    await redis.set(CACHE_KEY, JSON.stringify(recent), "EX", CACHE_TTL_SECONDS);
  } catch (err) {
    console.error("[surveys] redis cache write failed:", err);
  }

  return recent;
}

export function surveysToText(rows: SurveyRow[]): string {
  if (rows.length === 0) {
    return "ยังไม่มีข้อมูลแบบสอบถามล่าสุด";
  }
  return rows
    .map(
      (r) =>
        `${r.date} | ${r.surveyName} | สถานะ: ${r.status || "ไม่ระบุ"} | คะแนน: ${r.point}`
    )
    .join("\n");
}
