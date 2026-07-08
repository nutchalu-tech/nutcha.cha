import { SHEET_CACHE_TTL_MS } from "./constants";

export type FaqRow = {
  category: string;
  question: string;
  answer: string;
};

let cache: { rows: FaqRow[]; fetchedAt: number } | null = null;

// Minimal RFC4180 CSV parser: handles quoted fields with embedded commas,
// newlines, and escaped "" quotes (needed because the sheet's answer
// column contains multi-line replies).
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];

    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // skip, \n handles the row break
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function rowsToFaq(rows: string[][]): FaqRow[] {
  const [, ...dataRows] = rows; // drop header
  return dataRows
    .filter((r) => r.some((cell) => cell.trim().length > 0))
    .map((r) => ({
      category: (r[0] ?? "").trim(),
      question: (r[2] ?? "").trim(),
      answer: (r[3] ?? "").trim(),
    }));
}

export async function getFaq(): Promise<FaqRow[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < SHEET_CACHE_TTL_MS) {
    return cache.rows;
  }

  const sheetUrl = process.env.SHEET_CSV_URL;
  if (!sheetUrl) {
    throw new Error("SHEET_CSV_URL is not set");
  }

  try {
    const res = await fetch(sheetUrl, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Sheet fetch failed with status ${res.status}`);
    }
    if (res.url.includes("accounts.google.com")) {
      throw new Error("Sheet fetch was redirected to a Google sign-in page (not publicly accessible)");
    }
    const csv = await res.text();
    if (csv.includes("<html") || csv.includes("docs-additional-bars")) {
      throw new Error("Sheet fetch returned an HTML page instead of CSV data");
    }
    const rows = rowsToFaq(parseCsv(csv));
    if (rows.length === 0) {
      throw new Error("Sheet CSV parsed to zero FAQ rows");
    }
    console.log("[sheet] fetched FAQ rows:", rows.length, "raw CSV length:", csv.length);
    cache = { rows, fetchedAt: now };
    return rows;
  } catch (err) {
    // Fetch failed: fall back to stale cache if we have one, even if expired.
    if (cache) {
      console.error("Sheet fetch failed, serving stale cache:", err);
      return cache.rows;
    }
    throw err;
  }
}

export function faqToCsvString(rows: FaqRow[]): string {
  return rows
    .map((r) => `${r.category} | ${r.question} | ${r.answer}`)
    .join("\n");
}
