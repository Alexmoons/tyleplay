pub mod duckstation;
pub mod epsxe;
pub mod pcsx2;
pub mod ppsspp;

use std::process::Command;

pub struct ProcessInfo<'a> {
    pub exe_name: &'a str,
    pub exe_path: &'a str,
    pub cmd_args: &'a [String],
    pub window_titles: &'a [String],
}

pub struct EmuGameInfo<'a> {
    pub game_name: &'a str,
    pub rom_path: &'a str,
    pub rom_file_name: &'a str,
    pub emulator_exe_name: &'a str,
    pub emulator_exe_path: &'a str,
}

pub trait EmulatorHandler: Send + Sync {
    /// Identifier name of the emulator (e.g. "PCSX2", "DuckStation", "ePSXe", "PPSSPP")
    fn name(&self) -> &'static str;

    /// Checks if a running process executable or emulator profile matches this handler
    fn matches(&self, proc_exe_lower: &str, emu_exe_lower: &str) -> bool;

    /// Checks if a window title belongs to the idle emulator menu/launcher
    fn is_idle_window(&self, title: &str) -> bool;

    /// Determines if a game is currently being actively played on this emulator
    fn is_game_active(&self, process: &ProcessInfo, emu: &EmuGameInfo) -> bool;

    /// Prepares command line arguments for launching a game with this emulator
    fn prepare_launch_command(&self, cmd: &mut Command, rom_path: &str, user_args: &str);

    /// Configures the file picker dialog with supported ROM extensions
    fn configure_file_dialog(&self, dialog: rfd::FileDialog) -> rfd::FileDialog;
}

pub fn get_all_handlers() -> &'static [&'static dyn EmulatorHandler] {
    &[
        &pcsx2::Pcsx2Handler,
        &duckstation::DuckstationHandler,
        &epsxe::EpsxeHandler,
        &ppsspp::PpssppHandler,
    ]
}

pub fn find_handler(name_or_exe: &str) -> Option<&'static dyn EmulatorHandler> {
    let lower = name_or_exe.trim().to_lowercase();
    get_all_handlers()
        .iter()
        .copied()
        .find(|h| h.matches(&lower, &lower) || lower.contains(&h.name().to_lowercase()))
}

pub fn is_any_idle_window(title: &str) -> bool {
    get_all_handlers().iter().any(|h| h.is_idle_window(title))
}

pub fn configure_dialog_for_emulator(emu_name: &str, dialog: rfd::FileDialog) -> rfd::FileDialog {
    let lower = emu_name.trim().to_lowercase();
    for handler in get_all_handlers() {
        if handler.matches(&lower, &lower) || lower.contains(&handler.name().to_lowercase()) {
            return handler.configure_file_dialog(dialog);
        }
    }

    // Default universal ROM filter
    dialog
        .add_filter(
            "Game ROM / Disc Image",
            &[
                "iso", "chd", "bin", "cue", "cso", "zso", "gz", "mdf", "nrg", "img", "dump",
                "nsp", "xci", "sfc", "smc", "nes", "gba", "gbc", "gb", "nds", "3ds", "rvz",
                "wbfs", "gcm", "z64", "n64", "ps3", "pkg", "zip", "7z", "rar", "elf", "pbp",
                "wad", "wux", "wud", "m3u",
            ],
        )
        .add_filter("All Files", &["*"])
}

pub fn parse_cmd_arguments(args_str: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut quote_char = '"';

    for ch in args_str.chars() {
        match ch {
            '"' | '\'' if !in_quotes => {
                in_quotes = true;
                quote_char = ch;
            }
            c if in_quotes && c == quote_char => {
                in_quotes = false;
            }
            ' ' | '\t' if !in_quotes => {
                if !current.is_empty() {
                    args.push(current);
                    current = String::new();
                }
            }
            c => current.push(c),
        }
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

pub fn normalize_for_match(title: &str) -> String {
    title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
