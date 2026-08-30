use std::path::Path;
use std::process::Command;
use super::{normalize_for_match, parse_cmd_arguments, EmuGameInfo, EmulatorHandler, ProcessInfo};

pub struct YuzuHandler;

impl EmulatorHandler for YuzuHandler {
    fn name(&self) -> &'static str {
        "Yuzu"
    }

    fn matches(&self, proc_exe_lower: &str, emu_exe_lower: &str) -> bool {
        proc_exe_lower.contains("yuzu")
            && (emu_exe_lower.contains("yuzu") || emu_exe_lower.is_empty())
    }

    fn is_idle_window(&self, title: &str) -> bool {
        let t = title.trim().to_lowercase();
        if t == "yuzu" {
            return true;
        }
        if t.starts_with("yuzu") {
            let is_game_window = (t.contains(" | ")
                && !t.contains("game list")
                && !t.contains("settings")
                && !t.contains("configure")
                && (!t.contains("early access") || t.matches('|').count() >= 2))
                || t.contains("fps")
                || t.contains("frametime")
                || t.contains("speed:")
                || t.contains("vulkan")
                || t.contains("opengl")
                || t.contains("nvn");
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

        // 3. Check active gameplay render indicators in window titles (e.g. FPS / Frametime / Vulkan / OpenGL)
        let is_rendering_gameplay = process.window_titles.iter().any(|title| {
            if self.is_idle_window(title) {
                return false;
            }
            let t_lower = title.to_lowercase();
            t_lower.contains("fps")
                || t_lower.contains("frametime")
                || t_lower.contains("speed:")
                || t_lower.contains("vulkan")
                || t_lower.contains("opengl")
                || t_lower.contains("nvn")
        });

        if is_rendering_gameplay {
            return true;
        }

        false
    }

    fn prepare_launch_command(&self, cmd: &mut Command, rom_path: &str, user_args: &str) {
        let template = user_args.trim();

        if template.is_empty() {
            cmd.arg("-f");
            cmd.arg("-g");
            cmd.arg(rom_path);
        } else if template.contains("{rom_path}") {
            let replaced = template.replace("{rom_path}", rom_path);
            let parsed_args = parse_cmd_arguments(&replaced);
            cmd.args(parsed_args);
        } else {
            let mut parsed_args = parse_cmd_arguments(template);
            if !parsed_args.iter().any(|a| a == "-g" || a == "--game") {
                parsed_args.push("-g".to_string());
            }
            cmd.args(&parsed_args);
            cmd.arg(rom_path);
        }
    }

    fn configure_file_dialog(&self, dialog: rfd::FileDialog) -> rfd::FileDialog {
        dialog
            .add_filter(
                "Switch Executable",
                &["nso", "nro", "nca", "xci", "nsp", "kip", "main"],
            )
            .add_filter("All Files", &["*"])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_yuzu_matches() {
        let handler = YuzuHandler;
        assert_eq!(handler.name(), "Yuzu");
        assert!(handler.matches("yuzu.exe", "yuzu.exe"));
        assert!(handler.matches("yuzu-cmd.exe", ""));
    }

    #[test]
    fn test_yuzu_idle_and_active_detection() {
        let handler = YuzuHandler;
        assert!(handler.is_idle_window("yuzu"));
        assert!(handler.is_idle_window("yuzu Early Access 4176"));
        assert!(!handler.is_idle_window("yuzu 1734 | Super Mario Odyssey (0100000000010000) (1.3.0) | Vulkan | 60.00 FPS"));
    }
}
