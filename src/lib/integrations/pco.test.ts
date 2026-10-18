import { describe, expect, it } from "vitest";
import { importPlan, listPlans, listServiceTypes, pcoAuthorization, PcoError, PCO_BASE, type PcoGet } from "./pco";

const routes: Record<string, unknown> = {
  [`${PCO_BASE}/service_types?per_page=50`]: { data: [{ id: "st1", type: "ServiceType", attributes: { name: "Sunday Morning" } }] },
  [`${PCO_BASE}/service_types/st1/plans?filter=future&order=sort_date&per_page=12`]: {
    data: [{ id: "p1", type: "Plan", attributes: { title: "Harvest Sunday", dates: "October 19, 2026", sort_date: "2026-10-19T09:00:00Z", items_count: 5 } }],
  },
  [`${PCO_BASE}/service_types/st1/plans/p1/items?include=song,arrangement&per_page=100`]: {
    data: [
      { id: "i3", type: "Item", attributes: { item_type: "song", title: "Amazing Grace", sequence: 3 }, relationships: { song: { data: { id: "s1", type: "Song" } }, arrangement: { data: { id: "a1", type: "Arrangement" } } } },
      { id: "i1", type: "Item", attributes: { item_type: "header", title: "Worship", sequence: 1 } },
      { id: "i2", type: "Item", attributes: { item_type: "item", title: "Welcome", description: "Greet the visitors", sequence: 2 } },
      { id: "i5", type: "Item", attributes: { item_type: "song", title: "Holy Holy Holy", sequence: 5 }, relationships: { song: { data: { id: "s2", type: "Song" } }, arrangement: { data: null } } },
      { id: "i4", type: "Item", attributes: { item_type: "header", title: "Word", sequence: 4 } },
    ],
    included: [
      { id: "s1", type: "Song", attributes: { title: "Amazing Grace", author: "John Newton", ccli_number: 22025, copyright: "Public Domain" } },
      { id: "a1", type: "Arrangement", attributes: { lyrics: "VERSE 1\nAmazing grace how sweet the sound\nThat saved a wretch like me\n\nVERSE 2\nTwas grace that taught my heart to fear", sequence: ["Verse 1", "Verse 2", "Verse 1"] } },
      { id: "s2", type: "Song", attributes: { title: "Holy, Holy, Holy", author: "Heber", ccli_number: 1156 } },
    ],
  },
};
const get: PcoGet = async (url) => routes[url] ?? { errors: [{ status: "404", title: "Not found" }] };
let n = 0;
const id = () => `id${++n}`;

describe("Planning Center", () => {
  it("lists service types and upcoming plans", async () => {
    expect(await listServiceTypes(get)).toEqual([{ id: "st1", name: "Sunday Morning" }]);
    expect(await listPlans(get, "st1")).toEqual([{ id: "p1", serviceTypeId: "st1", title: "Harvest Sunday", dates: "October 19, 2026", sortDate: "2026-10-19T09:00:00Z", items: 5 }]);
  });

  it("turns a plan into a service with sections, songs and slides in order", async () => {
    const plan = (await listPlans(get, "st1"))[0]!;
    const existing = { id: "lib-holy", title: "Holy, Holy, Holy", author: "Heber", ccli: "1156", sections: [{ id: "v", kind: "verse" as const, label: "Verse 1", lines: ["Holy"] }] };
    const result = await importPlan(get, plan, (song) => (song.ccli === "1156" ? existing : undefined), id, new Date("2026-10-17T10:00:00Z"));
    expect(result.service.name).toBe("Harvest Sunday · October 19, 2026");
    expect(result.service.sections.map((section) => [section.name, section.items.map((item) => `${item.kind}:${item.title}`)])).toEqual([
      ["Worship", ["announcement:Welcome", "lyric:Amazing Grace"]],
      ["Word", ["lyric:Holy, Holy, Holy"]],
    ]);
    // A new song comes with its lyrics; a known one (same CCLI number) is reused.
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0]).toMatchObject({ title: "Amazing Grace", author: "John Newton", ccli: "22025", folder: "Planning Center" });
    expect(result.songs[0]!.sections.map((section) => section.lines[0])).toEqual(["Amazing grace how sweet the sound", "Twas grace that taught my heart to fear"]);
    expect(result.service.sections[1]!.items[0]!.lyric?.songId).toBe("lib-holy");
    // The arrangement's sequence becomes the song's order.
    const [v1, v2] = result.songs[0]!.sections.map((section) => section.id);
    expect(result.songs[0]!.order).toEqual([v1, v2, v1]);
  });

  it("explains a rejected token", async () => {
    const denied: PcoGet = async () => ({ errors: [{ status: "401", title: "Unauthorized" }] });
    await expect(listServiceTypes(denied)).rejects.toThrow(PcoError);
    await expect(listServiceTypes(denied)).rejects.toThrow(/did not accept the token/);
  });

  it("builds basic credentials", () => {
    expect(pcoAuthorization(" app ", "secret")).toBe(`Basic ${btoa("app:secret")}`);
  });
});
