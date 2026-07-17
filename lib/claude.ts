import Anthropic from "@anthropic-ai/sdk";
import {
  BRAND_NAME,
  CLAUDE_MAX_TOKENS,
  CLAUDE_MODEL,
  CLAUDE_TIMEOUT_MS,
  DEFAULT_REPLY,
} from "./constants";
import { FAQ, FaqRow } from "./faq";

function faqToText(rows: FaqRow[]): string {
  return rows.map((r) => `${r.question} | ${r.answer}`).join("\n");
}

function buildSystemPrompt(displayName: string): string {
  return `<role>
คุณคือแอดมินของ ${BRAND_NAME} (Thailand Consumer Panel) พูดคุยกับสมาชิก panel ทาง LINE ชื่อของสมาชิกที่กำลังคุยด้วยคือ "${displayName}"
</role>

<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น ห้ามแต่งวันเวลา ลิงก์ เงื่อนไข หรือข้อมูลใดๆ ที่ไม่มีใน <faq>
- หากคำถามของสมาชิกไม่ตรงกับข้อมูลใน <faq> หรือไม่มั่นใจ ให้ตอบด้วยข้อความ default นี้เท่านั้น ห้ามเติมคำทักทายหรือข้อความอื่นนำหน้า/ต่อท้าย: "${DEFAULT_REPLY}"
- โทนภาษา: เป็นกันเอง สุภาพแบบคุยกับสมาชิก panel ทั่วไป ลงท้ายด้วย "ครับ" ใช้อีโมจิได้ตามความเหมาะสม
- ขึ้นต้นคำตอบด้วยการทักชื่อสมาชิก เช่น "สวัสดีครับ คุณ ${displayName}" เมื่อเหมาะสม (ยกเว้นตอนตอบข้อความ default ห้ามทักชื่อนำหน้า)
- ความยาวคำตอบกระชับ ตรงประเด็น ไม่ต้องยาวเกินความจำเป็น
- ห้ามสร้างบทสนทนาสมมติ ห้ามพูดแทนสมาชิก
</constraints>

<output_format>
ตอบเป็นภาษาไทยเท่านั้น ห้ามใช้ markdown, ห้ามใช้ bullet point แบบ *, -, #, ให้เขียนเป็นประโยคปกติ (ขึ้นบรรทัดใหม่ได้ถ้าจำเป็น)
</output_format>

<faq>
${faqToText(FAQ)}
</faq>`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Claude call timed out")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function askClaude(
  displayName: string,
  question: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({ apiKey });

  const response = await withTimeout(
    client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS,
      system: buildSystemPrompt(displayName),
      messages: [{ role: "user", content: question }],
    }),
    CLAUDE_TIMEOUT_MS
  );

  console.log("[claude]", {
    stopReason: response.stop_reason,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });

  if (response.stop_reason === "max_tokens") {
    return DEFAULT_REPLY;
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const text = textBlock && "text" in textBlock ? textBlock.text.trim() : "";

  if (!text) {
    return DEFAULT_REPLY;
  }

  return text;
}
