//! The .churchstudio file: a church's whole library, and every picture, video and audio file in
//! Media, in one file that moves it to a new computer.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub const FORMAT: &str = "church-studio-move";
pub const NOT_OURS: &str = "This is not a Church Studio file, or it is damaged.";
pub const DAMAGED: &str = "This file is damaged: it could not be read to the end. Nothing was added. Save it again on the old computer.";
pub const NO_SPACE: &str = "There is not enough free space on that drive. Free some space, or choose another drive.";
pub const TOO_LARGE: &str = "That drive cannot hold a file over 4 GB. Use a USB stick formatted as exFAT or NTFS, or a cloud drive folder.";

/// What a church can do about a file that could not be written.
pub fn explain_write_error(error: &std::io::Error) -> String {
    use std::io::ErrorKind;
    // Disk full: ENOSPC (28) or Windows ERROR_DISK_FULL (112) / ERROR_HANDLE_DISK_FULL (39).
    // Too large: EFBIG (27) or Windows ERROR_FILE_TOO_LARGE (223), a FAT32 stick past 4 GB.
    let code = error.raw_os_error();
    if error.kind() == ErrorKind::StorageFull || matches!(code, Some(28)) || (cfg!(windows) && matches!(code, Some(112 | 39))) {
        NO_SPACE.into()
    } else if error.kind() == ErrorKind::FileTooLarge || matches!(code, Some(27)) || (cfg!(windows) && matches!(code, Some(223))) {
        TOO_LARGE.into()
    } else {
        format!("The file could not be saved. {error}")
    }
}

/// One file in Media, as the library records it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaRow {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub ext: String,
    #[serde(skip)]
    pub path: PathBuf,
    #[serde(default)]
    pub bytes: u64,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format: String,
    pub version: u32,
    pub created_at: String,
    pub app_version: String,
    pub computer: String,
    pub media: Vec<MediaRow>,
}

#[derive(Clone, Debug, Serialize)]
pub struct WriteSummary {
    pub files: usize,
    pub missing: usize,
    pub bytes: u64,
}

/// Media is copied a megabyte at a time, so a library of any size never sits in memory.
const CHUNK: usize = 1 << 20;

/// Where a copy failed: reading the source, or writing the destination.
enum CopyError {
    Read(std::io::Error),
    Write(std::io::Error),
}

fn copy_counted(from: &mut impl Read, to: &mut impl Write, done: &mut u64, total: u64, progress: &mut impl FnMut(u64, u64)) -> Result<(), CopyError> {
    let mut buffer = vec![0u8; CHUNK];
    loop {
        let read = from.read(&mut buffer).map_err(CopyError::Read)?;
        if read == 0 {
            return Ok(());
        }
        to.write_all(&buffer[..read]).map_err(CopyError::Write)?;
        *done += read as u64;
        progress((*done).min(total), total);
    }
}

fn zip_write_error(error: zip::result::ZipError) -> String {
    match error {
        zip::result::ZipError::Io(error) => explain_write_error(&error),
        other => format!("The file could not be saved. {other}"),
    }
}

/// Write the library and every media file that still exists to `dest` (through `dest.part`, so a
/// move cut short never leaves a file that looks whole).
pub fn write_bundle(dest: &Path, library_json: &str, media: &[MediaRow], computer: &str, app_version: &str, mut progress: impl FnMut(u64, u64)) -> Result<WriteSummary, String> {
    let found: Vec<(MediaRow, u64)> = media.iter().filter_map(|row| std::fs::metadata(&row.path).ok().filter(|meta| meta.is_file()).map(|meta| (row.clone(), meta.len()))).collect();
    let total = found.iter().map(|(_, bytes)| bytes).sum::<u64>() + library_json.len() as u64;
    let part = dest.with_extension("churchstudio.part");
    let mut write = || -> Result<WriteSummary, String> {
        let file = File::create(&part).map_err(|error| explain_write_error(&error))?;
        let mut zip = ZipWriter::new(std::io::BufWriter::new(file));
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored).large_file(true);
        let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated).large_file(true);
        let mut done = 0u64;
        let mut rows = Vec::new();
        for (row, bytes) in &found {
            // Opened again here: a file removed since the count is left out, not an error.
            let Ok(mut source) = File::open(&row.path) else { continue };
            zip.start_file(format!("media/{}.{}", row.id, row.ext), stored).map_err(zip_write_error)?;
            copy_counted(&mut source, &mut zip, &mut done, total, &mut progress).map_err(|error| match error {
                CopyError::Read(error) => format!("{} could not be read. {error}", row.name),
                CopyError::Write(error) => explain_write_error(&error),
            })?;
            rows.push(MediaRow { bytes: *bytes, ..row.clone() });
        }
        zip.start_file("library.json", deflated).map_err(zip_write_error)?;
        zip.write_all(library_json.as_bytes()).map_err(|error| explain_write_error(&error))?;
        let manifest = Manifest { format: FORMAT.into(), version: 1, created_at: crate::db::chrono_now(), app_version: app_version.into(), computer: computer.into(), media: rows.clone() };
        zip.start_file("manifest.json", deflated).map_err(zip_write_error)?;
        zip.write_all(&serde_json::to_vec(&manifest).map_err(|error| error.to_string())?).map_err(|error| explain_write_error(&error))?;
        zip.finish().map_err(zip_write_error)?.flush().map_err(|error| explain_write_error(&error))?;
        progress(total, total);
        Ok(WriteSummary { files: rows.len(), missing: media.len() - rows.len(), bytes: rows.iter().map(|row| row.bytes).sum() })
    };
    match write() {
        Ok(summary) => {
            crate::storage::rename_patiently(&part, dest).map_err(|error| error.to_string())?;
            Ok(summary)
        }
        Err(error) => {
            let _ = std::fs::remove_file(&part);
            Err(error)
        }
    }
}

