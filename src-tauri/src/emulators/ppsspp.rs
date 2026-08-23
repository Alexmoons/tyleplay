use std::path::Path;
use std::process::Command;
use super::{normalize_for_match, parse_cmd_arguments, EmuGameInfo, EmulatorHandler, ProcessInfo};

pub struct PpssppHandler;

impl EmulatorHandler for PpssppHandler {
    fn name(&self) -> &'static str {
        "PPSSPP"
    }

    fn matches(&self, proc_exe_lower: &str, emu_exe_lower: &str) -> bool {
        proc_exe_lower.contains("ppsspp")
            && (emu_exe_lower.contains("ppsspp") || emu_exe_lower.is_empty())
    }

    fn is_idle_window(&self, title: &str) -> bool {
        let t = title.trim().to_lowercase();
        if t == "ppsspp" {
            return true;
        }
        if t.starts_with("ppsspp") {
            let is_game_window = (t.contains(" - ")
                && !t.contains("game list")
                && !t.contains("settings")
                && !t.contains("recent"))
                || t.contains(" | ")
                || t.contains("fps")
                || t.contains("speed:")
                || t.contains("vps");
            return !is_game_window;
        }
        false
    }

    fn is_game_active(&self, process: &ProcessInfo, emu: &EmuGameInfo) -> bool {
        // If all windows are idle windows, definitely not an active game
        if !process.window_titles.is_empty() && process.window_titles.iter().all(|t| self.is_idle_window(t)) {
            return false;
        }

        // 1. Check window titles for game name or rom stem
        let norm_game_name = normalize_for_match(emu.game_name);
        let rom_stem = Path::new(emu.rom_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        let norm_rom_stem = normalize_for_match(rom_stem);

        let title_matches = process.window_titles.iter().any(|title| {
            if self.is_idle_window(title) {
                return false;
            }
            let norm_title = normalize_for_match(title);
            (!norm_game_name.is_empty() && norm_title.contains(&norm_game_name))
                || (!norm_rom_stem.is_empty() && norm_title.contains(&norm_rom_stem))
        });

        if title_matches {
            return true;
        }

        // 2. Check command line arguments for rom path / rom file name
        let cmd_matches = process.cmd_args.iter().any(|arg| {
            let norm_arg = arg.to_lowercase().replace('\\', "/");
            norm_arg.contains(emu.rom_path)
                || (!emu.rom_file_name.is_empty() && norm_arg.contains(emu.rom_file_name))
        });

        if cmd_matches {
            let has_active_window = process.window_titles.iter().any(|t| !self.is_idle_window(t));
            if has_active_window || process.window_titles.is_empty() {
                return true;
            }
        }

        // 3. Check active gameplay render indicators
        let is_rendering_gameplay = process.window_titles.iter().any(|title| {
            if self.is_idle_window(title) {
                return false;
            }
            let t_lower = title.to_lowercase();
            t_lower.contains("fps")
                || t_lower.contains("vps")
                || t_lower.contains("speed:")
                || t_lower.contains("hz")
        });

        if is_rendering_gameplay {
            return true;
        }

        false
    }

    fn prepare_launch_command(&self, cmd: &mut Command, rom_path: &str, user_args: &str) {
        let template = user_args.trim();

        if template.is_empty() {
            cmd.arg("--fullscreen");
            cmd.arg("--pause-menu-exit");
            cmd.arg(rom_path);
        } else if template.contains("{rom_path}") {
            let replaced = template.replace("{rom_path}", rom_path);
            let parsed_args = parse_cmd_arguments(&replaced);
            cmd.args(parsed_args);
        } else {
            let parsed_args = parse_cmd_arguments(template);
            cmd.args(&parsed_args);
            cmd.arg(rom_path);
        }
    }

    fn configure_file_dialog(&self, dialog: rfd::FileDialog) -> rfd::FileDialog {
        dialog
            .add_filter(
                "Supported PSP Games / UMD Images",
                &["iso", "cso", "chd", "pbp", "elf", "prx", "zip"],
            )
            .add_filter("ISO Disc Images (.iso)", &["iso"])
            .add_filter("Compressed Images (.cso / .chd)", &["cso", "chd"])
            .add_filter("PSP Eboot (.pbp)", &["pbp"])
            .add_filter("Homebrew Executables (.elf / .prx)", &["elf", "prx"])
            .add_filter("All Files", &["*"])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ppsspp_matches() {
        let handler = PpssppHandler;
        assert_eq!(handler.name(), "PPSSPP");
        assert!(handler.matches("ppssppwindows64.exe", "ppssppwindows64.exe"));
        assert!(handler.matches("ppsspp.exe", ""));
    }

    #[test]
    fn test_ppsspp_idle_and_active_detection() {
        let handler = PpssppHandler;
        assert!(handler.is_idle_window("PPSSPP"));
        assert!(handler.is_idle_window("PPSSPP v1.18.1"));
        assert!(!handler.is_idle_window("PPSSPP v1.18.1 - Crisis Core [ULUS10336]"));
    }
}

