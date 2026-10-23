import { describe, expect, it } from "vitest";
import { roomPage } from "./room-page";
import { PHONE_WORDS, phoneLanguage, phoneWord } from "./room-words";

describe("the phone page's language", () => {
  it("follows the phone: French, Spanish, else English", () => {
    expect(phoneLanguage("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(phoneLanguage("es-419,es;q=0.9")).toBe("es");
    expect(phoneLanguage("de-DE,en;q=0.7")).toBe("en");
    expect(phoneLanguage(null)).toBe("en");
  });

  it("fills its lines and shows the page in that language", () => {
    expect(phoneWord("fr", "Question {n} of {total}", { n: 3, total: 8 })).toBe("Question 3 sur 8");
    const page = roomPage("ABC234", "https://x", "es");
    expect(page).toContain('<html lang="es">');
    expect(page).toContain(">Entrar</button>");
    expect(roomPage("", "https://x", "fr")).toContain("Rejoindre une salle");
  });

  it("has every line in both languages", () => {
    expect(Object.keys(PHONE_WORDS.es).sort()).toEqual(Object.keys(PHONE_WORDS.fr).sort());
  });
});
