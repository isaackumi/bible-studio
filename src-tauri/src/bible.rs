use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use rusqlite::{params, Connection};
use serde::Deserialize;

#[derive(Deserialize)]
struct CanonBook {
    ord: i32,
    name: String,
    abbr: String,
}

#[derive(Deserialize)]
struct SourceBook {
    chapters: Vec<Vec<String>>,
}

struct BundledTranslation {
    id: &'static str,
    name: &'static str,
    abbreviation: &'static str,
    file: &'static str,
    license: &'static str,
}

const BUNDLED: &[BundledTranslation] = &[
    BundledTranslation { id: "kjv", name: "King James Version", abbreviation: "KJV", file: "kjv.json", license: "Public domain" },
    BundledTranslation { id: "asv", name: "American Standard Version", abbreviation: "ASV", file: "asv.json", license: "Public domain" },
    BundledTranslation { id: "web", name: "World English Bible", abbreviation: "WEB", file: "web.json", license: "Public domain" },
    BundledTranslation { id: "bbe", name: "Bible in Basic English", abbreviation: "BBE", file: "bbe.json", license: "Public domain" },
    BundledTranslation {
        id: "twi",
        name: "Akuapem Twi (Nkwa Asɛm)",
        abbreviation: "TWI",
        file: "twi.json",
        license: "© 1996, 2020 Biblica, Inc. CC BY-SA 4.0",
    },
];

/// Openly licensed Bibles (CC BY-SA 4.0, from eBible.org, unchanged) that are not in the app: each
/// downloads only when a church chooses it, from our site, and must match its SHA-256 before use.
struct DownloadTranslation {
    id: &'static str,
    name: &'static str,
    abbreviation: &'static str,
    license: &'static str,
    sha256: &'static str,
}

const DOWNLOAD_BASE: &str = "https://church-studio.heitechinc.com/bibles/";

const DOWNLOADS: &[DownloadTranslation] = &[
    DownloadTranslation { id: "ewe", name: "Ewe (Biblica Open)", abbreviation: "EWE", license: "© 1988, 2006, 2020 Biblica, Inc. CC BY-SA 4.0", sha256: "b3352bd130ce245f3eecf5007e8620aec5ff833af288b6bd0e408f93c7e5ce55" },
    DownloadTranslation { id: "yor", name: "Yorùbá (Biblica Open)", abbreviation: "YOR", license: "© 2009, 2017 Biblica, Inc. CC BY-SA 4.0", sha256: "fc529c66c309da6d7e11412ebdb5dd06f25b5813683171abac395d6c38c7a31d" },
    DownloadTranslation { id: "ibo", name: "Igbo (Biblica Open)", abbreviation: "IGB", license: "© 2020 Biblica, Inc. CC BY-SA 4.0", sha256: "2f27c8fc751c8b8b79db177fba0c46632f1630b60fc19b94638070100bfe63f2" },
    DownloadTranslation { id: "hausa", name: "Hausa (Biblica Open)", abbreviation: "HAU", license: "© 2009, 2020 Biblica, Inc. CC BY-SA 4.0", sha256: "619d6bab639b56acea925930fd6667b1565fb4a76bc01b3d58234b34bace59a6" },
    DownloadTranslation { id: "twiasante", name: "Asante Twi (Biblica Open)", abbreviation: "TWA", license: "© 1996, 2020 Biblica, Inc. CC BY-SA 4.0", sha256: "a31822330b6f72be58a21a97d3de7fee65b930a036b361a34b2e1212cce862d8" },
];

/// Installed on first launch. The rest are installed on request (Settings → Bible).
const DEFAULT_IDS: &[&str] = &["kjv", "web"];

pub fn seed_bundled_translations(conn: &Connection, resource_dir: &Path) -> Result<(), String> {
    for translation in BUNDLED.iter().filter(|t| DEFAULT_IDS.contains(&t.id)) {
        seed_translation_if_needed(conn, resource_dir, translation)?;
    }
    Ok(())
}

/// Install one translation from the app's resources. Already installed: nothing to do.
pub fn install_translation(conn: &Connection, resource_dir: &Path, id: &str) -> Result<(), String> {
    let translation = BUNDLED
        .iter()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("{id} is not in the catalog"))?;
    seed_translation_if_needed(conn, resource_dir, translation)
}

/// Whether this id is one of the Bibles that download on request.
pub fn is_download(id: &str) -> bool {
    DOWNLOADS.iter().any(|t| t.id == id)
}