fn open(path: &Path) -> Result<ZipArchive<File>, String> {
    ZipArchive::new(File::open(path).map_err(|_| NOT_OURS.to_string())?).map_err(|_| NOT_OURS.into())
}

fn read_text(zip: &mut ZipArchive<File>, name: &str) -> Result<String, String> {
    let mut text = String::new();
    zip.by_name(name).map_err(|_| NOT_OURS.to_string())?.read_to_string(&mut text).map_err(|_| NOT_OURS.to_string())?;
    Ok(text)
}

/// What the file holds (for the screen that asks before bringing it in) and the library itself.
pub fn read_manifest(path: &Path) -> Result<(Manifest, String), String> {
    let mut zip = open(path)?;
    let manifest: Manifest = serde_json::from_str(&read_text(&mut zip, "manifest.json")?).map_err(|_| NOT_OURS.to_string())?;
    if manifest.format != FORMAT || manifest.version != 1 {
        return Err(NOT_OURS.into());
    }
    let library = read_text(&mut zip, "library.json")?;
    if !library_ok(&library) {
        return Err(NOT_OURS.into());
    }
    Ok((manifest, library))
}

/// The library inside reads as one: checked before any media is copied.
fn library_ok(text: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text).is_ok_and(|value| value["schemaVersion"] == 1 && value["songs"].is_array() && value["services"].is_array())
}

/// A media id is a UUID and its extension one Media accepts: nothing else names a file on disk.
fn safe(row: &MediaRow) -> bool {
    row.id.len() == 36 && row.id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') && crate::db::media_kind(&row.ext).is_some()
}

