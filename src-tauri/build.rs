fn main() {
    #[cfg(target_os = "macos")]
    compile_transcriber();
    tauri_build::build()
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
    let status = std::process::Command::new("swiftc")
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
