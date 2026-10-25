//! A listening recording: while listening runs, the sound the speech recognizer hears (16 kHz mono,
//! as it hears it) goes into a WAV file, and what it understood and the verses it picked go into a
//! text file beside it, each line timed. For checking and tuning listening against a real sermon,
//! and a copy of the sermon's sound. Off unless the church turns it on; it stays on this computer
//! (Documents › Church Studio Listening).
//!
//! The WAV is written as the sound comes, with its sizes put right every few seconds and at the
//! end, so a crash mid-sermon still leaves a file that plays up to that moment.

use std::fs::File;
use std::io::{BufWriter, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;

pub const RATE: u32 = 16_000;
/// Sizes in the header are put right this often (bytes of sound: about 5 s).
const FIX_EVERY: u64 = RATE as u64 * 2 * 5;

pub struct Recorder {
    wav: BufWriter<File>,
    notes: BufWriter<File>,
    bytes: u64,
    since_fix: u64,
    started: Instant,
    path: PathBuf,
}

fn header(bytes: u64) -> [u8; 44] {
    let data = bytes.min(u32::MAX as u64 - 36) as u32;
    let mut head = [0u8; 44];
    head[0..4].copy_from_slice(b"RIFF");
    head[4..8].copy_from_slice(&(36 + data).to_le_bytes());
    head[8..12].copy_from_slice(b"WAVE");
    head[12..16].copy_from_slice(b"fmt ");
    head[16..20].copy_from_slice(&16u32.to_le_bytes());
    head[20..22].copy_from_slice(&1u16.to_le_bytes()); // PCM
    head[22..24].copy_from_slice(&1u16.to_le_bytes()); // mono
    head[24..28].copy_from_slice(&RATE.to_le_bytes());
    head[28..32].copy_from_slice(&(RATE * 2).to_le_bytes());
    head[32..34].copy_from_slice(&2u16.to_le_bytes());
    head[34..36].copy_from_slice(&16u16.to_le_bytes());
    head[36..40].copy_from_slice(b"data");
    head[40..44].copy_from_slice(&data.to_le_bytes());
    head
}

impl Recorder {
    /// A new recording in `dir`, named for when it starts ("Listening 2026-10-25 10-04.wav").
    pub fn start(dir: &Path, stamp: &str) -> std::io::Result<Recorder> {
        std::fs::create_dir_all(dir)?;
        let path = dir.join(format!("Listening {stamp}.wav"));
        let mut wav = BufWriter::new(File::create(&path)?);
        wav.write_all(&header(0))?;
        let mut notes = BufWriter::new(File::create(path.with_extension("txt"))?);
        writeln!(notes, "Church Studio listening, {stamp}. Times are from the start of the recording.")?;
        Ok(Recorder { wav, notes, bytes: 0, since_fix: 0, started: Instant::now(), path })
    }

    /// Sound as the recognizer hears it: 16-bit little-endian samples, 16 kHz mono.
    pub fn sound(&mut self, bytes: &[u8]) -> std::io::Result<()> {
        self.wav.write_all(bytes)?;
        self.bytes += bytes.len() as u64;
        self.since_fix += bytes.len() as u64;
        if self.since_fix >= FIX_EVERY {
            self.since_fix = 0;
            self.fix_header()?;
        }
        Ok(())
    }

    /// A line in the notes, at the time it happened ("[03:12] heard: Turn with me to John 3:16").
    pub fn note(&mut self, line: &str) -> std::io::Result<()> {
        let seconds = self.started.elapsed().as_secs();
        writeln!(self.notes, "[{:02}:{:02}] {}", seconds / 60, seconds % 60, line.replace('\n', " "))?;
        self.notes.flush()
    }

    fn fix_header(&mut self) -> std::io::Result<()> {
        self.wav.flush()?;
        let file = self.wav.get_mut();
        file.seek(SeekFrom::Start(0))?;
        file.write_all(&header(self.bytes))?;
        file.seek(SeekFrom::End(0))?;
        Ok(())
    }

    /// Put the sizes right and close; the recording's path.
    pub fn finish(mut self) -> std::io::Result<PathBuf> {
        self.fix_header()?;
        self.wav.flush()?;
        self.notes.flush()?;
        Ok(self.path)
    }
}

static RECORDING: Mutex<Option<Recorder>> = Mutex::new(None);

fn lock() -> std::sync::MutexGuard<'static, Option<Recorder>> {
    RECORDING.lock().unwrap_or_else(|poison| poison.into_inner())
}

