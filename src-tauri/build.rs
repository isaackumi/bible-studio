fn main() {
    #[cfg(target_os = "macos")]
    {
        let plist = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("Info.plist");
        println!("cargo:rerun-if-changed={}", plist.display());
        println!(
            "cargo:rustc-link-arg=-Wl,-sectcreate,__TEXT,__info_plist,{}",
            plist.display()
        );
    }
    tauri_build::build()
}
