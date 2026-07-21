export const BRAND_NAME = "Crowdster";

export const DEFAULT_REPLY =
  "ขออภัยครับ เรื่องนี้แอดมินขอตรวจสอบและติดต่อกลับนะครับ 🙏";

export const CONTACT_STAFF_LABEL = "ติดต่อเจ้าหน้าที่";
export const CONTACT_STAFF_MESSAGE = "ขอสอบถามเจ้าหน้าที่ครับ";

export function buildContactStaffAckReply(position: number, estimatedWaitMinutes: number): string {
  if (position <= 1) {
    return "รับทราบครับ ตอนนี้คุณเป็นคิวถัดไป แอดมินจะรีบติดต่อกลับโดยเร็วที่สุดนะครับ 🙏";
  }
  return `รับทราบครับ ตอนนี้มีคิวรออยู่ก่อนหน้าคุณ ${position - 1} คิว คาดว่าแอดมินจะติดต่อกลับภายในประมาณ ${estimatedWaitMinutes} นาทีนะครับ 🙏`;
}

export const CLAUDE_TIMEOUT_MS = 20000;
export const CLAUDE_MODEL = "claude-haiku-4-5";
export const CLAUDE_MAX_TOKENS = 1024;
