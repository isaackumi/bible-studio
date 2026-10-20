//! Songs from EasyWorship 6 and 7, so a church moving over brings its library.
//!
//! EasyWorship keeps songs in two SQLite files in its Data folder (for example
//! `Documents\Softouch\EasyWorship\Default\v6.1\Databases\Data`): `Songs.db` (table `song`: title,
//! author, copyright, CCLI number) and `SongWords.db` (table `word`: song_id, words as RTF). Both
//! are opened read-only; the words go to the front end, which reads the RTF and the parts.

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct EasyWorshipSong {
    pub title: String,
    pub author: String,
    pub copyright: String,
    pub ccli: String,
    /// The words as EasyWorship stores them (RTF).
    pub words: String,
}

/// `Songs.db` and `SongWords.db` in `folder` or a few levels below it (the user may pick the
/// EasyWorship folder rather than its Data folder). Names are matched without regard to case.
fn find_databases(folder: &Path, depth: usize) -> Option<(PathBuf, PathBuf)> {
    let entries: Vec<PathBuf> = std::fs::read_dir(folder).ok()?.filter_map(|entry| entry.ok().map(|e| e.path())).collect();
    let named = |name: &str| entries.iter().find(|path| path.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.eq_ignore_ascii_case(name))).cloned();
    if let (Some(songs), Some(words)) = (named("Songs.db"), named("SongWords.db")) {
        return Some((songs, words));
    }
    if depth == 0 {
        return None;
    }
    entries.iter().filter(|path| path.is_dir()).find_map(|dir| find_databases(dir, depth - 1))
}

fn columns(connection: &Connection, table: &str) -> Vec<String> {
    let Ok(mut statement) = connection.prepare(&format!("PRAGMA table_info({table})")) else { return Vec::new() };
    statement
        .query_map([], |row| row.get::<_, String>(1))
        .map(|rows| rows.filter_map(Result::ok).map(|name| name.to_lowercase()).collect())
        .unwrap_or_default()
}

/// The first of `wanted` that the table has, as a select expression, else an empty string.
fn pick(have: &[String], wanted: &[&str]) -> String {
    wanted.iter().find(|name| have.iter().any(|column| column == *name)).map_or_else(|| "''".to_string(), |name| format!("\"{name}\""))
}

pub fn read_songs(folder: &str) -> Result<Vec<EasyWorshipSong>, String> {
    let (songs_path, words_path) = find_databases(Path::new(folder), 4)
        .ok_or("No EasyWorship songs here. Choose the folder that holds Songs.db and SongWords.db (EasyWorship › Databases › Data).")?;
    let open = |path: &Path| Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX).map_err(|error| format!("{}: {error}", path.display()));
    let songs_db = open(&songs_path)?;
    let words_db = open(&words_path)?;
    let have = columns(&songs_db, "song");
    if have.is_empty() {
        return Err("Songs.db has no song table; this may not be an EasyWorship 6 or 7 library.".into());
    }
    let query = format!(
        "SELECT rowid, {}, {}, {}, {} FROM song",
        pick(&have, &["title"]),
        pick(&have, &["author"]),
        pick(&have, &["copyright"]),
        pick(&have, &["reference_number", "vendor_id", "ccli_number", "ccli"]),
    );
    let mut statement = songs_db.prepare(&query).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let text = |n: usize| -> String {
                row.get::<_, Option<String>>(n).ok().flatten().or_else(|| row.get::<_, Option<i64>>(n).ok().flatten().map(|v| v.to_string())).unwrap_or_default()
            };
            Ok((row.get::<_, i64>(0)?, text(1), text(2), text(3), text(4)))
        })
        .map_err(|error| error.to_string())?;
    let mut words = words_db.prepare("SELECT words FROM word WHERE song_id = ?1").map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for row in rows.filter_map(Result::ok) {
        let (id, title, author, copyright, ccli) = row;
        let text: String = words.query_row([id], |row| row.get::<_, Option<String>>(0)).ok().flatten().unwrap_or_default();
        if title.trim().is_empty() && text.trim().is_empty() {
            continue;
        }
        let ccli = ccli.chars().filter(char::is_ascii_digit).collect::<String>();
        out.push(EasyWorshipSong { title, author, copyright, ccli, words: text });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_songs_and_words_from_a_library_folder() {
        let dir = std::env::temp_dir().join(format!("ew-test-{}", std::process::id()));
        let data = dir.join("Databases").join("Data");
        std::fs::create_dir_all(&data).unwrap();
        let songs = Connection::open(data.join("Songs.db")).unwrap();
        songs.execute_batch("CREATE TABLE song (title TEXT, author TEXT, copyright TEXT, reference_number TEXT); INSERT INTO song VALUES ('Amazing Grace', 'John Newton', 'Public Domain', 'CCLI 22025');").unwrap();
        let words = Connection::open(data.join("SongWords.db")).unwrap();
        words.execute_batch(r"CREATE TABLE word (song_id INTEGER, words TEXT); INSERT INTO word VALUES (1, '{\rtf1 Verse 1\par Amazing grace}');").unwrap();
        drop((songs, words));
        let found = read_songs(dir.to_str().unwrap()).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Amazing Grace");
        assert_eq!(found[0].ccli, "22025");
        assert!(found[0].words.contains("Amazing grace"));
        assert!(read_songs(std::env::temp_dir().join("no-such-ew").to_str().unwrap()).is_err());
        let _ = std::fs::remove_dir_all(dir);
    }
}
