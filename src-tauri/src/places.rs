// Where a church's pictures usually are: the Pictures folder and the Desktop, and cloud drives
// synced to this computer by their own apps (Google Drive for desktop, iCloud Drive, Dropbox,
// OneDrive). A synced drive is an ordinary folder here, so it opens like any other; files kept
// online only are fetched by the drive's app the first time they are shown.

use std::path::{Path, PathBuf};

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Place {
    pub name: String,
    pub path: String,
    /// pictures, desktop, google-drive, icloud, dropbox, onedrive: the icon and colour it gets.
    pub kind: &'static str,
}

/// A folder under ~/Library/CloudStorage (macOS) as a place: "GoogleDrive-name@example.com" is
/// Google Drive with its "My Drive" inside; "Dropbox", "OneDrive-Personal" and the like as they are.
pub fn cloud_storage_place(folder: &str, dir: &Path) -> Option<Place> {
    let (kind, label) = if let Some(account) = folder.strip_prefix("GoogleDrive-") {
        ("google-drive", format!("Google Drive ({account})"))
    } else if folder == "Dropbox" || folder.starts_with("Dropbox-") {
        ("dropbox", "Dropbox".to_string())
    } else {
        let account = folder.strip_prefix("OneDrive-")?;
        ("onedrive", format!("OneDrive ({account})"))
    };
    // Google Drive keeps the person's files in "My Drive" (the account folder also holds "Shared drives").
    let path = if kind == "google-drive" && dir.join("My Drive").is_dir() { dir.join("My Drive") } else { dir.to_path_buf() };
    Some(Place { name: label, path: path.to_string_lossy().to_string(), kind })
}

fn push_if_dir(places: &mut Vec<Place>, name: &str, path: PathBuf, kind: &'static str) {
    if path.is_dir() && !places.iter().any(|place| Path::new(&place.path) == path) {
        places.push(Place { name: name.to_string(), path: path.to_string_lossy().to_string(), kind });
    }
}

/// The places that exist on this computer, most useful first.
pub fn find(home: Option<PathBuf>, pictures: Option<PathBuf>, desktop: Option<PathBuf>) -> Vec<Place> {
    let mut places = Vec::new();
    if let Some(path) = pictures {
        push_if_dir(&mut places, "Pictures", path, "pictures");
    }
    if let Some(path) = desktop {
        push_if_dir(&mut places, "Desktop", path, "desktop");
    }
    let Some(home) = home else { return places };

    // macOS: drives synced through the system's File Provider.
    if let Ok(entries) = std::fs::read_dir(home.join("Library/CloudStorage")) {
        let mut found: Vec<Place> = entries
            .flatten()
            .filter_map(|entry| cloud_storage_place(&entry.file_name().to_string_lossy(), &entry.path()))
            .collect();
        found.sort_by(|a, b| a.name.cmp(&b.name));
        for place in found {
            push_if_dir(&mut places, &place.name, PathBuf::from(&place.path), place.kind);
        }
    }
    push_if_dir(&mut places, "iCloud Drive", home.join("Library/Mobile Documents/com~apple~CloudDocs"), "icloud");

    // Windows and Linux: the drives' usual folders in the home folder.
    push_if_dir(&mut places, "Dropbox", home.join("Dropbox"), "dropbox");
    push_if_dir(&mut places, "OneDrive", home.join("OneDrive"), "onedrive");
    push_if_dir(&mut places, "iCloud Drive", home.join("iCloudDrive"), "icloud");
    push_if_dir(&mut places, "Google Drive", home.join("Google Drive"), "google-drive");

    // Windows: Google Drive for desktop appears as its own drive letter (G: by default) with "My Drive".
    #[cfg(target_os = "windows")]
    for letter in b'D'..=b'Z' {
        let drive = PathBuf::from(format!("{}:\\My Drive", letter as char));
        push_if_dir(&mut places, &format!("Google Drive ({}:)", letter as char), drive, "google-drive");
    }
    places
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_cloud_drives_from_their_macos_folders() {
        let dir = std::env::temp_dir().join(format!("cs-places-{}", std::process::id()));
        let drive = dir.join("GoogleDrive-pastor@example.com");
        std::fs::create_dir_all(drive.join("My Drive")).unwrap();
        let google = cloud_storage_place("GoogleDrive-pastor@example.com", &drive).unwrap();
        assert_eq!(google.kind, "google-drive");
        assert_eq!(google.name, "Google Drive (pastor@example.com)");
        assert!(google.path.ends_with("My Drive"));
        assert_eq!(cloud_storage_place("Dropbox", &dir).unwrap().kind, "dropbox");
        assert_eq!(cloud_storage_place("OneDrive-Personal", &dir).unwrap().name, "OneDrive (Personal)");
        assert!(cloud_storage_place("Box", &dir).is_none());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn lists_only_places_that_exist_once_each() {
        let home = std::env::temp_dir().join(format!("cs-home-{}", std::process::id()));
        std::fs::create_dir_all(home.join("Pictures")).unwrap();
        std::fs::create_dir_all(home.join("Dropbox")).unwrap();
        let places = find(Some(home.clone()), Some(home.join("Pictures")), Some(home.join("Desktop")));
        let kinds: Vec<&str> = places.iter().map(|place| place.kind).collect();
        assert_eq!(kinds, vec!["pictures", "dropbox"]);
        let _ = std::fs::remove_dir_all(home);
    }
}