/// Whether listening is being recorded now (the speech engines then pass their sound on).
pub fn active() -> bool {
    lock().is_some()
}

/// Sound from the recognizer's feed, when recording.
pub fn sound(bytes: &[u8]) {
    if let Some(recorder) = lock().as_mut() {
        if recorder.sound(bytes).is_err() {
            log::warn!("listening recording: the sound could not be written");
        }
    }
}

/// A note from the speech engine or the desk, when recording.
pub fn note(line: &str) {
    if let Some(recorder) = lock().as_mut() {
        let _ = recorder.note(line);
    }
}

/// Start recording listening into Documents › Church Studio Listening; its folder.
#[tauri::command]
pub fn listen_record_start(app: tauri::AppHandle, stamp: String) -> Result<String, String> {
    use tauri::Manager;
    let dir = app.path().document_dir().map_err(|error| error.to_string())?.join("Church Studio Listening");
    let stamp: String = stamp.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == ' ').take(40).collect();
    let recorder = Recorder::start(&dir, &stamp).map_err(|error| format!("The listening recording could not start. {error}"))?;
    if let Some(old) = lock().replace(recorder) {
        let _ = old.finish();
    }
    Ok(dir.to_string_lossy().into_owned())
}

/// Stop recording listening; the recording's path, if one was running.
#[tauri::command]
pub fn listen_record_stop() -> Option<String> {
    let recorder = lock().take()?;
    recorder.finish().ok().map(|path| path.to_string_lossy().into_owned())
}

/// A line from the desk for the recording's notes ("on Preview: John 3:16").
#[tauri::command]
pub fn listen_record_note(line: String) {
    note(&line.chars().take(400).collect::<String>());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cs-listen-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn writes_a_wav_that_plays_and_notes_with_times() {
        let dir = scratch();
        let mut recorder = Recorder::start(&dir, "2026-10-25 10-04").unwrap();
        let second: Vec<u8> = (0..RATE).flat_map(|i| (((i as f32 * 0.05).sin() * 8000.0) as i16).to_le_bytes()).collect();
        for _ in 0..7 {
            recorder.sound(&second).unwrap();
        }
        recorder.note("heard: Turn with me to John 3:16").unwrap();
        let path = recorder.finish().unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..16], b"WAVEfmt ");
        assert_eq!(u32::from_le_bytes(bytes[24..28].try_into().unwrap()), RATE);
        assert_eq!(u32::from_le_bytes(bytes[40..44].try_into().unwrap()) as usize, bytes.len() - 44);
        assert_eq!(bytes.len() - 44, 7 * RATE as usize * 2);
        let notes = std::fs::read_to_string(path.with_extension("txt")).unwrap();
        assert!(notes.contains("[00:00] heard: Turn with me to John 3:16"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_recording_cut_off_mid_sermon_still_plays_up_to_its_last_few_seconds() {
        let dir = scratch();
        let mut recorder = Recorder::start(&dir, "cut").unwrap();
        let chunk = vec![1u8; FIX_EVERY as usize + 10];
        recorder.sound(&chunk).unwrap();
        let path = recorder.path.clone();
        std::mem::forget(recorder); // as if the app stopped here
        let bytes = std::fs::read(&path).unwrap();
        assert!(u32::from_le_bytes(bytes[40..44].try_into().unwrap()) as u64 >= FIX_EVERY);
        let _ = std::fs::remove_dir_all(dir);
    }
}
