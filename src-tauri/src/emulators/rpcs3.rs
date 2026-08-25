use std::path::{Path, PathBuf};
use std::process::Command;
use super::{normalize_for_match, parse_cmd_arguments, EmuGameInfo, EmulatorHandler, ProcessInfo};

pub struct Rpcs3Handler;

impl EmulatorHandler for Rpcs3Handler {
    fn name(&self) -> &'static str {
        "RPCS3"
    }

    fn matches(&self, proc_exe_lower: &str, emu_exe_lower: &str) -> bool {
        proc_exe_lower.contains("rpcs3")
            && (emu_exe_lower.contains("rpcs3") || emu_exe_lower.is_empty())
    }

    fn is_idle_window(&self, title: &str) -> bool {
        let t = title.trim().to_lowercase();
        if t == "rpcs3" {
            return true;
        }

        // Error, Fatal Error, Alert popups or updater dialogs
        if t.contains("fatal error")
            || t.contains("error")
            || t.contains("warning")
            || t.contains("crash")
            || t.contains("compiling shaders")
            || t.contains("loading...")
            || t.contains("updating...")
        {
            return true;
        }

        if t.starts_with("rpcs3") {
            let is_game_window = (t.contains(" | ")
                && (t.contains("fps") || t.contains("vps") || t.contains("bles") || t.contains("blus") || t.contains("npub") || t.contains("npeb") || t.contains("bcjp") || t.contains("bcra") || t.contains("bcus") || t.contains("bces")))
                || t.contains("fps:")
                || t.contains("vps:")
                || t.contains("speed:");
            return !is_game_window;
        }
        false
    }

    fn is_game_active(&self, process: &ProcessInfo, emu: &EmuGameInfo) -> bool {
        // If there is any fatal error popup, emulation is stopped
        let has_fatal_error = process.window_titles.iter().any(|t| {
            let lower = t.to_lowercase();
            lower.contains("fatal error") || lower.contains("rpcs3: error")
        });
        if has_fatal_error {
            return false;
        }

        // If all windows are idle or error windows, definitely not an active game
        if !process.window_titles.is_empty() && process.window_titles.iter().all(|t| self.is_idle_window(t)) {
            return false;
        }

        let norm_game_name = normalize_for_match(emu.game_name);
        let extracted_id = extract_ps3_title_id(emu.rom_path).or_else(|| extract_ps3_title_id(emu.game_name));

        // 1. Check window titles for game name or specific Title ID
        let title_matches = process.window_titles.iter().any(|title| {
            if self.is_idle_window(title) {
                return false;
            }
            let norm_title = normalize_for_match(title);
            if !norm_game_name.is_empty() && norm_title.contains(&norm_game_name) {
                return true;
            }
            if let Some(ref id) = extracted_id {
                let norm_id = normalize_for_match(id);
                if !norm_id.is_empty() && norm_title.contains(&norm_id) {
                    return true;
                }
            }
            false
        });

        if title_matches {
            return true;
        }

        // 2. Check command line arguments strictly for full ROM path or non-generic ROM file name,
        // BUT ONLY IF there is an actual non-idle rendering game window open
        let has_active_game_window = process.window_titles.iter().any(|t| !self.is_idle_window(t));
        if !has_active_game_window {
            return false;
        }

        let norm_rom = emu.rom_path.to_lowercase().replace('\\', "/");
        let norm_file = emu.rom_file_name.to_lowercase();
        let is_generic_file = norm_file == "eboot.bin" || norm_file == "param.sfo" || norm_file.is_empty();

        let cmd_matches = process.cmd_args.iter().any(|arg| {
            let norm_arg = arg.to_lowercase().replace('\\', "/");
            if !norm_rom.is_empty() && norm_arg.contains(&norm_rom) {
                return true;
            }
            if !is_generic_file && norm_arg.ends_with(&norm_file) {
                return true;
            }
            false
        });

        cmd_matches
    }

    fn prepare_launch_command(&self, cmd: &mut Command, rom_path: &str, user_args: &str) {
        let actual_target = resolve_rpcs3_boot_target(rom_path);
        let template = user_args.trim();

        if template.is_empty() {
            cmd.arg("--no-gui");
            cmd.arg(&actual_target);
        } else if template.contains("{rom_path}") {
            let replaced = template.replace("{rom_path}", &actual_target);
            let parsed_args = parse_cmd_arguments(&replaced);
            cmd.args(parsed_args);
        } else {
            let parsed_args = parse_cmd_arguments(template);
            cmd.args(&parsed_args);
            cmd.arg(&actual_target);
        }
    }

    fn configure_file_dialog(&self, dialog: rfd::FileDialog) -> rfd::FileDialog {
        dialog
            .add_filter("Decrypted PS3 Disc Images (.iso)", &["iso"])
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct Ps3RomDetectionResult {
    pub is_valid: bool,
    pub status: String,
    pub message: String,
    pub detected_file: Option<String>,
}

pub fn resolve_rpcs3_boot_target(path_str: &str) -> String {
    let trimmed = path_str.trim().trim_matches('"');
    let restored = crate::restore_windows_path_case(trimmed);
    let path = Path::new(&restored);
    if !path.exists() {
        return restored;
    }

    if path.is_file() {
        return restored;
    }

    if path.is_dir() {
        if let Some(target) = find_bootable_ps3_target(path, 0) {
            return crate::restore_windows_path_case(&target.to_string_lossy());
        }
    }

    restored
}

fn find_bootable_ps3_target(dir: &Path, depth: usize) -> Option<PathBuf> {
    if depth > 4 {
        return None;
    }

    // Direct game structures (highest priority)
    let candidates = [
        dir.join("PS3_GAME").join("USRDIR").join("EBOOT.BIN"),
        dir.join("PS3_GAME").join("USRDIR").join("eboot.bin"),
        dir.join("USRDIR").join("EBOOT.BIN"),
        dir.join("USRDIR").join("eboot.bin"),
        dir.join("EBOOT.BIN"),
        dir.join("eboot.bin"),
    ];
    for cand in &candidates {
        if cand.exists() && cand.is_file() {
            return Some(cand.clone());
        }
    }

    // Direct directory search
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut subdirs = Vec::new();
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name == "eboot.bin" {
                    return Some(p);
                }
                if name.ends_with(".iso") {
                    return Some(p);
                }
            } else if p.is_dir() {
                subdirs.push(p);
            }
        }

        for subdir in subdirs {
            if let Some(found) = find_bootable_ps3_target(&subdir, depth + 1) {
                return Some(found);
            }
        }
    }

    None
}