/// Copy the file's media into `media_dir`, leaving out ids this computer has already. Returns the
/// rows copied, each with its path here and the kind its extension says.
pub fn extract_media(path: &Path, media_dir: &Path, known_ids: &HashSet<String>, mut progress: impl FnMut(u64, u64)) -> Result<Vec<MediaRow>, String> {
    let (manifest, _) = read_manifest(path)?;
    let mut zip = open(path)?;
    std::fs::create_dir_all(media_dir).map_err(|error| error.to_string())?;
    let wanted: Vec<MediaRow> = manifest.media.into_iter().filter(|row| safe(row) && !known_ids.contains(&row.id)).collect();
    let total = wanted.iter().map(|row| row.bytes).sum::<u64>();
    let mut done = 0u64;
    let mut added = Vec::new();
    // Any failure takes back every file this call copied: nothing half-arrives.
    let undo = |added: &[MediaRow]| added.iter().for_each(|row| drop(std::fs::remove_file(&row.path)));
    for row in wanted {
        let Ok(mut entry) = zip.by_name(&format!("media/{}.{}", row.id, row.ext)) else { continue };
        let dest = media_dir.join(format!("{}.{}", row.id, row.ext));
        let part = dest.with_extension(format!("{}.part", row.ext));
        let copied = match File::create(&part) {
            Ok(mut out) => copy_counted(&mut entry, &mut out, &mut done, total, &mut progress).map_err(|error| match error {
                CopyError::Read(_) => DAMAGED.to_string(),
                CopyError::Write(error) => explain_write_error(&error),
            }),
            Err(error) => Err(explain_write_error(&error)),
        };
        if let Err(error) = copied.and_then(|_| crate::storage::rename_patiently(&part, &dest).map_err(|error| explain_write_error(&error))) {
            let _ = std::fs::remove_file(&part);
            undo(&added);
            return Err(error);
        }
        let kind = crate::db::media_kind(&row.ext).unwrap_or("image").to_string();
        added.push(MediaRow { kind, path: dest, ..row });
    }
    progress(total, total);
    Ok(added)
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIBRARY: &str = r#"{"schemaVersion":1,"songs":[],"services":[]}"#;
    const A: &str = "0b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b";
    const B: &str = "1b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b";

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cs-bundle-{tag}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn row(dir: &Path, id: &str, ext: &str, bytes: &[u8]) -> MediaRow {
        let path = dir.join(format!("{id}.{ext}"));
        std::fs::write(&path, bytes).unwrap();
        MediaRow { id: id.into(), name: format!("{id}.{ext}"), kind: if ext == "mp4" { "video".into() } else { "image".into() }, ext: ext.into(), path, bytes: bytes.len() as u64, created_at: "2026-10-24T10:00:00Z".into() }
    }

    #[test]
    fn round_trips_library_and_media() {
        let dir = scratch("round");
        let media = vec![row(&dir, A, "png", b"picture"), row(&dir, B, "mp4", &vec![7u8; 100_000])];
        let file = dir.join("Grace.churchstudio");
        let summary = write_bundle(&file, LIBRARY, &media, "Media PC", "0.5.1", |_, _| {}).unwrap();
        assert_eq!((summary.files, summary.missing), (2, 0));
        assert!(!dir.join("Grace.churchstudio.part").exists());
        let (manifest, library) = read_manifest(&file).unwrap();
        assert_eq!(library, LIBRARY);
        assert_eq!(manifest.computer, "Media PC");
        assert_eq!(manifest.media.len(), 2);
        let out = scratch("round-out");
        let added = extract_media(&file, &out, &HashSet::new(), |_, _| {}).unwrap();
        assert_eq!(added.len(), 2);
        assert_eq!(std::fs::read(out.join(format!("{A}.png"))).unwrap(), b"picture");
        assert_eq!(std::fs::read(out.join(format!("{B}.mp4"))).unwrap(), vec![7u8; 100_000]);
        assert_eq!(added[0].path, out.join(format!("{A}.png")));
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&out);
    }

    #[test]
    fn skips_missing_files_and_counts_them() {
        let dir = scratch("missing");
        let mut gone = row(&dir, B, "png", b"x");
        std::fs::remove_file(&gone.path).unwrap();
        gone.bytes = 1;
        let media = vec![row(&dir, A, "png", b"picture"), gone];
        let file = dir.join("m.churchstudio");
        let summary = write_bundle(&file, LIBRARY, &media, "PC", "0.5.1", |_, _| {}).unwrap();
        assert_eq!((summary.files, summary.missing), (1, 1));
        let (manifest, _) = read_manifest(&file).unwrap();
        assert_eq!(manifest.media.len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn import_skips_media_already_here() {
        let dir = scratch("known");
        let media = vec![row(&dir, A, "png", b"picture"), row(&dir, B, "png", b"other")];
        let file = dir.join("k.churchstudio");
        write_bundle(&file, LIBRARY, &media, "PC", "0.5.1", |_, _| {}).unwrap();
        let out = scratch("known-out");
        let added = extract_media(&file, &out, &HashSet::from([A.to_string()]), |_, _| {}).unwrap();
        assert_eq!(added.iter().map(|entry| entry.id.as_str()).collect::<Vec<_>>(), vec![B]);
        assert!(!out.join(format!("{A}.png")).exists());
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&out);
    }

    fn handmade(path: &Path, entries: &[(&str, &[u8])]) {
        let mut zip = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
        for (name, bytes) in entries {
            zip.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.finish().unwrap();
    }

    fn manifest_of(media: &[(&str, &str)]) -> Vec<u8> {
        let rows: Vec<serde_json::Value> = media.iter().map(|(id, ext)| serde_json::json!({ "id": id, "name": "n", "kind": "image", "ext": ext, "bytes": 1, "createdAt": "x" })).collect();
        serde_json::to_vec(&serde_json::json!({ "format": FORMAT, "version": 1, "createdAt": "x", "appVersion": "0.5.1", "computer": "PC", "media": rows })).unwrap()
    }

    #[test]
    fn rejects_foreign_or_broken_files() {
        let dir = scratch("foreign");
        let plain = dir.join("plain.churchstudio");
        handmade(&plain, &[("hello.txt", b"hi")]);
        assert_eq!(read_manifest(&plain).unwrap_err(), NOT_OURS);
        let other = dir.join("other.churchstudio");
        handmade(&other, &[("manifest.json", br#"{"format":"something-else","version":1,"createdAt":"","appVersion":"","computer":"","media":[]}"#), ("library.json", LIBRARY.as_bytes())]);
        assert_eq!(read_manifest(&other).unwrap_err(), NOT_OURS);
        let good = dir.join("good.churchstudio");
        let media = vec![row(&dir, A, "png", &vec![1u8; 50_000])];
        write_bundle(&good, LIBRARY, &media, "PC", "0.5.1", |_, _| {}).unwrap();
        let bytes = std::fs::read(&good).unwrap();
        let cut = dir.join("cut.churchstudio");
        std::fs::write(&cut, &bytes[..bytes.len() / 2]).unwrap();
        assert_eq!(read_manifest(&cut).unwrap_err(), NOT_OURS);
        std::fs::write(dir.join("text.churchstudio"), b"not a zip").unwrap();
        assert_eq!(read_manifest(&dir.join("text.churchstudio")).unwrap_err(), NOT_OURS);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_paths_outside_media() {
        let dir = scratch("escape");
        let file = dir.join("e.churchstudio");
        let bad_ext = "2b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b";
        handmade(
            &file,
            &[
                ("manifest.json", &manifest_of(&[("../x", "png"), (bad_ext, "exe"), (A, "png")])),
                ("library.json", LIBRARY.as_bytes()),
                ("media/../x.png", b"evil"),
                (&format!("media/{bad_ext}.exe"), b"evil"),
                (&format!("media/{A}.png"), b"fine"),
            ],
        );
        let out = scratch("escape-out");
        let added = extract_media(&file, &out, &HashSet::new(), |_, _| {}).unwrap();
        assert_eq!(added.iter().map(|entry| entry.id.as_str()).collect::<Vec<_>>(), vec![A]);
        assert!(!out.parent().unwrap().join("x.png").exists());
        assert!(!out.join(format!("{bad_ext}.exe")).exists());
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&out);
    }

    #[test]
    fn progress_reaches_total() {
        let dir = scratch("progress");
        let media = vec![row(&dir, A, "png", &vec![3u8; 300_000])];
        let file = dir.join("p.churchstudio");
        let mut last = (0, 1);
        write_bundle(&file, LIBRARY, &media, "PC", "0.5.1", |done, total| last = (done, total)).unwrap();
        assert_eq!(last.0, last.1);
        assert!(last.1 >= 300_000);
        let out = scratch("progress-out");
        let mut seen = (0, 1);
        extract_media(&file, &out, &HashSet::new(), |done, total| seen = (done, total)).unwrap();
        assert_eq!(seen.0, seen.1);
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&out);
    }

    #[test]
    fn damaged_media_leaves_nothing_behind() {
        let dir = scratch("crc");
        let media = vec![row(&dir, A, "png", &vec![7u8; 200_000]), row(&dir, B, "png", &vec![9u8; 200_000])];
        let file = dir.join("c.churchstudio");
        write_bundle(&file, LIBRARY, &media, "PC", "0.5.1", |_, _| {}).unwrap();
        let mut bytes = std::fs::read(&file).unwrap();
        // Stored media sits in the file as is: spoil the second file's data, not the index.
        let at = bytes.windows(1000).rposition(|window| window.iter().all(|&b| b == 9)).unwrap();
        bytes[at + 500] = 1;
        std::fs::write(&file, &bytes).unwrap();
        let out = scratch("crc-out");
        let error = extract_media(&file, &out, &HashSet::new(), |_, _| {}).unwrap_err();
        assert_eq!(error, DAMAGED);
        assert_eq!(std::fs::read_dir(&out).unwrap().count(), 0);
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&out);
    }

    #[test]
    fn explains_full_and_too_small_drives() {
        use std::io::{Error, ErrorKind};
        assert_eq!(explain_write_error(&Error::from(ErrorKind::StorageFull)), NO_SPACE);
        assert_eq!(explain_write_error(&Error::from_raw_os_error(if cfg!(windows) { 112 } else { 28 })), NO_SPACE);
        assert_eq!(explain_write_error(&Error::from(ErrorKind::FileTooLarge)), TOO_LARGE);
        assert_eq!(explain_write_error(&Error::from_raw_os_error(if cfg!(windows) { 223 } else { 27 })), TOO_LARGE);
        assert!(explain_write_error(&Error::from(ErrorKind::PermissionDenied)).contains("could not be saved"));
    }

    #[test]
    fn a_broken_library_is_refused_before_any_media() {
        let dir = scratch("library");
        let file = dir.join("l.churchstudio");
        handmade(&file, &[("manifest.json", &manifest_of(&[(A, "png")])), ("library.json", b"{not json"), (&format!("media/{A}.png"), b"fine")]);
        assert_eq!(read_manifest(&file).unwrap_err(), NOT_OURS);
        let out = scratch("library-out");
        assert!(extract_media(&file, &out, &HashSet::new(), |_, _| {}).is_err());
        assert_eq!(std::fs::read_dir(&out).map(|entries| entries.count()).unwrap_or(0), 0);
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&out);
    }
}
