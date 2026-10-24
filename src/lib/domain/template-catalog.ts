// Every template the studio offers without a download: the hand-made pages, and the kit's layouts
// laid over words for each kind of page, in palettes and fonts that suit it. This module is loaded
// only when the studio's Templates panel opens, so it costs nothing at start.

import { PAGE_TEMPLATES, type TemplateCategory } from "./page-templates";
import { buildTemplate, FONT_PAIRS, LOWER_THIRD_LAYOUTS, PAGE_LAYOUTS, PALETTES, type TemplateCopy, type TemplateLook, type TemplateSpec } from "./template-kit";
import type { Composition } from "./composition";

/** One card in the gallery: a hand-made page, or a spec the kit builds. */
export type CatalogEntry = {
  id: string;
  name: string;
  category: TemplateCategory;
  clear: boolean;
  /** Words to search: name, category, layout, palette, the words on the page. */
  search: string;
  /** The kit's spec, when it is one; such a template can be shown in another palette or font. */
  spec?: TemplateSpec;
  featured?: boolean;
  /** Which pack it came from, when it was downloaded. */
  pack?: string;
  build: (aspect: number, look?: TemplateLook) => Composition;
};

type Kind = { category: TemplateCategory; copies: TemplateCopy[]; layouts?: string[]; palettes?: string[]; tags?: string[] };

const GENERAL = ["centred", "side-bar", "split", "split-right", "frame", "big-type", "card", "band", "ribbon", "circles", "big-icon", "underline", "banner"];
const LISTS = ["list", "columns", "card", "side-bar", "split", "banner", "frame", "split-right"];
const VERSES = ["quote", "centred", "card", "frame", "side-bar", "underline", "big-icon", "ribbon", "circles", "banner", "split"];
const EVENTS = ["date-card", "columns", "split", "side-bar", "card", "banner", "split-right", "list", "circles"];

