import { describe, expect, it } from "vitest";
import { handleRooms, LIMITS, memoryRooms, RoomCore, type RoomState } from "./rooms";

function room() {
  let saved: RoomState | null = null;
  let clock = Date.UTC(2026, 9, 25, 10);
  const core = new RoomCore({ get: async () => (saved ? structuredClone(saved) : null), put: async (state) => void (saved = structuredClone(state)), drop: async () => void (saved = null) }, () => clock);
  return { core, advance: (ms: number) => (clock += ms), peek: () => saved };
}

type View = { questions: Array<{ id: string; text: string; votes: number; mine: boolean }>; waiting: number; activity: Record<string, unknown>; leaderboard?: Array<{ name: string; score: number }> };
const data = <T>(result: { ok: boolean; data?: unknown }) => {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.data as T;
};

describe("rooms: Q&A", () => {
  it("moderates: a question waits for the operator, then the audience sees it", async () => {
    const { core } = room();
    const { hostKey } = data<{ hostKey: string }>(await core.create("ABC234", "Grace Chapel"));
    const { pid } = data<{ pid: string }>(await core.join("Ama", "ip1"));
    const asked = data<{ id: string; state: string }>(await core.ask(pid, "  What does grace mean?  ", ""));
    expect(asked.state).toBe("pending");
    expect(data<View>(await core.view(pid))).toMatchObject({ questions: [], waiting: 1 });
    // Phones cannot moderate; the desk can.
    expect((await core.moderate("wrong", asked.id, "approve")).ok).toBe(false);
    data(await core.moderate(hostKey, asked.id, "approve"));
    expect(data<View>(await core.view(null)).questions).toMatchObject([{ text: "What does grace mean?", votes: 0 }]);
    data(await core.moderate(hostKey, asked.id, "hide"));
    expect(data<View>(await core.view(null)).questions).toEqual([]);
  });

  it("asks without waiting when moderation is off, and limits how many one person asks", async () => {
    const { core, advance } = room();
    const { hostKey } = data<{ hostKey: string }>(await core.create("ABC234", ""));
    data(await core.settings(hostKey, { moderate: false }));
    const { pid } = data<{ pid: string }>(await core.join("", "ip"));
    for (let i = 0; i < LIMITS.asksPer10Min; i++) expect(data<{ state: string }>(await core.ask(pid, `Question number ${i}`, "")).state).toBe("approved");
    expect(await core.ask(pid, "One too many", "")).toMatchObject({ ok: false, status: 429 });
    advance(11 * 60_000);
    expect((await core.ask(pid, "Later on", "")).ok).toBe(true);
    expect(await core.ask("nobody", "Who am I", "")).toMatchObject({ ok: false, status: 401 });
    expect(await core.ask(pid, "<b>" + "x".repeat(400), "")).toMatchObject({ ok: true });
    const longest = data<View>(await core.view(null)).questions.find((question) => question.text.startsWith("<b>"))!;
    expect(longest.text.length).toBe(LIMITS.questionLength);
  });

  it("counts one vote per person, takes it back on a second press, and limits one network", async () => {
    const { core } = room();
    const { hostKey } = data<{ hostKey: string }>(await core.create("ABC234", ""));
    data(await core.settings(hostKey, { moderate: false }));
    const a = data<{ pid: string }>(await core.join("A", "")).pid;
    const b = data<{ pid: string }>(await core.join("B", "")).pid;
    const { id } = data<{ id: string }>(await core.ask(a, "Why do we sing?", ""));
    expect(data<{ votes: number }>(await core.vote(a, id, "net1")).votes).toBe(1);
    expect(data<{ votes: number }>(await core.vote(b, id, "net1")).votes).toBe(2);
    expect(data<{ votes: number }>(await core.vote(b, id, "net1")).votes).toBe(1);
    expect(data<View>(await core.view(a)).questions[0]).toMatchObject({ votes: 1, mine: true });
    expect(data<View>(await core.view(b)).questions[0]).toMatchObject({ mine: false });
  });

  it("ends: closed rooms and idle ones are gone", async () => {
    const { core, advance } = room();
    const { hostKey } = data<{ hostKey: string }>(await core.create("ABC234", ""));
    expect((await core.create("ABC234", "")).ok).toBe(false);
    advance(LIMITS.idleMs + 1);
    expect(await core.view(null)).toMatchObject({ ok: false, status: 404 });
    const second = room();
    const key = data<{ hostKey: string }>(await second.core.create("XYZ234", "")).hostKey;
    data(await second.core.close(key));
    expect(await second.core.view(null)).toMatchObject({ ok: false, status: 404 });
    void hostKey;
  });
});

