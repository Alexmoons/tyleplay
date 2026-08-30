pub mod duckstation;
pub mod epsxe;
pub mod pcsx2;
pub mod ppsspp;
pub mod rpcs3;
pub mod yuzu;


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
    /// Identifier name of the emulator (e.g. "PCSX2", "DuckStation", "ePSXe", "PPSSPP", "RPCS3")
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
        &rpcs3::Rpcs3Handler,
        &yuzu::YuzuHandler,
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

pub fn validate_rom_for_emulator(emu_name: &str, rom_path: &str) -> Result<(), String> {
    let trimmed = rom_path.trim().trim_matches('"');
    if trimmed.is_empty() {
        return Err("ROM path is required for emulator game".to_string());
    }

    let p = std::path::Path::new(trimmed);
    let lower_emu = emu_name.trim().to_lowercase();
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    if ext == "exe" {
        return Err(format!(
            "{} does not support Windows .exe files. Please select a valid game ROM file or disc image.",
            if emu_name.trim().is_empty() { "Emulator" } else { emu_name.trim() }
        ));
    }

    if lower_emu.contains("rpcs3") || lower_emu.contains("playstation 3") || lower_emu.contains("ps3") {
        let ps3_res = rpcs3::inspect_ps3_path(trimmed);
        if !ps3_res.is_valid {
            if ps3_res.status == "pkg_installer" {
                return Err("Selected file is a .pkg package installer. Please install it in RPCS3 first, then select its installed game folder or EBOOT.BIN.".to_string());
            }
            if p.is_dir() {
                return Err("Invalid PS3 game folder. It must contain EBOOT.BIN or PARAM.SFO (e.g. inside PS3_GAME/USRDIR).".to_string());
            }
            return Err("Invalid ROM format for RPCS3. Supported formats: decrypted .iso, or PS3 game folder containing EBOOT.BIN.".to_string());
        }
        return Ok(());
    }

    if p.is_dir() {
        return Err(format!(
            "{} requires a ROM file, not a directory.",
            if emu_name.trim().is_empty() { "Emulator" } else { emu_name.trim() }
        ));
    }

    if lower_emu.contains("pcsx2") || lower_emu.contains("playstation 2") || lower_emu.contains("ps2") {
        let valid = ["bin", "iso", "cue", "mdf", "chd", "cso", "zso", "gz", "elf", "irx", "gs", "dump"];
        if !valid.contains(&ext.as_str()) {
            return Err("Invalid ROM format for PCSX2. Supported formats: .iso, .chd, .bin, .cue, .cso, .zso, .gz, .mdf.".to_string());
        }
        return Ok(());
    }

    if lower_emu.contains("duckstation") || lower_emu.contains("epsxe") || lower_emu.contains("playstation 1") || lower_emu.contains("ps1") || lower_emu.contains("psx") {
        let valid = ["cue", "chd", "iso", "bin", "img", "mdf", "pbp", "cso", "zso", "ecm"];
        if !valid.contains(&ext.as_str()) {
            return Err(format!("Invalid ROM format for {}. Supported formats: .cue, .chd, .iso, .bin, .img, .mdf, .pbp, .cso, .zso, .ecm.", if emu_name.trim().is_empty() { "PS1 emulator" } else { emu_name.trim() }));
        }
        return Ok(());
    }

    if lower_emu.contains("ppsspp") || lower_emu.contains("psp") {
        let valid = ["iso", "cso", "chd", "pbp", "elf", "prx", "zip"];
        if !valid.contains(&ext.as_str()) {
            return Err("Invalid ROM format for PPSSPP. Supported formats: .iso, .cso, .chd, .pbp, .elf, .prx, .zip.".to_string());
        }
        return Ok(());
    }

    if lower_emu.contains("yuzu") || lower_emu.contains("switch") || lower_emu.contains("nintendo switch") {
        let valid = ["nso", "nro", "nca", "xci", "nsp", "kip", "main", "pfs0", "zip", "7z"];
        let file_stem_or_name = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !valid.contains(&ext.as_str()) && file_stem_or_name != "main" {
            return Err("Invalid ROM format for Yuzu. Supported formats: .nso, .nro, .nca, .xci, .nsp, .kip, main, .pfs0, .zip, .7z.".to_string());
        }
        return Ok(());
    }

    let invalid_exts = ["exe", "dll", "msi", "bat", "cmd", "ps1", "vbs", "sys", "com"];
    if invalid_exts.contains(&ext.as_str()) {
        return Err(format!("Invalid file format (.{}) for emulator. Please select a valid game ROM file.", ext));
    }

    Ok(())
}

