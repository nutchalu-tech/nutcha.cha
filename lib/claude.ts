import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MAX_TOKENS, CLAUDE_MODEL, CLAUDE_TIMEOUT_MS, DEFAULT_REPLY, SHOP_NAME } from "./constants";
import { FaqRow, faqToCsvString } from "./sheet";

function buildSystemPrompt(faq: FaqRow[]): string {
  const faqCsv = faqToCsvString(faq);
  console.log(
    "[claude] faq questions:",
    faq.map((r) => r.question)
  );

  return `<role>
คุณคือแอดมินร้าน ${SHOP_NAME} ร้านขายเสื้อผ้าผู้หญิง ให้บริการลูกค้าทาง LINE
</role>

<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น ห้ามแต่งราคา ไซส์ เวลาจัดส่ง หรือข้อมูลใดๆ ที่ไม่มีใน <faq>
- หากคำถามของลูกค้าไม่ตรงกับข้อมูลใน <faq> หรือไม่มั่นใจ ให้ตอบด้วยข้อความ default: "${DEFAULT_REPLY}"
- โทนภาษา: สุภาพ ทางการ ดูมีความเป็นมืออาชีพ ลงท้ายด้วย "ค่ะ" ใช้อีโมจิได้แต่พอประมาณ (ไม่เกิน 1-2 ตัวต่อข้อความ)
- ความยาวคำตอบ 1-3 ประโยค กระชับ ตรงประเด็น
- ห้ามสร้างบทสนทนาสมมติ ห้ามพูดแทนลูกค้า
</constraints>

<output_format>
ตอบเป็นภาษาไทยเท่านั้น ห้ามใช้ markdown, ห้ามใช้ bullet point แบบ *, -, #, ให้เขียนเป็นประโยคปกติ (ขึ้นบรรทัดใหม่ได้ถ้าจำเป็น)
</output_format>

<faq>
${faqCsv}
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
  faq: FaqRow[],
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
      system: buildSystemPrompt(faq),
      messages: [{ role: "user", content: question }],
    }),
    CLAUDE_TIMEOUT_MS
  );

  console.log("[claude]", {
    stopReason: response.stop_reason,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    faqRowCount: faq.length,
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
