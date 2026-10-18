fn main() {
    #[cfg(target_os = "macos")]
    {
        compile_transcriber();
        compile_ndi_sender();
    }
    tauri_build::build()
}

/// The NDI sender helper: captures the audience window and sends it over NDI. The NDI library is
/// loaded at run time, so building needs only the small header in ndi/.
#[cfg(target_os = "macos")]
fn compile_ndi_sender() {
    let manifest = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let source = manifest.join("ndi/main.swift");
    let header = manifest.join("ndi/ndi_shim.h");
    let plist = manifest.join("ndi/Info.plist");
    for path in [&source, &header, &plist] {
        println!("cargo:rerun-if-changed={}", path.display());
    }
    let target = std::env::var_os("CARGO_TARGET_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| manifest.join("target"));
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let dest_dir = target.join(profile);
    std::fs::create_dir_all(&dest_dir).expect("create the NDI helper output folder");
    let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("x86_64") => "x86_64",
        _ => "arm64",
    };
    let status = std::process::Command::new("swiftc")
        .args(["-target", &format!("{arch}-apple-macos13.0"), "-parse-as-library", "-O"])
        .arg("-import-objc-header")
        .arg(&header)
        .args(["-framework", "ScreenCaptureKit", "-framework", "CoreMedia", "-framework", "AVFoundation", "-framework", "Foundation"])
        .args(["-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__info_plist", "-Xlinker"])
        .arg(&plist)
        .arg("-o")
        .arg(dest_dir.join("church-studio-ndi"))
        .arg(&source)
        .status()
        .expect("run swiftc");
    if !status.success() {
        panic!("swiftc failed to build the NDI sender");
    }
}

#[cfg(target_os = "macos")]
fn compile_transcriber() {
    let manifest = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let source = manifest.join("transcribe/main.swift");
    let plist = manifest.join("transcribe/Info.plist");
    println!("cargo:rerun-if-changed={}", source.display());
    println!("cargo:rerun-if-changed={}", plist.display());
    let target = std::env::var_os("CARGO_TARGET_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| manifest.join("target"));
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let dest_dir = target.join(profile);
    std::fs::create_dir_all(&dest_dir).expect("create the transcriber output folder");
    let dest = dest_dir.join("church-studio-transcribe");
    // Build for macOS 13 and later, so older church Macs run it (SpeechAnalyzer is used only on 26+).
    let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("x86_64") => "x86_64",
        _ => "arm64",
    };
    let status = std::process::Command::new("swiftc")
        .arg("-target")
        .arg(format!("{arch}-apple-macos13.0"))
        .arg("-parse-as-library")
        .arg("-O")
        .arg("-framework")
        .arg("Speech")
        .arg("-framework")
        .arg("AVFoundation")
        .arg("-framework")
        .arg("Foundation")
        .arg("-Xlinker")
        .arg("-sectcreate")
        .arg("-Xlinker")
        .arg("__TEXT")
        .arg("-Xlinker")
        .arg("__info_plist")
        .arg("-Xlinker")
        .arg(&plist)
        .arg("-o")
        .arg(&dest)
        .arg(&source)
        .status()
        .expect("run swiftc");
    if !status.success() {
        panic!("swiftc failed to build the on-device transcriber");
    }
}