describe("rooms: quizzes and polls", () => {
  it("runs a quiz question: answers once, never shows the right answer early, scores quicker answers higher", async () => {
    const { core, advance } = room();
    const { hostKey } = data<{ hostKey: string }>(await core.create("ABC234", ""));
    const quick = data<{ pid: string }>(await core.join("Quick", "")).pid;
    const slow = data<{ pid: string }>(await core.join("Slow", "")).pid;
    const wrong = data<{ pid: string }>(await core.join("Wrong", "")).pid;
    expect(await core.answer(quick, 0)).toMatchObject({ ok: false, status: 409 });
    data(await core.activity(hostKey, { action: "open", kind: "quiz", game: "Bible quiz", round: 1, total: 3, question: { prompt: "Who built the ark?", choices: ["Noah", "Moses", "David"], correct: 0, seconds: 20, points: 1000 } }));
    const open = data<View>(await core.view(quick)).activity;
    expect(open).toMatchObject({ kind: "quiz", phase: "open", answered: null });
    expect((open.question as Record<string, unknown>).correct).toBeUndefined();
    data(await core.answer(quick, 0));
    expect(await core.answer(quick, 1)).toMatchObject({ ok: false, status: 409 });
    data(await core.answer(wrong, 2));
    advance(15_000);
    data(await core.answer(slow, 0));
    data(await core.activity(hostKey, { action: "reveal" }));
    const revealed = data<View>(await core.view(quick));
    expect(revealed.activity).toMatchObject({ phase: "reveal", correct: 0, counts: [2, 0, 1] });
    expect(revealed.leaderboard![0]!.name).toBe("Quick");
    expect(revealed.leaderboard![0]!.score).toBeGreaterThan(revealed.leaderboard![1]!.score);
    expect(revealed.leaderboard!.some((entry) => entry.name === "Wrong")).toBe(false);
    // Revealing twice does not score twice.
    const before = revealed.leaderboard![0]!.score;
    data(await core.activity(hostKey, { action: "reveal" }));
    expect(data<View>(await core.view(null)).leaderboard![0]!.score).toBe(before);
  });

  it("gives each player a colour number, a streak, and a ranking that shows who moved up", async () => {
    const { core } = room();
    const { hostKey } = data<{ hostKey: string }>(await core.create("ABC234", ""));
    const names = ["Ama", "Kofi", "Esi", "Yaw", "Abena", "Kwame", "Efua", "Kojo", "Adjoa", "Kwesi", "Akua", "Fiifi", "Nana"];
    const pids: string[] = [];
    for (const name of names) {
      const joined = data<{ pid: string; n: number }>(await core.join(name, ""));
      expect(joined.n).toBe(pids.length);
      pids.push(joined.pid);
    }
    const ask = (round: number) => core.activity(hostKey, { action: "open", kind: "quiz", game: "G", round, total: 2, question: { prompt: `Q${round}`, choices: ["right", "wrong"], correct: 0, seconds: 20, points: 1000 } });
    // Round 1: only Kofi is right. Round 2: Kofi and Nana (the last to join, so 13th on a tie) are right: Nana climbs to 2nd.
    data(await ask(1));
    data(await core.answer(pids[1], 0));
    data(await core.answer(pids[0], 1));
    data(await core.activity(hostKey, { action: "reveal" }));
    data(await ask(2));
    data(await core.answer(pids[1], 0));
    data(await core.answer(pids[12], 0));
    data(await core.activity(hostKey, { action: "reveal" }));
    type Host = { ranking: { players: number; top: Array<{ n: number; name: string; score: number; before: number; gain: number; streak: number; rank: number; was: number }>; bottom: Array<{ name: string }> }; joined: Array<{ n: number; name: string }> };
    const host = data<Host>(await core.hostView(hostKey));
    expect(host.ranking.players).toBe(13);
    const [first, second] = host.ranking.top;
    expect(first).toMatchObject({ name: "Kofi", rank: 1, was: 1, streak: 2 });
    expect(first!.score).toBe(first!.before + first!.gain);
    expect(second).toMatchObject({ name: "Nana", rank: 2, was: 13, streak: 1 });
    // A second right answer in a row earns the streak's extra 100 (both answered at once here).
    expect(first!.gain).toBe(second!.gain + 100);
    expect(host.ranking.top).toHaveLength(10);
    expect(host.ranking.bottom).toHaveLength(3);
    expect(host.joined.at(-1)).toMatchObject({ n: 12, name: "Nana" });
    // The phone learns its own standing, never anyone's id.
    const mine = data<View & { me: { n: number } }>(await core.view(pids[12]));
    expect(mine.me.n).toBe(12);
    expect(mine.activity).toMatchObject({ gain: second!.gain, streak: 1, rank: 2, players: 13 });
  });

  it("gives reading time before answers open, and names the fastest right answer", async () => {
    const { core, advance } = room();
    const { hostKey } = data<{ hostKey: string }>(await core.create("ABC234", ""));
    const ama = data<{ pid: string }>(await core.join("Ama", "")).pid;
    const kofi = data<{ pid: string }>(await core.join("Kofi", "")).pid;
    data(await core.activity(hostKey, { action: "open", kind: "quiz", game: "G", round: 1, total: 1, question: { prompt: "Q", choices: ["right", "wrong"], correct: 0, seconds: 20, points: 1000 }, readMs: 4000 }));
    const phone = data<View>(await core.view(ama));
    const now = Number(phone.activity.now);
    expect(phone.activity).toMatchObject({ opensAt: now + 4000, endsAt: now + 24_000 });
    // Answering while still reading counts as the quickest possible, never more.
    data(await core.answer(ama, 0));
    advance(14_000);
    data(await core.answer(kofi, 0));
    data(await core.activity(hostKey, { action: "reveal" }));
    const host = data<{ fastest: { name: string; ms: number } | null; ranking: { top: Array<{ name: string; gain: number }> } }>(await core.hostView(hostKey));
    expect(host.fastest).toEqual({ n: 0, name: "Ama", ms: 0 });
    expect(host.ranking.top.find((entry) => entry.name === "Ama")!.gain).toBe(1500);
    expect(host.ranking.top.find((entry) => entry.name === "Kofi")!.gain).toBe(1250);
  });

  it("splits players into even teams and ranks teams by their average score", async () => {
    const { core } = room();
    const { hostKey } = data<{ hostKey: string }>(await core.create("ABC234", ""));
    const pids: string[] = [];
    for (const name of ["Ama", "Kofi", "Esi"]) pids.push(data<{ pid: string }>(await core.join(name, "")).pid);
    data(await core.activity(hostKey, { action: "teams", teams: 2 }));
    // A latecomer joins the next team in turn: Ama and Esi Red (0), Kofi and Yaw Blue (1).
    pids.push(data<{ pid: string }>(await core.join("Yaw", "")).pid);
    expect(data<{ me: { team: number } }>(await core.view(pids[3]!)).me.team).toBe(1);
    data(await core.activity(hostKey, { action: "open", kind: "quiz", game: "G", round: 1, total: 1, question: { prompt: "Q", choices: ["right", "wrong"], correct: 0, seconds: 0, points: 1000 } }));
    // Only Kofi is right: Blue's average is half his points; Red scores nothing.
    data(await core.answer(pids[1]!, 0));
    data(await core.activity(hostKey, { action: "reveal" }));
    const host = data<{ teams: Array<{ team: number; players: number; score: number }> }>(await core.hostView(hostKey));
    const kofi = data<{ ranking: { top: Array<{ name: string; score: number }> } }>(await core.hostView(hostKey)).ranking.top.find((entry) => entry.name === "Kofi")!.score;
    expect(host.teams).toEqual([
      { team: 1, players: 2, score: Math.round(kofi / 2), gain: Math.round(kofi / 2) },
      { team: 0, players: 2, score: 0, gain: 0 },
    ]);
    // Teams off: no standings, and phones no longer say a team.
    data(await core.activity(hostKey, { action: "teams", teams: 0 }));
    expect(data<{ teams: unknown }>(await core.hostView(hostKey)).teams).toBeNull();
    expect(data<{ me: { team?: number } }>(await core.view(pids[0]!)).me.team).toBeUndefined();
  });

  it("runs a poll with no right answer, and refuses a quiz question without one", async () => {
    const { core } = room();
    const { hostKey } = data<{ hostKey: string }>(await core.create("ABC234", ""));
    expect(await core.activity(hostKey, { action: "open", kind: "quiz", question: { prompt: "Q", choices: ["a", "b"] } })).toMatchObject({ ok: false });
    data(await core.activity(hostKey, { action: "open", kind: "poll", question: { prompt: "Which song next?", choices: ["Amazing Grace", "How Great Thou Art"] } }));
    const pid = data<{ pid: string }>(await core.join("", "")).pid;
    data(await core.answer(pid, 1));
    data(await core.activity(hostKey, { action: "reveal" }));
    expect(data<View>(await core.view(pid)).activity).toMatchObject({ kind: "poll", counts: [0, 1], correct: undefined });
  });
});

