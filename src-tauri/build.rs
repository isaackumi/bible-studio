fn main() {
    #[cfg(target_os = "macos")]
    {
        build_helper(Helper {
            name: "church-studio-transcribe",
            source: "transcribe/main.swift",
            plist: "transcribe/Info.plist",
            header: None,
            frameworks: &["Speech", "AVFoundation", "Foundation"],
        });
        build_helper(Helper {
            name: "church-studio-ndi",
            source: "ndi/main.swift",
            plist: "ndi/Info.plist",
            header: Some("ndi/ndi_shim.h"),
            frameworks: &["ScreenCaptureKit", "CoreMedia", "AVFoundation", "Foundation"],
        });
    }
    tauri_build::build()
}

/// A Swift helper that ships beside the app: the on-device transcriber, the NDI sender.
#[cfg(target_os = "macos")]
struct Helper {
    name: &'static str,
    source: &'static str,
    plist: &'static str,
    header: Option<&'static str>,
    frameworks: &'static [&'static str],
}

/// Build a helper for both Apple silicon and Intel (one universal file, macOS 13 and later),
/// then put it where each use finds it:
/// - `binaries/<name>-<triple>` for every Mac triple, which Tauri bundles into
///   Contents/MacOS (tauri.macos.conf.json `externalBin`), including universal release builds;
/// - beside the app binary in target/<profile>, for `tauri dev`.
#[cfg(target_os = "macos")]
fn build_helper(helper: Helper) {
    let manifest = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let source = manifest.join(helper.source);
    let plist = manifest.join(helper.plist);
    println!("cargo:rerun-if-changed={}", source.display());
    println!("cargo:rerun-if-changed={}", plist.display());
    if let Some(header) = helper.header {
        println!("cargo:rerun-if-changed={}", manifest.join(header).display());
    }
    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let mut slices = Vec::new();
    for arch in ["arm64", "x86_64"] {
        let slice = out.join(format!("{}-{arch}", helper.name));
        let mut command = std::process::Command::new("swiftc");
        command.args(["-target", &format!("{arch}-apple-macos13.0"), "-parse-as-library", "-O"]);
        if let Some(header) = helper.header {
            command.arg("-import-objc-header").arg(manifest.join(header));
        }
        for framework in helper.frameworks {
            command.args(["-framework", framework]);
        }
        let status = command
            .args(["-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__info_plist", "-Xlinker"])
            .arg(&plist)
            .arg("-o")
            .arg(&slice)
            .arg(&source)
            .status()
            .expect("run swiftc");
        if !status.success() {
            panic!("swiftc failed to build {} for {arch}", helper.name);
        }
        slices.push(slice);
    }
    let universal = out.join(helper.name);
    let status = std::process::Command::new("lipo")
        .arg("-create")
        .args(&slices)
        .arg("-output")
        .arg(&universal)
        .status()
        .expect("run lipo");
    if !status.success() {
        panic!("lipo failed to join {}", helper.name);
    }

    let binaries = manifest.join("binaries");
    std::fs::create_dir_all(&binaries).expect("create src-tauri/binaries");
    for triple in ["aarch64-apple-darwin", "x86_64-apple-darwin", "universal-apple-darwin"] {
        std::fs::copy(&universal, binaries.join(format!("{}-{triple}", helper.name))).expect("copy the helper for bundling");
    }
    let target = std::env::var_os("CARGO_TARGET_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| manifest.join("target"));
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let dest_dir = target.join(profile);
    std::fs::create_dir_all(&dest_dir).expect("create the helper output folder");
    std::fs::copy(&universal, dest_dir.join(helper.name)).expect("copy the helper beside the app");
}
