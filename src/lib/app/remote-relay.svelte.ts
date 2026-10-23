// The phone remote over the internet: the desk's side of the relay (server/relay.ts). The desk keeps
// its own remote room (apart from Audience, so ending a Q&A never cuts off the phone), waits on the
// room's inbox, hands each phone message to the same dispatch the Wi-Fi remote uses, and posts the
// answer back. Pairing, approval, tokens and revocation stay on the desk, exactly as on Wi-Fi.

import { SERVER_URL } from "../domain/billing";
import { readRemoteEnvelope, remoteEnvelope, type RemoteEnvelope } from "../domain/remote";
import { t } from "../i18n/core";

const ROOM_KEY = "church-studio:remote-room";
/** The desk's inbox request comes back empty after 20 s (relay.ts); a little longer than that. */
const INBOX_TIMEOUT = 26_000;

/** `origin` is the public address phones open (from the server's join link), not the API address. */
type Room = { code: string; hostKey: string; origin: string; openedAt?: number };

function readRoom(): Room | null {
  try {
    const saved = JSON.parse(localStorage.getItem(ROOM_KEY) ?? "null") as Room | null;
    return saved && /^[A-Z0-9]{6}$/.test(saved.code) && typeof saved.hostKey === "string" && typeof saved.origin === "string" ? saved : null;
  } catch {
    return null;
  }
}

function writeRoom(room: Room | null) {
  try {
    if (room) localStorage.setItem(ROOM_KEY, JSON.stringify(room));
    else localStorage.removeItem(ROOM_KEY);
  } catch {
    // Storage refused: a new room next time, and paired phones scan again.
  }
}

/** The phone page for a room, with a one-time pairing token when pairing. */
export function relayPageUrl(server: string, code: string, pairToken?: string): string {
  const url = new URL("/app/remote.html", server);
  url.searchParams.set("room", code);
  if (pairToken) url.searchParams.set("pair", pairToken);
  return url.toString();
}

/** The short address to type on a phone: church-studio.heitechinc.com/r/CODE. */
export function relayShortUrl(server: string, code: string): string {
  return `${new URL(server).host}/r/${code}`;
}

class InternetRemote {
  room = $state<Room | null>(typeof localStorage === "undefined" ? null : readRoom());
  /** Waiting on the inbox: phones can reach the desk. */
  connected = $state(false);
  error = $state("");
  private running = false;
  private abort: AbortController | null = null;

  get code(): string {
    return this.room?.code ?? "";
  }

  pageUrl = (pairToken?: string) => (this.room ? relayPageUrl(this.room.origin, this.room.code, pairToken) : "");
  shortUrl = () => (this.room ? relayShortUrl(this.room.origin, this.room.code) : "");

  /** Start relaying (once): every phone message goes to `dispatch`, its answer back to the phone. */
  start = async (name: string, dispatch: (envelope: RemoteEnvelope) => Promise<RemoteEnvelope>) => {
    if (this.running) return;
    this.running = true;
    this.error = "";
    let wait = 1000;
    while (this.running) {
      try {
        const room = this.room ?? (await this.open(name));
        const messages = await this.inbox(room);
        this.connected = true;
        this.error = "";
        wait = 1000;
        // In order, one after another: "next, next, go live" must land as pressed.
        for (const message of messages) {
          const parsed = readRemoteEnvelope(message.envelope);
          const reply = parsed ? await dispatch(parsed) : remoteEnvelope("denied", { reason: "This page is out of date. Reload it." });
          await this.post(room, "reply", { id: message.id, envelope: reply }).catch(() => {});
        }
      } catch (error) {
        if (!this.running) break;
        // Our own time limit on a quiet inbox: ask again.
        if ((error as Error).name === "AbortError") continue;
        this.connected = false;
        const status = (error as { status?: number }).status;
        // The room ended (a day unused) or is not ours: a new one. Paired phones keep their pairing
        // but need the new address, so they scan again.
        // A room that is not found the moment it was made means this server has no relay (an older
        // server): wait, as for any other failure, instead of making rooms in a loop.
        const fresh = this.room?.openedAt !== undefined && Date.now() - this.room.openedAt < 60_000;
        if ((status === 404 || status === 403) && !fresh) {
          this.room = null;
          writeRoom(null);
          continue;
        }
        this.error = t("The phone remote cannot reach the internet. It tries again by itself.");
        await new Promise((resolve) => setTimeout(resolve, wait));
        wait = Math.min(wait * 2, 30_000);
      }
    }
    this.connected = false;
  };

  stop = () => {
    this.running = false;
    this.abort?.abort();
    this.connected = false;
  };

  /** Stop and forget the room: its address stops working for every phone. */
  forget = () => {
    this.stop();
    this.room = null;
    writeRoom(null);
  };

  private open = async (name: string): Promise<Room> => {
    const response = await fetch(`${SERVER_URL}/v1/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.slice(0, 60) }) });
    // Not "ended" (that would ask for a new room at once, in a loop): wait and try again.
    if (!response.ok) throw Object.assign(new Error(`rooms ${response.status}`), { status: 0 });
    const made = (await response.json()) as { code: string; hostKey: string; joinUrl?: string };
    let origin = SERVER_URL;
    try {
      if (made.joinUrl) origin = new URL(made.joinUrl).origin;
    } catch {
      // The API address will do.
    }
    const room: Room = { code: made.code, hostKey: made.hostKey, origin, openedAt: Date.now() };
    this.room = room;
    writeRoom(room);
    return room;
  };

  private inbox = async (room: Room): Promise<Array<{ id: string; envelope: unknown }>> => {
    this.abort = new AbortController();
    const timer = setTimeout(() => this.abort?.abort(), INBOX_TIMEOUT);
    try {
      const body = (await this.post(room, "inbox", {}, this.abort.signal)) as { messages?: Array<{ id: string; envelope: unknown }> };
      return Array.isArray(body.messages) ? body.messages : [];
    } finally {
      clearTimeout(timer);
    }
  };

  private post = async (room: Room, action: "inbox" | "reply", body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> => {
    const response = await fetch(`${SERVER_URL}/v1/rooms/${room.code}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, hostKey: room.hostKey }),
      signal,
    });
    if (!response.ok) throw Object.assign(new Error(`${action} ${response.status}`), { status: response.status });
    return response.json();
  };
}

export const internetRemote = new InternetRemote();
