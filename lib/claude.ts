import Anthropic from "@anthropic-ai/sdk";
import {
  BRAND_NAME,
  CLAUDE_MAX_TOKENS,
  CLAUDE_MODEL,
  CLAUDE_TIMEOUT_MS,
  DEFAULT_REPLY,
} from "./constants";
import { FAQ, FaqRow } from "./faq";
import { ChatTurn } from "./memory";

function faqToText(rows: FaqRow[]): string {
  return rows.map((r) => `${r.question} | ${r.answer}`).join("\n");
}

// Static across every call (same brand, same FAQ) -- this is the block we
// want Claude to cache instead of re-processing at full price on every
// message. Must not contain anything that varies per customer (name, time,
// etc.) or the cache would miss every time anyway.
function buildStaticSystemPrompt(): string {
  return `<role>
คุณคือแอดมินของ ${BRAND_NAME} (Thailand Consumer Panel) พูดคุยกับสมาชิก panel ทาง LINE
</role>

<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น ห้ามแต่งวันเวลา ลิงก์ เงื่อนไข หรือข้อมูลใดๆ ที่ไม่มีใน <faq>
- ถ้าคำถามของสมาชิกเกี่ยวข้องกับหัวข้อใน <faq> แม้จะไม่ได้ใช้คำเดียวกันเป๊ะๆ หรือพิมพ์ผิด/พิมพ์ห้วนๆ ให้พยายามจับใจความและตอบโดยอ้างอิงข้อมูลใน <faq> ที่เกี่ยวข้องที่สุด (รวมข้อมูลจากหลายข้อได้ถ้าจำเป็น) แทนที่จะตอบ default ทันที
- ให้ตอบ default เฉพาะเมื่อคำถามไม่เกี่ยวข้องกับหัวข้อใดๆ ใน <faq> เลย หรือถามหาข้อมูลเฉพาะที่ไม่มีอยู่จริงใน <faq> (เช่น สถานะบัญชีของสมาชิกคนนั้นๆ, จำนวนแต้มจริง) เท่านั้น: "${DEFAULT_REPLY}" (ห้ามเติมคำทักทายหรือข้อความอื่นนำหน้า/ต่อท้ายข้อความ default นี้)
- โทนภาษา: เป็นกันเอง สุภาพแบบคุยกับสมาชิก panel ทั่วไป ลงท้ายด้วย "ครับ" ใช้อีโมจิได้ตามความเหมาะสม
- ขึ้นต้นคำตอบด้วยการทักชื่อสมาชิกตามชื่อที่ระบุไว้ในข้อความถัดไป เมื่อเหมาะสม (ยกเว้นตอนตอบข้อความ default ห้ามทักชื่อนำหน้า)
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
  question: string,
  history: ChatTurn[] = []
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
      system: [
        {
          type: "text",
          text: buildStaticSystemPrompt(),
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: `ชื่อของสมาชิกที่กำลังคุยด้วยตอนนี้คือ "${displayName}"`,
        },
      ],
      messages: [
        ...history.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: "user" as const, content: question },
      ],
    }),
    CLAUDE_TIMEOUT_MS
  );

  console.log("[claude]", {
    stopReason: response.stop_reason,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens,
    cacheWriteTokens: response.usage.cache_creation_input_tokens,
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
