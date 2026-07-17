const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 21;

export const OUTSIDE_BUSINESS_HOURS_REPLY =
  "ขณะนี้อยู่นอกเวลาทำการของแอดมิน (09:00 - 21:00 น.) นะครับ 🙏 ทีมงานจะรีบติดต่อกลับในเวลาทำการถัดไปครับ";

export function isWithinBusinessHours(date: Date = new Date()): boolean {
  const bangkokHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      hour: "numeric",
      hour12: false,
    }).format(date)
  );
  return bangkokHour >= BUSINESS_START_HOUR && bangkokHour < BUSINESS_END_HOUR;
}