/// Fetch a downloadable Bible into `dir` (no database lock held), checked against its SHA-256.
/// Returns the file to install from.
pub fn fetch_download(id: &str, dir: &Path) -> Result<std::path::PathBuf, String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let translation = DOWNLOADS.iter().find(|t| t.id == id).ok_or_else(|| format!("{id} is not in the catalog"))?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let response = ureq::get(&format!("{DOWNLOAD_BASE}{id}.json"))
        .call()
        .map_err(|error| format!("{} could not be downloaded. Check the internet connection. ({error})", translation.abbreviation))?;
    let mut bytes = Vec::new();
    response
        .into_body()
        .into_reader()
        .take(40_000_000)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("The download stopped. Try again. ({error})"))?;
    let digest = Sha256::digest(&bytes).iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    if digest != translation.sha256 {
        return Err(format!("The {} download did not match the published file, so it was not installed. Try again.", translation.abbreviation));
    }
    let path = dir.join(format!("{id}.json"));
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Install a downloaded Bible from its checked file, then remove the file (the verses are in the library).
pub fn install_download(conn: &Connection, id: &str, path: &Path) -> Result<(), String> {
    let translation = DOWNLOADS.iter().find(|t| t.id == id).ok_or_else(|| format!("{id} is not in the catalog"))?;
    let result = seed_from(conn, Seed { id: translation.id, name: translation.name, abbreviation: translation.abbreviation, license: translation.license, origin: "download" }, path);
    let _ = std::fs::remove_file(path);
    result
}

