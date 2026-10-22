// Usage over time: one data point per check-in in Cloudflare Workers Analytics Engine, so the admin
// page can show daily, weekly and monthly active computers and people, and how much churches use the
// app (services run, scripture and songs shown). KV keeps only each computer's last visit; this keeps
// every day. Counts only, never content.
//
// A point's layout (Analytics Engine has numbered columns):
//   index1  computer id
//   blob1   computer id      blob2  account id ("" when not signed in)   blob3  plan
//   blob4   os               blob5  app version                          blob6  "church" or "team"
//   blob7   "app" or "web"
//   double1 services started since the last check-in   double2 scripture shown   double3 songs shown

export const USAGE_DATASET = "church_studio_usage";

/** What the app counted since its last check-in. */
export type UsageCounts = { services: number; scripture: number; songs: number };

export type CheckIn = { device: string; account: string; plan: string; os: string; version: string; team: boolean; web: boolean; counts: UsageCounts };

type Row = Record<string, unknown>;

export type Usage = {
  write(point: { indexes: string[]; blobs: string[]; doubles: number[] }): void;
  /** Analytics Engine's SQL API; missing until the server has a token to read it (ANALYTICS_TOKEN). */
  query?(sql: string): Promise<Row[]>;
};

/** The binding (wrangler.jsonc analytics_engine_datasets) and, with an API token, its SQL API. */
export function analyticsEngine(
  binding: { writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void },
  read: { accountId: string; token: string } | null,
  http: typeof fetch = fetch,
): Usage {
  return {
    write: (point) => binding.writeDataPoint(point),
    query: read
      ? async (sql) => {
          const response = await http(`https://api.cloudflare.com/client/v4/accounts/${read.accountId}/analytics_engine/sql`, {
            method: "POST",
            headers: { authorization: `Bearer ${read.token}` },
            body: `${sql} FORMAT JSON`,
          });
          if (!response.ok) throw new Error(`Usage query failed: ${response.status} ${(await response.text()).slice(0, 200)}`);
          return ((await response.json()) as { data?: Row[] }).data ?? [];
        }
      : undefined,
  };
}

/** A small whole number from the app (anything else counts as nothing). */
export function readCounts(value: unknown): UsageCounts {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const count = (name: string) => {
    const n = Number(input[name]);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 1000) : 0;
  };
  return { services: count("services"), scripture: count("scripture"), songs: count("songs") };
}

export function recordCheckIn(usage: Usage, visit: CheckIn): void {
  try {
    usage.write({
      indexes: [visit.device],
      blobs: [visit.device, visit.account, visit.plan, visit.os, visit.version, visit.team ? "team" : "church", visit.web ? "web" : "app"],
      doubles: [visit.counts.services, visit.counts.scripture, visit.counts.songs],
    });
  } catch {
    // Usage numbers are never worth failing a check-in for.
  }
}

export type UsageReport = {
  /** The last 60 days, oldest first: installed computers and signed-in people seen, and what they did. */
  daily: Array<{ day: string; computers: number; people: number; services: number; scripture: number; songs: number }>;
  /** The last 12 weeks: churches are busiest once a week, so weekly actives say the most. */
  weekly: Array<{ week: string; computers: number; people: number }>;
  /** Right now: seen in the last 1, 7 and 30 days. */
  active: { computers: { day: number; week: number; month: number }; people: { day: number; week: number; month: number } };
};

// Real churches' installed apps only: the team's computers and the browser demo are left out.
const CHURCH = `blob6 = 'church' AND blob7 = 'app'`;

const number = (value: unknown) => Number(value) || 0;
const dayOf = (value: unknown) => String(value ?? "").slice(0, 10);

/** The numbers for the admin page, or null when the server cannot read them yet. */
export async function usageReport(usage: Usage | undefined): Promise<UsageReport | null> {
  const query = usage?.query;
  if (!query) return null;
  const since = (days: number) => `timestamp > NOW() - INTERVAL '${days}' DAY`;
  const distinct = async (days: number, people: boolean) =>
    number((await query(`SELECT count(DISTINCT ${people ? "blob2" : "blob1"}) AS n FROM ${USAGE_DATASET} WHERE ${CHURCH} AND ${since(days)}${people ? " AND blob2 != ''" : ""}`))[0]?.n);
  const [daily, dailyPeople, weekly, weeklyPeople, ...windows] = await Promise.all([
    query(
      `SELECT toStartOfDay(timestamp) AS day, count(DISTINCT blob1) AS computers, sum(_sample_interval * double1) AS services, sum(_sample_interval * double2) AS scripture, sum(_sample_interval * double3) AS songs FROM ${USAGE_DATASET} WHERE ${CHURCH} AND ${since(60)} GROUP BY day ORDER BY day`,
    ),
    query(`SELECT toStartOfDay(timestamp) AS day, count(DISTINCT blob2) AS people FROM ${USAGE_DATASET} WHERE ${CHURCH} AND blob2 != '' AND ${since(60)} GROUP BY day ORDER BY day`),
    query(`SELECT toStartOfInterval(timestamp, INTERVAL '7' DAY) AS week, count(DISTINCT blob1) AS computers FROM ${USAGE_DATASET} WHERE ${CHURCH} AND ${since(84)} GROUP BY week ORDER BY week`),
    query(`SELECT toStartOfInterval(timestamp, INTERVAL '7' DAY) AS week, count(DISTINCT blob2) AS people FROM ${USAGE_DATASET} WHERE ${CHURCH} AND blob2 != '' AND ${since(84)} GROUP BY week ORDER BY week`),
    distinct(1, false),
    distinct(7, false),
    distinct(30, false),
    distinct(1, true),
    distinct(7, true),
    distinct(30, true),
  ]);
  const peopleOn = new Map(dailyPeople.map((row) => [dayOf(row.day), number(row.people)]));
  const peopleIn = new Map(weeklyPeople.map((row) => [dayOf(row.week), number(row.people)]));
  return {
    daily: daily.map((row) => ({
      day: dayOf(row.day),
      computers: number(row.computers),
      people: peopleOn.get(dayOf(row.day)) ?? 0,
      services: Math.round(number(row.services)),
      scripture: Math.round(number(row.scripture)),
      songs: Math.round(number(row.songs)),
    })),
    weekly: weekly.map((row) => ({ week: dayOf(row.week), computers: number(row.computers), people: peopleIn.get(dayOf(row.week)) ?? 0 })),
    active: {
      computers: { day: windows[0]!, week: windows[1]!, month: windows[2]! },
      people: { day: windows[3]!, week: windows[4]!, month: windows[5]! },
    },
  };
}
