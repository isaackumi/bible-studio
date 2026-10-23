import { describe, expect, it } from "vitest";
import { RELAY, RemoteRelay, type Clock } from "./relay";
import { handleRooms, memoryRooms } from "./rooms";

/** Time that moves only when the test says. */
function fakeClock() {
  let now = 1_000_000;
  let timers: Array<{ at: number; run: () => void; id: number }> = [];
  let next = 0;
  const clock: Clock = {
    now: () => now,
    after: (ms, run) => {
      const id = next++;
      timers.push({ at: now + ms, run, id });
      return id;
    },
    cancel: (id) => void (timers = timers.filter((timer) => timer.id !== id)),
  };
  const advance = (ms: number) => {
    now += ms;
    const due = timers.filter((timer) => timer.at <= now);
    timers = timers.filter((timer) => timer.at > now);
    for (const timer of due) timer.run();
  };
  return { clock, advance };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("phone remote relay", () => {
  it("tells a phone at once when the desk is not connected", async () => {
    const { clock } = fakeClock();
    expect(await new RemoteRelay(clock).send({ type: "state" })).toBeNull();
  });

  it("carries a phone's message to the waiting desk and the desk's answer back", async () => {
    const { clock } = fakeClock();
    let n = 0;
    const relay = new RemoteRelay(clock, () => `m${++n}`);
    const inbox = relay.take();
    const answer = relay.send({ type: "command", payload: { id: "next" } });
    expect(await inbox).toEqual([{ id: "m1", envelope: { type: "command", payload: { id: "next" } } }]);
    expect(relay.reply("m1", { type: "ack" })).toBe(true);
    expect(await answer).toEqual({ type: "ack" });
    expect(relay.reply("m1", { type: "ack" })).toBe(false);
  });

  it("keeps messages that arrive between inbox requests", async () => {
    const { clock } = fakeClock();
    const relay = new RemoteRelay(clock, () => "m");
    const replaced = relay.take();
    const current = relay.take(); // the desk reloaded: the newer request takes over
    expect(await replaced).toEqual([]);
    void relay.send({ type: "state" });
    expect((await current).length).toBe(1);
    // Arriving while the desk is between requests, it waits for the next one.
    void relay.send({ type: "command" });
    void relay.send({ type: "state" });
    expect((await relay.take()).map((message) => (message.envelope as { type: string }).type)).toEqual(["command", "state"]);
  });

  it("gives up on a phone's message the desk does not answer, and forgets it", async () => {
    const { clock, advance } = fakeClock();
    const relay = new RemoteRelay(clock, () => "m");
    relay.take();
    advance(RELAY.inboxMs); // the desk's request came back empty; the desk still counts as connected
    const answer = relay.send({ type: "state" });
    advance(RELAY.replyMs);
    expect(await answer).toBeNull();
    const inbox = relay.take();
    advance(RELAY.inboxMs);
    expect(await inbox).toEqual([]);
  });

  it("stops counting the desk as connected when it stops asking", async () => {
    const { clock, advance } = fakeClock();
    const relay = new RemoteRelay(clock);
    void relay.take();
    advance(RELAY.inboxMs);
    advance(RELAY.deskMs);
    expect(relay.deskConnected()).toBe(false);
    expect(await relay.send({ type: "state" })).toBeNull();
  });
});

describe("phone remote through a room", () => {
  const call = (rooms: ReturnType<typeof memoryRooms>, path: string, body?: unknown) =>
    handleRooms(new Request(`https://church.test${path}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }), rooms, "https://church.test", () => "page");

  it("relays only into a live room, and only the church's desk reads and answers", async () => {
    const rooms = memoryRooms();
    expect((await call(rooms, "/v1/rooms/ABCDEF/remote", { v: 2, type: "state", payload: {} }))!.status).toBe(404);
    const made = (await (await call(rooms, "/v1/rooms", { name: "Grace" }))!.json()) as { code: string; hostKey: string };
    expect((await call(rooms, `/v1/rooms/${made.code}/inbox`, { hostKey: "wrong" }))!.status).toBe(403);
    // The desk is not connected yet: the phone hears so at once.
    expect((await call(rooms, `/v1/rooms/${made.code}/remote`, { v: 2, type: "state", payload: {} }))!.status).toBe(503);

    // The desk: waits on its inbox, refuses a stranger's answer, then answers the phone.
    const desk = (async () => {
      const inbox = await call(rooms, `/v1/rooms/${made.code}/inbox`, { hostKey: made.hostKey });
      const { messages } = (await inbox!.json()) as { messages: Array<{ id: string; envelope: { type: string } }> };
      expect(messages[0]!.envelope.type).toBe("command");
      expect((await call(rooms, `/v1/rooms/${made.code}/reply`, { hostKey: "wrong", id: messages[0]!.id, envelope: {} }))!.status).toBe(403);
      const sent = await call(rooms, `/v1/rooms/${made.code}/reply`, { hostKey: made.hostKey, id: messages[0]!.id, envelope: { v: 2, type: "ack", payload: { done: "next" } } });
      expect(await sent!.json()).toEqual({ delivered: true });
    })();
    // The phone: as a real one, asks again while the desk is not listening yet.
    let answer: Response | null = null;
    for (let attempt = 0; attempt < 200 && (!answer || answer.status === 503); attempt++) {
      if (answer) await tick();
      answer = await call(rooms, `/v1/rooms/${made.code}/remote`, { v: 2, type: "command", payload: { token: "t", id: "next" } });
    }
    await desk;
    expect(answer!.status).toBe(200);
    expect(await answer!.json()).toEqual({ v: 2, type: "ack", payload: { done: "next" } });
  });

  it("refuses a message too large to be a remote press", async () => {
    const rooms = memoryRooms();
    const made = (await (await call(rooms, "/v1/rooms", { name: "Grace" }))!.json()) as { code: string };
    const big = await call(rooms, `/v1/rooms/${made.code}/remote`, { v: 2, type: "state", payload: { x: "y".repeat(RELAY.messageBytes) } });
    expect(big!.status).toBe(413);
  });

  it("has a short address to type that opens the phone page for the room", async () => {
    const response = await call(memoryRooms(), "/r/abc234");
    expect(response!.status).toBe(302);
    expect(response!.headers.get("location")).toBe("https://church.test/app/remote.html?room=ABC234");
  });
});
