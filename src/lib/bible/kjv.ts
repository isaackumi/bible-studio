import { BUNDLED_TRANSLATIONS, bundledBooks, bundledChapter, bundledPassage, bundledSearch, chapterVerses } from "./texts";

export const KJV = BUNDLED_TRANSLATIONS[0];
export { chapterVerses };
export const kjvBooks = bundledBooks;
export const kjvChapter = (bookOrd: number, chapter: number) => bundledChapter("kjv", bookOrd, chapter);
export const kjvPassage = (bookOrd: number, chapter: number, startVerse: number, endVerse: number) =>
  bundledPassage("kjv", bookOrd, chapter, startVerse, endVerse);
export const kjvSearch = (query: string, limit = 24) => bundledSearch("kjv", query, limit);