const KINDS: Kind[] = [
  {
    category: "Welcome",
    copies: [
      { eyebrow: "Welcome to", title: "Grace Chapel", subtitle: "We're glad you're here", icon: "church" },
      { title: "Welcome home", subtitle: "Find a seat, we start at 10:00", icon: "church" },
      { eyebrow: "Good morning", title: "Welcome", subtitle: "Sunday worship · 10:00", icon: "sun" },
      { eyebrow: "Starting soon", title: "Service begins shortly", subtitle: "Grab a coffee and find a seat", icon: "coffee" },
      { eyebrow: "First time here?", title: "We'd love to meet you", subtitle: "Stop by the welcome desk after the service", icon: "heart-handshake" },
    ],
    layouts: GENERAL,
  },
  {
    category: "Announcements",
    copies: [
      { eyebrow: "Announcements", title: "This week", body: "Tuesday · Bible study, 7 pm\nThursday · Choir rehearsal, 6 pm\nSaturday · Men's breakfast, 8 am\nNext Sunday · Baptisms after the service", icon: "calendar" },
      { title: "Announcements", subtitle: "What's happening at church", icon: "megaphone" },
      { eyebrow: "Don't miss", title: "Church picnic", rows: [{ icon: "calendar", text: "Saturday, 14 June" }, { icon: "clock", text: "From 12 noon" }, { icon: "map-pin", text: "Riverside park" }], icon: "party-popper" },
      { eyebrow: "Get involved", title: "Volunteers needed", subtitle: "Join the welcome, media or kids team. Sign up at the info desk.", icon: "hand-helping" },
      { eyebrow: "Reminder", title: "Church meeting after the service", subtitle: "All members are invited", icon: "bell" },
    ],
    layouts: [...LISTS, ...GENERAL.filter((id) => !LISTS.includes(id))],
  },
  {
    category: "Events",
    copies: [
      { date: { month: "Oct", day: "26" }, title: "Harvest Thanksgiving", rows: [{ icon: "clock", text: "Sunday, 10:00 am" }, { icon: "map-pin", text: "Main sanctuary" }], icon: "wheat" },
      { date: { month: "Nov", day: "8" }, eyebrow: "Men's fellowship", title: "Breakfast & Prayer", rows: [{ icon: "clock", text: "Saturday, 8:00 am" }, { icon: "map-pin", text: "Fellowship hall" }], icon: "coffee" },
      { date: { month: "Mar", day: "14" }, eyebrow: "Women's conference", title: "Rooted & Rising", rows: [{ icon: "calendar", text: "14–15 March" }, { icon: "map-pin", text: "Grace Chapel" }], icon: "flower-2" },
      { date: { month: "Aug", day: "2" }, eyebrow: "Youth camp", title: "Summer Camp", rows: [{ icon: "calendar", text: "2–6 August" }, { icon: "tent", text: "Register by 20 July" }], icon: "tent" },
      { date: { month: "Jun", day: "21" }, eyebrow: "Outreach", title: "Community Day", rows: [{ icon: "clock", text: "10 am – 3 pm" }, { icon: "map-pin", text: "Town square" }], icon: "heart-handshake" },
    ],
    layouts: EVENTS,
  },
  {
    category: "Scripture",
    copies: [
      { title: "“The Lord is my shepherd; I shall not want.”", subtitle: "Psalm 23:1", icon: "book-open" },
      { title: "“For God so loved the world, that he gave his only begotten Son.”", subtitle: "John 3:16", icon: "heart" },
      { title: "“They that wait upon the Lord shall renew their strength; they shall mount up with wings as eagles.”", subtitle: "Isaiah 40:31", icon: "bird" },
      { title: "“I can do all things through Christ which strengtheneth me.”", subtitle: "Philippians 4:13", icon: "mountain" },
      { title: "“Trust in the Lord with all thine heart; and lean not unto thine own understanding.”", subtitle: "Proverbs 3:5", icon: "leaf" },
      { title: "“Be strong and of a good courage; be not afraid.”", subtitle: "Joshua 1:9", icon: "flame" },
      { title: "“His compassions fail not. They are new every morning: great is thy faithfulness.”", subtitle: "Lamentations 3:22–23", icon: "sun" },
      { title: "“Come unto me, all ye that labour and are heavy laden, and I will give you rest.”", subtitle: "Matthew 11:28", icon: "hand-heart" },
      { title: "“And we know that all things work together for good to them that love God.”", subtitle: "Romans 8:28", icon: "sparkles" },
      { title: "“This is the day which the Lord hath made; we will rejoice and be glad in it.”", subtitle: "Psalm 118:24", icon: "sun" },
    ],
    layouts: VERSES,
    tags: ["verse", "bible"],
  },
  {
    category: "Sermon",
    copies: [
      { eyebrow: "The Sermon on the Mount", title: "Salt and Light", rows: [{ icon: "mic", text: "Pastor Ama Mensah" }], icon: "mic" },
      { eyebrow: "New series", title: "Faith That Works", subtitle: "A journey through James", icon: "book-open" },
      { eyebrow: "Part 3", title: "Grace Upon Grace", subtitle: "Pastor Daniel Owusu", icon: "mic" },
      { eyebrow: "Today's message", title: "Sermon notes", body: "1. God sees you\n2. God hears you\n3. God answers you", icon: "book-open" },
      { eyebrow: "Series", title: "The Lord's Prayer", subtitle: "Matthew 6:9–13", icon: "hand-heart" },
    ],
    layouts: [...GENERAL, "list", "columns"],
  },
  {
    category: "Worship",
    copies: [
      { eyebrow: "Let us", title: "Worship", subtitle: "Stand with us as we sing", icon: "music" },
      { title: "Praise & Worship", subtitle: "Sing to the Lord a new song", icon: "music" },
      { eyebrow: "Now singing", title: "Great Is Thy Faithfulness", subtitle: "Thomas Chisholm · William Runyan", icon: "music" },
      { eyebrow: "Special song", title: "Choir Ministration", subtitle: "Grace Chapel Choir", icon: "users" },
    ],
    layouts: GENERAL,
  },
  {
    category: "Prayer",
    copies: [
      { title: "Let us pray", icon: "sparkles" },
      { eyebrow: "Prayer requests", title: "We'd love to pray with you", subtitle: "Speak to a prayer team member after the service", icon: "hand-helping" },
      { title: "A moment of prayer", subtitle: "Bow your heads and close your eyes", icon: "leaf" },
      { eyebrow: "Prayer meeting", title: "Wednesdays at 7 pm", subtitle: "Everyone is welcome", icon: "hand-heart" },
    ],
    layouts: GENERAL,
    palettes: ["advent", "midnight", "dusk", "sea", "forest", "stone", "paper", "jordan"],
  },
  {
    category: "Giving",
    copies: [
      { title: "Give", subtitle: "Scan to give online, or use the boxes at the doors.", icon: "hand-heart", qr: true },
      { eyebrow: "Tithes & offerings", title: "Worship through giving", subtitle: "“God loveth a cheerful giver.” 2 Corinthians 9:7", icon: "heart" },
      { eyebrow: "Ways to give", title: "Thank you for your generosity", rows: [{ icon: "globe", text: "Online at grace.church/give" }, { icon: "hand-heart", text: "Boxes at the doors" }, { icon: "gift", text: "Mobile money: 0800 000 000" }], icon: "gift" },
    ],
    layouts: ["split", "split-right", "card", "columns", "side-bar", "centred", "frame", "banner", "big-icon", "circles"],
    palettes: ["glory", "royal", "paper", "forest", "midnight", "terracotta", "sea", "snow"],
  },
  {
    category: "Communion",
    copies: [
      { eyebrow: "The Lord's Supper", title: "Holy Communion", subtitle: "“This do in remembrance of me.” Luke 22:19", icon: "wine" },
      { title: "Communion", subtitle: "All who trust in Christ are welcome at the table", icon: "wheat" },
      { eyebrow: "Remember", title: "His body, broken for you", subtitle: "1 Corinthians 11:24", icon: "wheat" },
    ],
    layouts: ["centred", "frame", "card", "ribbon", "big-icon", "side-bar", "quote", "underline"],
    palettes: ["christmas", "midnight", "advent", "paper", "stone", "terracotta", "dusk"],
  },
  {
    category: "Baptism",
    copies: [
      { eyebrow: "Celebrating", title: "Baptism Sunday", subtitle: "Join us as we celebrate new life in Christ", icon: "droplet" },
      { title: "New Life", subtitle: "“Buried with him by baptism… we also should walk in newness of life.” Romans 6:4", icon: "droplet" },
      { eyebrow: "Next steps", title: "Ready to be baptised?", subtitle: "Sign up at the welcome desk", icon: "droplet" },
    ],
    layouts: ["centred", "split", "card", "circles", "big-icon", "band", "frame", "underline"],
    palettes: ["sea", "jordan", "sky", "snow", "midnight", "royal"],
  },
  {
    category: "Kids & youth",
    copies: [
      { eyebrow: "Kids church", title: "Children, follow your teachers!", subtitle: "Ages 3–11 · Room 2", icon: "star" },
      { eyebrow: "Fridays · 7 pm", title: "Youth Night", subtitle: "Games, worship and real talk", icon: "flame" },
      { title: "Sunday School", subtitle: "Classes for every age, 9:00 am", icon: "graduation-cap" },
      { eyebrow: "Teens", title: "Youth Camp", rows: [{ icon: "calendar", text: "2–6 August" }, { icon: "tent", text: "Sign up with the youth team" }], icon: "tent" },
    ],
    layouts: GENERAL,
    palettes: ["neon", "sky", "pentecost", "royal", "terracotta", "blush", "jordan", "ember"],
  },
  {
    category: "Christmas",
    copies: [
      { eyebrow: "Merry", title: "Christmas", subtitle: "“For unto us a child is born.” Isaiah 9:6", icon: "star" },
      { eyebrow: "Join us for", title: "Carols by Candlelight", rows: [{ icon: "calendar", text: "Sunday, 21 December" }, { icon: "clock", text: "6:00 pm" }], icon: "tree-pine" },
      { title: "Joy to the World", subtitle: "The Lord is come", icon: "gift" },
      { eyebrow: "Christmas Day", title: "Celebrate the King", subtitle: "Service at 10:00 am", icon: "star" },
    ],
    layouts: GENERAL,
    palettes: ["christmas", "midnight", "forest", "snow", "royal", "paper"],
    tags: ["advent", "nativity", "december"],
  },
  {
    category: "Easter",
    copies: [
      { eyebrow: "He is", title: "Risen", subtitle: "“He is not here: for he is risen.” Matthew 28:6", icon: "sun" },
      { eyebrow: "Holy week", title: "Good Friday", subtitle: "Service at 10:00 am", icon: "cross" },
      { title: "Happy Easter", subtitle: "Christ is risen indeed!", icon: "flower-2" },
      { eyebrow: "Palm Sunday", title: "Hosanna!", subtitle: "Blessed is he that cometh in the name of the Lord", icon: "leaf" },
    ],
    layouts: GENERAL,
    palettes: ["dawn", "glory", "blush", "paper", "advent", "sky", "midnight"],
    tags: ["resurrection", "holy week", "lent"],
  },
  {
    category: "Seasons",
    copies: [
      { eyebrow: "Thanksgiving", title: "Give Thanks", subtitle: "“O give thanks unto the Lord; for he is good.” Psalm 107:1", icon: "wheat" },
      { eyebrow: "Happy", title: "New Year", subtitle: "Behold, I make all things new", icon: "sparkles" },
      { eyebrow: "Happy", title: "Mother's Day", subtitle: "We celebrate every mother today", icon: "heart" },
      { eyebrow: "Happy", title: "Father's Day", subtitle: "Thank you for leading with love", icon: "heart-handshake" },
      { eyebrow: "Pentecost Sunday", title: "Come, Holy Spirit", subtitle: "Acts 2:1–4", icon: "flame" },
      { eyebrow: "Harvest", title: "Harvest Celebration", subtitle: "Bring your offering of thanks", icon: "leaf" },
    ],
    layouts: GENERAL,
  },
  {
    category: "Thank you",
    copies: [
      { title: "Thank you for joining us", subtitle: "Go in peace, and God bless you", icon: "heart" },
      { eyebrow: "See you", title: "Next Sunday", subtitle: "Sundays at 10:00 am", icon: "calendar" },
      { eyebrow: "Stay connected", title: "Find us online", rows: [{ icon: "globe", text: "grace.church" }, { icon: "users", text: "@gracechapel" }], icon: "globe", qr: true },
      { eyebrow: "The blessing", title: "The Lord bless thee, and keep thee", subtitle: "Numbers 6:24", icon: "sparkles" },
    ],
    layouts: [...GENERAL, "columns"],
  },
];