describe("rooms: the screen on browsers and phones", () => {
  it("shares what the desk sends, answers 'nothing new' cheaply, and stops when sharing stops", async () => {
    const { core } = room();
    const { hostKey } = data<{ hostKey: string }>(await core.create("ABC234", "Grace"));
    expect(data(await core.screen(0))).toBeNull();
    expect(await core.share("wrong", { frame: "{}" })).toMatchObject({ ok: false, status: 403 });
    expect(await core.share(hostKey, { frame: "not json" })).toMatchObject({ ok: false, status: 400 });
    expect(await core.share(hostKey, { frame: "x".repeat(LIMITS.frameBytes + 1) })).toMatchObject({ ok: false, status: 413 });
    const { revision } = data<{ revision: number }>(await core.share(hostKey, { frame: JSON.stringify({ model: { layout: "title" } }) }));
    expect(data(await core.screen(0))).toMatchObject({ on: true, revision, name: "Grace", frame: '{"model":{"layout":"title"}}' });
    expect(data(await core.screen(revision))).toBeNull();
    data(await core.share(hostKey, { on: false }));
    expect(data<{ on: boolean; frame?: string }>(await core.screen(revision))).toMatchObject({ on: false });
  });
});

describe("rooms on Cloudflare", () => {
  it("opens a room with a join link, and passes phones through to their room", async () => {
    const namespace = memoryRooms();
    const call = (path: string, body?: unknown) => handleRooms(new Request(`https://church.test${path}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }), namespace, "https://church.test", (code) => `page ${code}`);
    const opened = (await (await call("/v1/rooms", { name: "Grace" }))!.json()) as { code: string; hostKey: string; joinUrl: string };
    expect(opened.joinUrl).toBe(`https://church.test/j/${opened.code}`);
    expect(await (await call(`/j/${opened.code}`))!.text()).toBe(`page ${opened.code}`);
    const joined = (await (await call(`/v1/rooms/${opened.code}/join`, { name: "Kofi" }))!.json()) as { pid: string };
    expect((await call(`/v1/rooms/${opened.code}/ask`, { pid: joined.pid, text: "Is there coffee after?" }))!.status).toBe(200);
    const host = (await (await call(`/v1/rooms/${opened.code}/host`, { hostKey: opened.hostKey }))!.json()) as { questions: Array<{ state: string }>; people: number };
    expect(host).toMatchObject({ people: 1, questions: [{ state: "pending" }] });
    expect((await call(`/v1/rooms/ZZZZZZ/state`))!.status).toBe(404);
    expect(await call("/v1/licenses")).toBeNull();
    const display = (await call(`/d/${opened.code.toLowerCase()}`))!;
    expect(display.status).toBe(302);
    expect(display.headers.get("location")).toBe(`https://church.test/app/?receiver=${opened.code}`);
    expect((await call(`/v1/rooms/${opened.code}/screen?after=0`))!.status).toBe(204);
  });
});

describe("rooms: joining by code", () => {
  it("serves a page to type the code in at /j, and the room page at /j/CODE", async () => {
    const { roomPage } = await import("./room-page");
    const call = (path: string) => handleRooms(new Request(`https://church.test${path}`), memoryRooms(), "https://church.test", roomPage);
    for (const path of ["/j", "/j/"]) {
      const response = await call(path);
      expect(response?.status).toBe(200);
      expect(await response!.text()).toContain("Enter the code shown on the screen.");
    }
    const room = await (await call("/j/ABC234"))!.text();
    expect(room).toContain("ABC234");
    expect(room).not.toContain("Enter the code shown on the screen.");
  });
});

describe("rooms: who is here", () => {
  type Host = { people: number; joined: Array<{ name: string }> };

  it("counts the phones heard from lately, not everyone who ever joined", async () => {
    const { core, advance } = room();
    const { hostKey } = data<{ hostKey: string }>(await core.create("HERE23", ""));
    const ama = data<{ pid: string }>(await core.join("Ama", "")).pid;
    data(await core.join("Kofi", ""));
    expect(data<Host>(await core.hostView(hostKey))).toMatchObject({ people: 2 });
    // Kofi closes his phone; Ama's keeps checking in.
    for (let i = 0; i < 20; i++) {
      advance(2_500);
      data(await core.view(ama));
    }
    const later = data<Host>(await core.hostView(hostKey));
    expect(later.people).toBe(1);
    expect(later.joined.map((person) => person.name)).toEqual(["Ama"]);
  });

  it("leaves people who have gone out of a new game, and keeps those still here", async () => {
    const { core, advance, peek } = room();
    const { hostKey } = data<{ hostKey: string }>(await core.create("HERE45", ""));
    const ama = data<{ pid: string }>(await core.join("Ama", "")).pid;
    const kofi = data<{ pid: string }>(await core.join("Kofi", "")).pid;
    for (let i = 0; i < 60; i++) {
      advance(2_500);
      data(await core.view(ama));
    }
    data(await core.activity(hostKey, { action: "reset-scores" }));
    expect(Object.values(peek()!.participants).map((person) => person.name)).toEqual(["Ama"]);
    // Kofi's phone comes back: it is no longer in the room, so it asks for a name again.
    expect(data<{ me?: unknown }>(await core.view(kofi)).me).toBeUndefined();
    expect(await core.answer(kofi, 0)).toMatchObject({ ok: false, status: 401 });
  });

  it("keeps someone who just joined, and someone away only a moment", async () => {
    const { core, advance, peek } = room();
    const { hostKey } = data<{ hostKey: string }>(await core.create("HERE67", ""));
    data(await core.join("Ama", ""));
    advance(60_000);
    data(await core.activity(hostKey, { action: "reset-scores" }));
    expect(Object.values(peek()!.participants).map((person) => person.name)).toEqual(["Ama"]);
  });
});