/// Remove a translation's verses. The last installed translation cannot be removed.
pub fn remove_translation(conn: &Connection, id: &str) -> Result<(), String> {
    let installed: i64 = conn
        .query_row("SELECT COUNT(*) FROM bible_translations", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if installed <= 1 {
        return Err("Keep at least one translation installed.".into());
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM bible_verses WHERE translation_id = ?1", params![id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM bible_books WHERE translation_id = ?1", params![id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM bible_translations WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

struct Seed<'a> {
    id: &'a str,
    name: &'a str,
    abbreviation: &'a str,
    license: &'a str,
    /// Where it came from: "bundled" (inside the app) or "download".
    origin: &'a str,
}

fn seed_translation_if_needed(
    conn: &Connection,
    resource_dir: &Path,
    translation: &BundledTranslation,
) -> Result<(), String> {
    let seed = Seed { id: translation.id, name: translation.name, abbreviation: translation.abbreviation, license: translation.license, origin: "bundled" };
    let path = resource_dir.join(translation.file);
    seed_from(conn, seed, &path)
}

fn seed_from(conn: &Connection, translation: Seed<'_>, path: &Path) -> Result<(), String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM bible_translations WHERE id = ?1",
            params![translation.id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Ok(());
    }
    if !path.exists() {
        return Err(format!("{} source is missing at {}", translation.abbreviation, path.display()));
    }
    log::info!("seeding {} from {}", translation.abbreviation, path.display());
    let file = File::open(&path).map_err(|e| e.to_string())?;
    let books: Vec<SourceBook> =
        serde_json::from_reader(BufReader::new(file)).map_err(|e| e.to_string())?;
    let canon: Vec<CanonBook> =
        serde_json::from_str(include_str!("../../src/lib/bible/canon.json")).map_err(|e| e.to_string())?;
    if books.len() != canon.len() {
        return Err(format!(
            "{} file has {} books; the canon lists {}",
            translation.abbreviation,
            books.len(),
            canon.len()
        ));
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO bible_translations (id, name, abbreviation, license_note, source)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![translation.id, translation.name, translation.abbreviation, translation.license, translation.origin],
    )
    .map_err(|e| e.to_string())?;

    {
        let mut insert_book = tx
            .prepare(
                "INSERT INTO bible_books (translation_id, ord, name, abbreviation) VALUES (?1, ?2, ?3, ?4)",
            )
            .map_err(|e| e.to_string())?;
        let mut insert_verse = tx
            .prepare(
                "INSERT INTO bible_verses (translation_id, book_ord, chapter, verse, text)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .map_err(|e| e.to_string())?;
        for (book, meta) in books.iter().zip(canon.iter()) {
            insert_book
                .execute(params![translation.id, meta.ord, meta.name, meta.abbr])
                .map_err(|e| e.to_string())?;
            for (chapter_index, chapter) in book.chapters.iter().enumerate() {
                let chapter_no = (chapter_index + 1) as i32;
                for (verse_index, text) in chapter.iter().enumerate() {
                    insert_verse
                        .execute(params![
                            translation.id,
                            meta.ord,
                            chapter_no,
                            (verse_index + 1) as i32,
                            text
                        ])
                        .map_err(|e| e.to_string())?;
                }
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    log::info!("{} seed complete", translation.abbreviation);
    Ok(())
}

/// A Bible read from a church's own file (Zefania, OSIS, OpenSong: src/lib/bible/import.ts).
#[derive(Deserialize)]
pub struct ImportedBook {
    ord: i32,
    name: String,
    chapters: Vec<Vec<String>>,
}

#[derive(Deserialize)]
pub struct ImportedBible {
    name: String,
    abbreviation: String,
    books: Vec<ImportedBook>,
}

/// Install an imported Bible as its own translation ("user-…" id). Returns the new id.
pub fn import_translation(conn: &Connection, bible: &ImportedBible) -> Result<String, String> {
    let name = bible.name.trim();
    let abbreviation = bible.abbreviation.trim();
    if name.is_empty() || bible.books.is_empty() {
        return Err("That file has no Bible books in it.".into());
    }
    let slug: String = abbreviation
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .take(12)
        .collect();
    let base = format!("user-{}", if slug.is_empty() { "bible".to_string() } else { slug });
    let mut id = base.clone();
    let mut n = 2;
    while conn
        .query_row("SELECT COUNT(*) FROM bible_translations WHERE id = ?1", params![id], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?
        > 0
    {
        id = format!("{base}-{n}");
        n += 1;
    }
    let canon: Vec<CanonBook> =
        serde_json::from_str(include_str!("../../src/lib/bible/canon.json")).map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO bible_translations (id, name, abbreviation, license_note, source) VALUES (?1, ?2, ?3, '', 'imported')",
        params![id, name, if abbreviation.is_empty() { name } else { abbreviation }],
    )
    .map_err(|e| e.to_string())?;
    {
        let mut insert_book = tx
            .prepare("INSERT INTO bible_books (translation_id, ord, name, abbreviation) VALUES (?1, ?2, ?3, ?4)")
            .map_err(|e| e.to_string())?;
        let mut insert_verse = tx
            .prepare("INSERT INTO bible_verses (translation_id, book_ord, chapter, verse, text) VALUES (?1, ?2, ?3, ?4, ?5)")
            .map_err(|e| e.to_string())?;
        for book in &bible.books {
            let Some(meta) = canon.iter().find(|entry| entry.ord == book.ord) else { continue };
            let book_name = if book.name.trim().is_empty() { meta.name.as_str() } else { book.name.trim() };
            insert_book.execute(params![id, meta.ord, book_name, meta.abbr]).map_err(|e| e.to_string())?;
            for (chapter_index, chapter) in book.chapters.iter().enumerate() {
                for (verse_index, text) in chapter.iter().enumerate() {
                    if text.trim().is_empty() {
                        continue;
                    }
                    insert_verse
                        .execute(params![id, meta.ord, (chapter_index + 1) as i32, (verse_index + 1) as i32, text])
                        .map_err(|e| e.to_string())?;
                }
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(id)
}

/// A translation's whole text, as books of chapters of verses in canon order (empty where it has
/// none), for the voice detector's word index.
pub fn source_books(conn: &Connection, translation_id: &str) -> Result<Vec<Vec<Vec<String>>>, String> {
    let mut books: Vec<Vec<Vec<String>>> = vec![Vec::new(); 66];
    let mut statement = conn
        .prepare("SELECT book_ord, chapter, verse, text FROM bible_verses WHERE translation_id = ?1 ORDER BY book_ord, chapter, verse")
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map(params![translation_id], |row| Ok((row.get::<_, i32>(0)?, row.get::<_, i32>(1)?, row.get::<_, i32>(2)?, row.get::<_, String>(3)?)))
        .map_err(|e| e.to_string())?;
    for (book, chapter, verse, text) in rows.filter_map(Result::ok) {
        let Some(chapters) = usize::try_from(book - 1).ok().and_then(|at| books.get_mut(at)) else { continue };
        let (c, v) = (chapter.max(1) as usize, verse.max(1) as usize);
        if chapters.len() < c {
            chapters.resize(c, Vec::new());
        }
        let verses = &mut chapters[c - 1];
        if verses.len() < v {
            verses.resize(v, String::new());
        }
        verses[v - 1] = text;
    }
    Ok(books)
}

pub fn translations(conn: &Connection) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, abbreviation, license_note, source FROM bible_translations ORDER BY name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "abbreviation": row.get::<_, String>(2)?,
                "licenseNote": row.get::<_, String>(3)?,
                "source": row.get::<_, String>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn books(conn: &Connection, translation_id: &str) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT b.ord, b.name, b.abbreviation,
                    (SELECT MAX(v.chapter) FROM bible_verses v
                      WHERE v.translation_id = b.translation_id AND v.book_ord = b.ord)
             FROM bible_books b
             WHERE b.translation_id = ?1
             ORDER BY b.ord",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![translation_id], |row| {
            Ok(serde_json::json!({
                "ord": row.get::<_, i32>(0)?,
                "name": row.get::<_, String>(1)?,
                "abbreviation": row.get::<_, String>(2)?,
                "chapters": row.get::<_, i32>(3).unwrap_or(0),
            }))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn verses(
    conn: &Connection,
    translation_id: &str,
    book_ord: i32,
    chapter: i32,
) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT verse, text FROM bible_verses
             WHERE translation_id = ?1 AND book_ord = ?2 AND chapter = ?3
             ORDER BY verse",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![translation_id, book_ord, chapter], |row| {
            Ok(serde_json::json!({
                "verse": row.get::<_, i32>(0)?,
                "text": row.get::<_, String>(1)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn passage(
    conn: &Connection,
    translation_id: &str,
    book_ord: i32,
    chapter: i32,
    start_verse: i32,
    end_verse: i32,
) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT verse, text FROM bible_verses
             WHERE translation_id = ?1 AND book_ord = ?2 AND chapter = ?3
               AND verse >= ?4 AND verse <= ?5
             ORDER BY verse",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(
            params![translation_id, book_ord, chapter, start_verse, end_verse],
            |row| {
                Ok(serde_json::json!({
                    "verse": row.get::<_, i32>(0)?,
                    "text": row.get::<_, String>(1)?,
                }))
            },
        )
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn search(conn: &Connection, translation_id: &str, query: &str) -> Result<Vec<serde_json::Value>, String> {
    let needle = query.trim();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let like = format!("%{needle}%");
    let mut stmt = conn
        .prepare(
            "SELECT v.book_ord, b.name, v.chapter, v.verse, v.text
             FROM bible_verses v
             JOIN bible_books b ON b.translation_id = v.translation_id AND b.ord = v.book_ord
             WHERE v.translation_id = ?1 AND v.text LIKE ?2 COLLATE NOCASE
             ORDER BY v.book_ord, v.chapter, v.verse
             LIMIT 40",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![translation_id, like], |row| {
            Ok(serde_json::json!({
                "bookOrd": row.get::<_, i32>(0)?,
                "bookName": row.get::<_, String>(1)?,
                "chapter": row.get::<_, i32>(2)?,
                "verse": row.get::<_, i32>(3)?,
                "text": row.get::<_, String>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn john_3_16(file: &str) -> String {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources").join(file);
        let books: Vec<SourceBook> =
            serde_json::from_reader(BufReader::new(File::open(path).expect(file))).expect("json");
        books[42].chapters[2][15].clone()
    }

    /// The real thing, over the internet: cargo test --lib downloads_from_the_site -- --ignored
    #[test]
    #[ignore]
    fn downloads_from_the_site() {
        let dir = std::env::temp_dir().join(format!("cs-bibles-{}", std::process::id()));
        for t in DOWNLOADS {
            let path = fetch_download(t.id, &dir).unwrap();
            let books: Vec<SourceBook> = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            assert_eq!(books.len(), 66, "{}", t.id);
        }
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn downloads_are_well_formed() {
        let mut seen = std::collections::HashSet::new();
        for t in DOWNLOADS {
            assert!(seen.insert(t.id), "{} twice", t.id);
            assert!(t.sha256.len() == 64 && t.sha256.chars().all(|c| c.is_ascii_hexdigit()), "{}", t.id);
            assert!(t.license.contains("CC BY-SA 4.0"), "{} must be openly licensed", t.id);
            assert!(!BUNDLED.iter().any(|b| b.id == t.id), "{} is bundled too", t.id);
        }
    }

    #[test]
    fn bundled_kjv_contains_john_3_16() {
        assert!(john_3_16("kjv.json").starts_with("For God so loved the world"));
    }

    #[test]
    fn bundled_twi_has_every_book_and_john_3_16() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources").join("twi.json");
        let books: Vec<SourceBook> = serde_json::from_reader(BufReader::new(File::open(path).expect("twi"))).expect("json");
        assert_eq!(books.len(), 66);
        assert!(!john_3_16("twi.json").trim().is_empty());
    }

    #[test]
    fn bundled_asv_web_bbe_contain_john_3_16() {
        assert!(john_3_16("asv.json").to_lowercase().contains("god so loved"));
        assert!(john_3_16("web.json").to_lowercase().contains("god so loved"));
        assert!(john_3_16("bbe.json").to_lowercase().contains("love for the world"));
    }
}