const LOWER_THIRD_COPIES: TemplateCopy[] = [
  { title: "Pastor Ama Mensah", subtitle: "Senior pastor", icon: "mic" },
  { title: "Romans 8:28", subtitle: "King James Version", icon: "book-open" },
  { title: "Great Is Thy Faithfulness", subtitle: "Thomas Chisholm · William Runyan", icon: "music" },
  { title: "Kwame Asante", subtitle: "Worship leader", icon: "music" },
  { title: "Live", subtitle: "Sunday service", icon: "sparkles" },
  { title: "Prayer line", subtitle: "Call 0800 000 000", icon: "hand-heart" },
];

/** Stable for an id: the same template keeps its palette and fonts from one version to the next. */
function pick<T>(list: readonly T[], key: string, salt = 0): T {
  let hash = 2166136261 + salt;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return list[(hash >>> 0) % list.length]!;
}

const LAYOUT_NAMES = new Map([...PAGE_LAYOUTS, ...LOWER_THIRD_LAYOUTS].map((layout) => [layout.id, layout.name]));
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function specEntry(spec: TemplateSpec, extra: Partial<CatalogEntry> = {}): CatalogEntry {
  const palette = typeof spec.palette === "string" ? spec.palette : spec.palette.name;
  const copy = spec.copy;
  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    clear: spec.layout.startsWith("lt-"),
    search: [spec.name, spec.category, LAYOUT_NAMES.get(spec.layout), palette, copy.eyebrow, copy.title, copy.subtitle, ...(spec.tags ?? [])].filter(Boolean).join(" ").toLowerCase(),
    spec,
    build: (aspect, look) => buildTemplate(spec, aspect, look),
    ...extra,
  };
}

