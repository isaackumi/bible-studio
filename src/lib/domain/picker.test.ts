import { describe, expect, it } from "vitest";
import { makeGroups, pickPeople, type RoomPerson } from "./picker";

const room: RoomPerson[] = Array.from({ length: 10 }, (_, n) => ({ n, name: n % 2 ? "Ama" : `Person ${n}` }));

describe("the random picker", () => {
  it("picks the number asked for, each once", () => {
    const picked = pickPeople(room, 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((person) => person.n)).size).toBe(3);
  });

  it("picks someone new each spin until everyone has had a turn", () => {
    const before: number[] = [];
    for (let spin = 0; spin < 10; spin++) {
      const [person] = pickPeople(room, 1, before);
      expect(before).not.toContain(person!.n);
      before.push(person!.n);
    }
    expect(pickPeople(room, 1, before)).toEqual([]);
    expect(pickPeople(room, 1, before, true)).toHaveLength(1);
  });

  it("tells two people with the same name apart", () => {
    const amas = room.filter((person) => person.name === "Ama");
    expect(new Set(pickPeople(amas, 5).map((person) => person.n)).size).toBe(5);
  });

  it("gives every person an even chance", () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 5000; i++) {
      const [person] = pickPeople(room, 1);
      counts.set(person!.n, (counts.get(person!.n) ?? 0) + 1);
    }
    for (const count of counts.values()) expect(count).toBeGreaterThan(380);
  });
});

describe("random groups", () => {
  it("puts everyone in a group, the sizes as even as can be", () => {
    const groups = makeGroups(room, 3);
    expect(groups).toHaveLength(3);
    expect(groups.flat().map((person) => person.n).sort((a, b) => a - b)).toEqual(room.map((person) => person.n));
    const sizes = groups.map((group) => group.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it("makes at least two groups, and no more than there are people", () => {
    expect(makeGroups(room, 1)).toHaveLength(2);
    expect(makeGroups(room.slice(0, 3), 8)).toHaveLength(3);
  });
});
