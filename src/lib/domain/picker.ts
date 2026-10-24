// The random picker: someone (or a few) drawn from the people in the room, for a giveaway, a
// volunteer or who reads next; or everyone split into groups at random. Each person is known by
// their join number, so two people with the same name are still two people.

import { shuffle } from "./games";

export type RoomPerson = { n: number; name: string };

/**
 * Up to `count` people at random. `before` are the join numbers already picked: left out when
 * `again` is false, so each spin picks someone new until everyone has had a turn.
 */
export function pickPeople(people: readonly RoomPerson[], count: number, before: readonly number[] = [], again = false, random = Math.random): RoomPerson[] {
  const pool = again ? [...people] : people.filter((person) => !before.includes(person.n));
  return shuffle(pool, random).slice(0, Math.max(1, Math.round(count)));
}

/** Everyone in `count` groups at random, as even as can be (sizes differ by one at most). */
export function makeGroups(people: readonly RoomPerson[], count: number, random = Math.random): RoomPerson[][] {
  const groups = Math.max(2, Math.min(Math.round(count), Math.max(2, people.length)));
  const out: RoomPerson[][] = Array.from({ length: groups }, () => []);
  shuffle(people, random).forEach((person, index) => out[index % groups]!.push(person));
  return out;
}
