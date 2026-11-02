//! One library per licence on a computer. A person on two churches' licences keeps each church's
//! songs, media and sync record apart: the first library stays where it always was, in the app's
//! data folder, and each other licence has its own under `libraries/<licence id>`. Nothing is ever
//! moved or copied. A small file says which to open; switching rewrites it and the app restarts, so
//! removing that file always brings the first library back.
//!
//! What belongs to the computer rather than a church stays in the data folder itself: the lease,
//! the device id, speech models and the streaming engine.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;

const ACTIVE: &str = "library-active.json";
const CARRY: &str = "switch-carry.json";

/// `home`: the licence the data folder's own library belongs to. `active`: the one to open.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Active {
    pub home: String,
    pub active: String,
}

/// A licence id as a folder name: anything else is not one, and opens the first library.
fn safe_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 40 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// The folder under the data folder that holds the active library; None for the data folder itself.
fn subfolder(state: &Active) -> Option<PathBuf> {
    (state.active != state.home && safe_id(&state.active)).then(|| Path::new("libraries").join(&state.active))
}

/// Move to `target`. The first switch records whose library the data folder holds.
fn switched(state: Option<Active>, current: &str, target: &str) -> Active {
    let home = state.map_or_else(|| current.to_string(), |state| state.home);
    Active { home, active: target.to_string() }
}

fn read_active(base: &Path) -> Option<Active> {
    serde_json::from_str(&std::fs::read_to_string(base.join(ACTIVE)).ok()?).ok()
}

/// Where a library's files live. Read once: a switch restarts the app.
pub fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    static FOLDER: OnceLock<Option<PathBuf>> = OnceLock::new();
    let base = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let folder = FOLDER.get_or_init(|| read_active(&base).as_ref().and_then(subfolder));
    Ok(folder.as_ref().map_or_else(|| base.clone(), |folder| base.join(folder)))
}

/// Point this computer at `target`'s library for the next start, leaving `carry` for it to read:
/// who is signed in, and the licence, which each library keeps in its own settings.
fn point_at(base: &Path, current: &str, target: &str, carry: &str) -> Result<(), String> {
    if !safe_id(target) {
        return Err("That licence has no proper id.".into());
    }
    let next = switched(read_active(base), current, target);
    let folder = subfolder(&next).map_or_else(|| base.to_path_buf(), |folder| base.join(folder));
    std::fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    std::fs::write(folder.join(CARRY), carry).map_err(|error| error.to_string())?;
    let part = base.join(format!("{ACTIVE}.part"));
    std::fs::write(&part, serde_json::to_vec(&next).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    std::fs::rename(&part, base.join(ACTIVE)).map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn library_switch(app: tauri::AppHandle, current: String, target: String, carry: String) -> Result<(), String> {
    let base = app.path().app_data_dir().map_err(|error| error.to_string())?;
    point_at(&base, &current, &target, &carry)
}

/// What a switch left for this library, once.
#[tauri::command(async)]
pub fn library_carry_take(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = data_dir(&app)?.join(CARRY);
    let Ok(text) = std::fs::read_to_string(&path) else { return Ok(None) };
    let _ = std::fs::remove_file(&path);
    Ok(Some(text))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cs-library-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn folder(base: &Path) -> PathBuf {
        read_active(base).as_ref().and_then(subfolder).map_or_else(|| base.to_path_buf(), |folder| base.join(folder))
    }

    #[test]
    fn a_computer_that_never_switched_opens_the_data_folder() {
        let base = scratch();
        assert_eq!(folder(&base), base);
    }

    #[test]
    fn each_licence_keeps_its_own_folder_and_the_first_stays_put() {
        let base = scratch();
        std::fs::write(base.join("church.db"), b"first").unwrap();
        point_at(&base, "aaaa", "bbbb", "{}").unwrap();
        assert_eq!(folder(&base), base.join("libraries").join("bbbb"));
        point_at(&base, "bbbb", "cccc", "{}").unwrap();
        assert_eq!(folder(&base), base.join("libraries").join("cccc"));
        // Back to the first: the data folder again, its library untouched.
        point_at(&base, "cccc", "aaaa", "{}").unwrap();
        assert_eq!(folder(&base), base);
        assert_eq!(std::fs::read(base.join("church.db")).unwrap(), b"first");
    }

    #[test]
    fn what_a_switch_carries_waits_in_the_new_library() {
        let base = scratch();
        point_at(&base, "aaaa", "bbbb", "signed in").unwrap();
        assert_eq!(std::fs::read_to_string(base.join("libraries").join("bbbb").join(CARRY)).unwrap(), "signed in");
    }

    #[test]
    fn an_id_cannot_climb_out_of_the_folder() {
        let base = scratch();
        assert!(point_at(&base, "aaaa", "../../evil", "{}").is_err());
        assert!(!base.join(ACTIVE).exists());
        assert_eq!(subfolder(&Active { home: "a".into(), active: "../x".into() }), None);
    }

    #[test]
    fn a_damaged_pointer_opens_the_first_library() {
        let base = scratch();
        std::fs::write(base.join(ACTIVE), b"not json").unwrap();
        assert_eq!(folder(&base), base);
    }
}
