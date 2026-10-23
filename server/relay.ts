// The phone remote over the internet: a relay, nothing more. A phone posts a message; the church's
// desk, waiting on its inbox, takes it, decides (pairing, approval, tokens, revocation all stay on the
// desk, as on Wi-Fi) and posts the answer, which goes back as the reply to the phone's own request.
//
// Messages live in memory for a few seconds and are never stored: if the room object restarts, a
// phone simply asks again. One relay per room object.

export const RELAY = {
  /** How long a phone's request waits for the desk to answer. */
  replyMs: 6_000,
  /** How long the desk's inbox request waits for a message before coming back empty. */
  inboxMs: 20_000,
  /** The desk counts as connected this long after its last inbox request. */
  deskMs: 30_000,
  /** Messages waiting at once (a phone presses once a second; a few phones at most). */
  queue: 50,
  /** One message from a phone, and one answer from the desk (the answer carries the running order). */
  messageBytes: 8 * 1024,
  replyBytes: 96 * 1024,
};

type Timer = unknown;
export type Clock = { now(): number; after(ms: number, run: () => void): Timer; cancel(timer: Timer): void };

export const realClock: Clock = {
  now: () => Date.now(),
  after: (ms, run) => setTimeout(run, ms),
  cancel: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

export type RelayMessage = { id: string; envelope: unknown };
type Waiting = { resolve: (reply: unknown | null) => void; timer: Timer };

export class RemoteRelay {
  private inbox: RelayMessage[] = [];
  private replies = new Map<string, Waiting>();
  private desk: { resolve: (messages: RelayMessage[]) => void; timer: Timer } | null = null;
  private deskSeen = -Infinity;

  constructor(private clock: Clock = realClock, private newId: () => string = () => crypto.randomUUID()) {}

  /** Whether the desk has asked for messages recently (else a phone is told at once). */
  deskConnected(): boolean {
    return this.clock.now() - this.deskSeen < RELAY.deskMs;
  }

  /**
   * A phone's message: resolves with the desk's answer, or null when the desk did not answer in
   * time (or is not connected, or too much is waiting).
   */
  send(envelope: unknown): Promise<unknown | null> {
    if (!this.deskConnected() || this.inbox.length >= RELAY.queue) return Promise.resolve(null);
    const id = this.newId();
    return new Promise((resolve) => {
      const timer = this.clock.after(RELAY.replyMs, () => {
        this.replies.delete(id);
        this.inbox = this.inbox.filter((message) => message.id !== id);
        resolve(null);
      });
      this.replies.set(id, { resolve, timer });
      this.inbox.push({ id, envelope });
      this.wakeDesk();
    });
  }

  /** The desk asks for messages: everything waiting, or the next to arrive, or nothing after a while. */
  take(): Promise<RelayMessage[]> {
    this.deskSeen = this.clock.now();
    // A second inbox request (the desk reloaded) replaces the first.
    if (this.desk) {
      this.clock.cancel(this.desk.timer);
      this.desk.resolve([]);
      this.desk = null;
    }
    if (this.inbox.length) return Promise.resolve(this.drain());
    return new Promise((resolve) => {
      const timer = this.clock.after(RELAY.inboxMs, () => {
        this.desk = null;
        this.deskSeen = this.clock.now();
        resolve([]);
      });
      this.desk = { resolve, timer };
    });
  }

  /** The desk's answer to one message; false when the phone has stopped waiting. */
  reply(id: string, envelope: unknown): boolean {
    this.deskSeen = this.clock.now();
    const waiting = this.replies.get(id);
    if (!waiting) return false;
    this.replies.delete(id);
    this.clock.cancel(waiting.timer);
    waiting.resolve(envelope);
    return true;
  }

  private drain(): RelayMessage[] {
    const messages = this.inbox;
    this.inbox = [];
    return messages;
  }

  private wakeDesk() {
    if (!this.desk) return;
    const desk = this.desk;
    this.desk = null;
    this.clock.cancel(desk.timer);
    this.deskSeen = this.clock.now();
    desk.resolve(this.drain());
  }
}
