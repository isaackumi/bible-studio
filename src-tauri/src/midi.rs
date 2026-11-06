//! MIDI triggers: a pad, footswitch, keyboard or the band's software (through a virtual port such as
//! loopMIDI or the Mac's IAC bus) drives the desk. This side only lists the inputs and passes each
//! message on as `midi-message` (its bytes); which message does what is the desk's (domain/midi.ts),
//! learned from the device itself in Settings.
//!
//! The connection lives on its own thread for as long as it listens: what a connection may be shared
//! with differs between the platforms' MIDI systems, and a thread of its own needs none of that.

use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

const CLIENT: &str = "Church Studio";

/// The listening thread's stop signal, while one runs.
#[derive(Default)]
pub struct Midi(Mutex<Option<Sender<()>>>);

/// The MIDI inputs on this computer, by name.
#[tauri::command]
pub fn midi_inputs() -> Result<Vec<String>, String> {
    let input = midir::MidiInput::new(CLIENT).map_err(|e| e.to_string())?;
    Ok(input.ports().iter().filter_map(|port| input.port_name(port).ok()).collect())
}

/// Listen to the input with this name (any one listening before stops). Each message goes to the
/// desk as its bytes; system messages (clock, sensing) are left out.
#[tauri::command]
pub fn midi_listen(app: AppHandle, state: State<Midi>, name: String) -> Result<(), String> {
    stop(&state);
    let mut input = midir::MidiInput::new(CLIENT).map_err(|e| e.to_string())?;
    input.ignore(midir::Ignore::All);
    let port = input
        .ports()
        .into_iter()
        .find(|port| input.port_name(port).map(|found| found == name).unwrap_or(false))
        .ok_or_else(|| format!("{name} is not connected."))?;
    let (done, wait) = channel::<()>();
    let (ready, opened) = channel::<Result<(), String>>();
    std::thread::spawn(move || {
        let connection = input.connect(
            &port,
            "church-studio-desk",
            move |_stamp, bytes, _| {
                if bytes.first().map(|status| *status < 0xF0).unwrap_or(false) {
                    let _ = app.emit("midi-message", bytes.iter().take(3).copied().collect::<Vec<u8>>());
                }
            },
            (),
        );
        match connection {
            Ok(connection) => {
                let _ = ready.send(Ok(()));
                // Held open until stopped (or the app ends and the sender goes).
                let _ = wait.recv();
                connection.close();
            }
            Err(error) => {
                let _ = ready.send(Err(error.to_string()));
            }
        }
    });
    opened.recv().map_err(|e| e.to_string())??;
    *state.0.lock().unwrap_or_else(|poison| poison.into_inner()) = Some(done);
    log::info!("MIDI: listening to {name}");
    Ok(())
}

/// Stop listening.
#[tauri::command]
pub fn midi_stop(state: State<Midi>) {
    stop(&state);
}

fn stop(state: &State<Midi>) {
    if let Some(done) = state.0.lock().unwrap_or_else(|poison| poison.into_inner()).take() {
        let _ = done.send(());
    }
}