/** The kit's templates: each kind of page in each layout that suits it, twice over in other words and colours. */
export function kitSpecs(): TemplateSpec[] {
  const specs: TemplateSpec[] = [];
  for (const kind of KINDS) {
    const layouts = kind.layouts ?? GENERAL;
    const palettes = kind.palettes ? PALETTES.filter((palette) => kind.palettes!.includes(palette.id)) : PALETTES;
    for (let round = 0; round < 2; round++) {
      layouts.forEach((layout, index) => {
        const copy = kind.copies[(index + round * 2) % kind.copies.length]!;
        const id = `kit:${slug(kind.category)}-${layout}-${round + 1}`;
        specs.push({
          id,
          name: LAYOUT_NAMES.get(layout) ?? layout,
          category: kind.category,
          layout,
          palette: pick(palettes, id).id,
          fonts: pick(FONT_PAIRS, id, 7).id,
          copy,
          ...(kind.tags ? { tags: kind.tags } : {}),
        });
      });
    }
  }
  for (const layout of LOWER_THIRD_LAYOUTS) {
    LOWER_THIRD_COPIES.forEach((copy, index) => {
      const id = `kit:lower-third-${layout.id}-${index + 1}`;
      specs.push({ id, name: layout.name, category: "Lower thirds", layout: layout.id, palette: pick(PALETTES, id).id, fonts: pick(FONT_PAIRS, id, 7).id, copy });
    });
  }
  return specs;
}

let catalog: CatalogEntry[] | null = null;

/** Hand-made pages first (marked featured), then the kit's, kind by kind. */
export function templateCatalog(): CatalogEntry[] {
  catalog ??= [
    ...PAGE_TEMPLATES.map<CatalogEntry>((template) => ({
      id: template.id,
      name: template.name,
      category: template.category,
      clear: !!template.clear,
      featured: true,
      search: `${template.name} ${template.category}`.toLowerCase(),
      build: (aspect) => template.build(aspect),
    })),
    ...kitSpecs().map((spec) => specEntry(spec)),
  ];
  return catalog;
}

/** A downloaded pack's templates, as gallery cards. */
export function packEntries(specs: TemplateSpec[], pack: string): CatalogEntry[] {
  return specs.map((spec) => specEntry(spec, { pack }));
}