pub fn extract_ps3_title_id(text: &str) -> Option<String> {
    let upper = text.to_uppercase();
    let chars: Vec<char> = upper.chars().collect();
    if chars.len() < 9 {
        return None;
    }
    for i in 0..=(chars.len() - 9) {
        let prefix: String = chars[i..i + 4].iter().collect();
        let suffix: String = chars[i + 4..i + 9].iter().collect();
        let is_valid_prefix = prefix.chars().all(|c| c.is_ascii_alphabetic());
        let is_valid_suffix = suffix.chars().all(|c| c.is_ascii_digit());
        if is_valid_prefix && is_valid_suffix {
            let p_str = prefix.as_str();
            if p_str.starts_with("BL") || p_str.starts_with("BC") || p_str.starts_with("NP") || p_str.starts_with("MR") {
                return Some(format!("{}{}", prefix, suffix));
            }
        }
    }
    None
}

pub fn inspect_ps3_path(path_str: &str) -> Ps3RomDetectionResult {
    let trimmed = path_str.trim();
    if trimmed.is_empty() {
        return Ps3RomDetectionResult {
            is_valid: false,
            status: "empty".to_string(),
            message: String::new(),
            detected_file: None,
        };
    }

    let path = Path::new(trimmed);
    if !path.exists() {
        return Ps3RomDetectionResult {
            is_valid: false,
            status: "not_found".to_string(),
            message: "File or folder does not exist on disk".to_string(),
            detected_file: None,
        };
    }

    if path.is_file() {
        let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        let file_name_lower = file_name.to_lowercase();

        if file_name_lower == "eboot.bin" {
            return Ps3RomDetectionResult {
                is_valid: true,
                status: "eboot_found".to_string(),
                message: "EBOOT.BIN executable detected (Ready to boot)".to_string(),
                detected_file: Some(file_name.to_string()),
            };
        }
        if file_name_lower.ends_with(".iso") {
            return Ps3RomDetectionResult {
                is_valid: true,
                status: "iso_found".to_string(),
                message: "PS3 ISO image selected (Make sure the ISO is decrypted)".to_string(),
                detected_file: Some(file_name.to_string()),
            };
        }
        if file_name_lower.ends_with(".pkg") {
            return Ps3RomDetectionResult {
                is_valid: false,
                status: "pkg_installer".to_string(),
                message: "Selected file is a .pkg package installer. Please install it in RPCS3 first, then select its game folder or EBOOT.BIN.".to_string(),
                detected_file: Some(file_name.to_string()),
            };
        }
        if file_name_lower == "param.sfo" || file_name_lower.ends_with(".sfo") {
            return Ps3RomDetectionResult {
                is_valid: true,
                status: "sfo_found".to_string(),
                message: "PARAM.SFO game header detected (Ready to boot)".to_string(),
                detected_file: Some(file_name.to_string()),
            };
        }
        if file_name_lower.ends_with(".bin") || file_name_lower.ends_with(".elf") {
            return Ps3RomDetectionResult {
                is_valid: true,
                status: "eboot_found".to_string(),
                message: format!("PS3 binary ({}) detected", file_name),
                detected_file: Some(file_name.to_string()),
            };
        }

        return Ps3RomDetectionResult {
            is_valid: false,
            status: "no_boot_file".to_string(),
            message: format!("File ({}) is not a recognized PS3 boot format", file_name),
            detected_file: None,
        };
    }

    if path.is_dir() {
        if let Some(target) = find_bootable_ps3_target(path, 0) {
            let rel = target.strip_prefix(path).unwrap_or(&target);
            let rel_str = rel.to_string_lossy().to_string();
            let is_iso = target.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) == Some("iso".to_string());
            
            return Ps3RomDetectionResult {
                is_valid: true,
                status: if is_iso { "iso_found".to_string() } else { "eboot_found".to_string() },
                message: if is_iso {
                    format!("ISO image detected ({})", rel_str)
                } else {
                    format!("EBOOT.BIN detected ({})", rel_str)
                },
                detected_file: Some(target.to_string_lossy().to_string()),
            };
        }

        return Ps3RomDetectionResult {
            is_valid: false,
            status: "no_boot_file".to_string(),
            message: "No EBOOT.BIN or bootable file found in folder".to_string(),
            detected_file: None,
        };
    }

    Ps3RomDetectionResult {
        is_valid: false,
        status: "unknown".to_string(),
        message: "Invalid target path".to_string(),
        detected_file: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rpcs3_matches() {
        let handler = Rpcs3Handler;
        assert_eq!(handler.name(), "RPCS3");
        assert!(handler.matches("rpcs3.exe", "rpcs3.exe"));
        assert!(handler.matches("rpcs3.exe", ""));
    }

    #[test]
    fn test_rpcs3_idle_and_active_detection() {
        let handler = Rpcs3Handler;
        assert!(handler.is_idle_window("RPCS3"));
        assert!(handler.is_idle_window("RPCS3 v0.0.32-16624-a3f3b9c8 Alpha | master"));
        assert!(!handler.is_idle_window("Demon's Souls [BLES00932] | RPCS3 v0.0.32 | FPS: 59.94"));

        let process = ProcessInfo {
            exe_name: "rpcs3.exe",
            exe_path: "D:\\Game\\Emulator\\PS3\\rpcs3.exe",
            cmd_args: &[],
            window_titles: &["FPS: 39.99 | Vulkan | 0.0.40-19032 | ASURA'S WRATH [BLUS30721]".to_string()],
        };

        let asura_emu = EmuGameInfo {
            game_name: "Asura's Wrath",
            rom_path: "d:\\game\\emulator\\ps3\\game\\asura's wrath [blus30721]",
            rom_file_name: "asura's wrath [blus30721]",
            emulator_exe_name: "rpcs3.exe",
            emulator_exe_path: "d:\\game\\emulator\\ps3\\rpcs3.exe",
        };

        let pvz_emu = EmuGameInfo {
            game_name: "Plants vs. Zombies",
            rom_path: "d:\\game\\emulator\\ps3\\game\\plants vs zombie\\plants vs. zombies (usa).iso",
            rom_file_name: "plants vs. zombies (usa).iso",
            emulator_exe_name: "rpcs3.exe",
            emulator_exe_path: "d:\\game\\emulator\\ps3\\rpcs3.exe",
        };

        assert!(handler.is_game_active(&process, &asura_emu));
        assert!(!handler.is_game_active(&process, &pvz_emu));

        let error_process = ProcessInfo {
            exe_name: "rpcs3.exe",
            exe_path: "D:\\Game\\Emulator\\PS3\\rpcs3.exe",
            cmd_args: &["--no-gui".to_string(), "D:\\Games\\EBOOT.BIN".to_string()],
            window_titles: &["RPCS3: Fatal Error".to_string()],
        };
        assert!(!handler.is_game_active(&error_process, &asura_emu));
    }

    #[test]
    fn test_extract_ps3_title_id() {
        assert_eq!(extract_ps3_title_id("Asura's Wrath [BLUS30721]"), Some("BLUS30721".to_string()));
        assert_eq!(extract_ps3_title_id("D:\\Games\\BLES01524\\PS3_GAME"), Some("BLES01524".to_string()));
        assert_eq!(extract_ps3_title_id("Random Name"), None);
    }

    #[test]
    fn test_inspect_ps3_path_empty() {
        let res = inspect_ps3_path("");
        assert!(!res.is_valid);
        assert_eq!(res.status, "empty");
    }
}
