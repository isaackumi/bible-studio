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

pub fn seed_kjv_if_needed(conn: &Connection, path: &Path) -> Result<(), String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM bible_translations WHERE id = 'kjv'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Ok(());
    }
    if !path.exists() {
        return Err(format!("KJV source is missing at {}", path.display()));
    }
    log::info!("seeding KJV from {}", path.display());
    let file = File::open(path).map_err(|e| e.to_string())?;
    let books: Vec<SourceBook> =
        serde_json::from_reader(BufReader::new(file)).map_err(|e| e.to_string())?;
    let canon: Vec<CanonBook> =
        serde_json::from_str(include_str!("../../src/lib/bible/canon.json")).map_err(|e| e.to_string())?;
    if books.len() != canon.len() {
        return Err(format!(
            "KJV file has {} books; the canon lists {}",
            books.len(),
            canon.len()
        ));
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO bible_translations (id, name, abbreviation, license_note, source)
         VALUES ('kjv', 'King James Version', 'KJV', 'Public domain', 'bundled')",
        [],
    )
    .map_err(|e| e.to_string())?;

    {
        let mut insert_book = tx
            .prepare(
                "INSERT INTO bible_books (translation_id, ord, name, abbreviation) VALUES ('kjv', ?1, ?2, ?3)",
            )
            .map_err(|e| e.to_string())?;
        let mut insert_verse = tx
            .prepare(
                "INSERT INTO bible_verses (translation_id, book_ord, chapter, verse, text)
                 VALUES ('kjv', ?1, ?2, ?3, ?4)",
            )
            .map_err(|e| e.to_string())?;
        for (book, meta) in books.iter().zip(canon.iter()) {
            insert_book
                .execute(params![meta.ord, meta.name, meta.abbr])
                .map_err(|e| e.to_string())?;
            for (chapter_index, chapter) in book.chapters.iter().enumerate() {
                let chapter_no = (chapter_index + 1) as i32;
                for (verse_index, text) in chapter.iter().enumerate() {
                    insert_verse
                        .execute(params![meta.ord, chapter_no, (verse_index + 1) as i32, text])
                        .map_err(|e| e.to_string())?;
                }
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    log::info!("KJV seed complete");
    Ok(())
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

    #[test]
    fn bundled_kjv_contains_john_3_16() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/kjv.json");
        let file = File::open(path).expect("kjv.json");
        let books: Vec<SourceBook> = serde_json::from_reader(BufReader::new(file)).expect("json");
        let john = &books[42];
        let text = &john.chapters[2][15];
        assert!(text.starts_with("For God so loved the world"));
    }
}
