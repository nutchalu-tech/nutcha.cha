import { GoogleGenAI } from "@google/genai";
import { DEFAULT_REPLY, GEMINI_TIMEOUT_MS, SHOP_NAME } from "./constants";
import { FaqRow, faqToCsvString } from "./sheet";

const MODEL = "gemini-3.5-flash";

function buildPrompt(faq: FaqRow[], question: string): string {
  const faqCsv = faqToCsvString(faq);
  console.log(
    "[gemini] faq questions:",
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
</faq>

<question>
${question}
</question>`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Gemini call timed out")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function askGemini(
  faq: FaqRow[],
  question: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(faq, question);

  const response = await withTimeout(
    ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 1.0,
        maxOutputTokens: 2048,
        thinkingConfig: {
          thinkingBudget: 512,
        },
      },
    }),
    GEMINI_TIMEOUT_MS
  );

  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const usage = response.usageMetadata;

  console.log("[gemini]", {
    finishReason,
    thoughtsTokenCount: usage?.thoughtsTokenCount,
    candidatesTokenCount: usage?.candidatesTokenCount,
    promptTokenCount: usage?.promptTokenCount,
    faqRowCount: faq.length,
    rawText: response.text?.slice(0, 200),
  });

  if (finishReason === "MAX_TOKENS") {
    return DEFAULT_REPLY;
  }

  const text = response.text?.trim();
  if (!text) {
    return DEFAULT_REPLY;
  }

  return text;
}
