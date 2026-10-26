# transcribe-rs 0.3.12, vendored

From https://github.com/cjpais/transcribe-rs (MIT, see LICENSE), used for Parakeet listening.

Changes from the published crate:

- `src/onnx/session.rs`: `set_thread_limit`, so listening never takes every processor core from the
  output window on the same computer.
- `Cargo.toml`: ONNX Runtime bindings pinned to `=2.0.0-rc.12` (later releases changed their API);
  example, test and bench targets removed (their files are not copied).

Drop this folder and the `[patch.crates-io]` entry once the crate offers a thread setting itself.
