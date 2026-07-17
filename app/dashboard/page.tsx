import { getLogRows, LogRow } from "@/lib/log";

export const dynamic = "force-dynamic";

function isAnswered(row: LogRow): boolean {
  return row.answered === true || String(row.answered).toLowerCase() === "true";
}

function toDateKey(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function normalizeQuestion(q: string): string {
  return q.trim().toLowerCase();
}

function BarRow({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
          marginBottom: 4,
        }}
      >
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div style={{ background: "#eee", borderRadius: 4, height: 10 }}>
        <div
          style={{
            width: `${pct}%`,
            background: color,
            height: "100%",
            borderRadius: 4,
          }}
        />
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const expectedKey = process.env.DASHBOARD_PASSWORD;
  if (!expectedKey || searchParams.key !== expectedKey) {
    return (
      <main style={{ fontFamily: "sans-serif", padding: 40 }}>
        <h1>Dashboard</h1>
        <p>ต้องใส่ ?key=รหัสผ่าน ต่อท้าย URL เพื่อเข้าดูข้อมูล</p>
      </main>
    );
  }

  let rows: LogRow[] = [];
  let loadError: string | null = null;
  try {
    rows = await getLogRows();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "unknown error";
  }

  const totalMessages = rows.length;
  const answeredCount = rows.filter(isAnswered).length;
  const unansweredCount = totalMessages - answeredCount;
  const answeredRate =
    totalMessages > 0 ? Math.round((answeredCount / totalMessages) * 100) : 0;

  const byDay = new Map<string, number>();
  for (const row of rows) {
    const key = toDateKey(row.timestamp);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const last14Days = [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 14)
    .reverse();
  const maxPerDay = Math.max(1, ...last14Days.map(([, count]) => count));

  const unansweredCounts = new Map<string, { question: string; count: number }>();
  for (const row of rows) {
    if (isAnswered(row)) continue;
    const key = normalizeQuestion(row.question);
    if (!key) continue;
    const existing = unansweredCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      unansweredCounts.set(key, { question: row.question.trim(), count: 1 });
    }
  }
  const topUnanswered = [...unansweredCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const maxUnanswered = Math.max(1, ...topUnanswered.map((q) => q.count));

  return (
    <main
      style={{
        fontFamily: "sans-serif",
        padding: 24,
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <h1>Crowdster Bot Dashboard</h1>

      {loadError && (
        <p style={{ color: "crimson" }}>โหลดข้อมูลไม่สำเร็จ: {loadError}</p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          margin: "20px 0",
        }}
      >
        <StatCard label="ข้อความทั้งหมด" value={totalMessages} />
        <StatCard label="ตอบสำเร็จ" value={answeredCount} />
        <StatCard label="ตอบไม่ได้" value={unansweredCount} />
        <StatCard label="อัตราตอบสำเร็จ" value={`${answeredRate}%`} />
      </div>

      <section style={{ marginTop: 32 }}>
        <h2>จำนวนข้อความต่อวัน (14 วันล่าสุด)</h2>
        {last14Days.length === 0 && <p>ยังไม่มีข้อมูล</p>}
        {last14Days.map(([day, count]) => (
          <BarRow key={day} label={day} value={count} max={maxPerDay} color="#4f46e5" />
        ))}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>คำถามที่บอทตอบไม่ได้บ่อยที่สุด</h2>
        {topUnanswered.length === 0 && <p>ยังไม่มีคำถามที่ตอบไม่ได้ 🎉</p>}
        {topUnanswered.map((q) => (
          <BarRow
            key={q.question}
            label={q.question}
            value={q.count}
            max={maxUnanswered}
            color="#dc2626"
          />
        ))}
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: 16,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
    </div>
  );
}
