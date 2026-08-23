use std::path::Path;
use std::process::Command;
use super::{normalize_for_match, parse_cmd_arguments, EmuGameInfo, EmulatorHandler, ProcessInfo};

pub struct Pcsx2Handler;

impl EmulatorHandler for Pcsx2Handler {
    fn name(&self) -> &'static str {
        "PCSX2"
    }

    fn matches(&self, proc_exe_lower: &str, emu_exe_lower: &str) -> bool {
        proc_exe_lower.contains("pcsx2")
            && (emu_exe_lower.contains("pcsx2") || emu_exe_lower.is_empty())
    }

    fn is_idle_window(&self, title: &str) -> bool {
        let t = title.trim().to_lowercase();
        t == "pcsx2"
            || t.starts_with("pcsx2 v")
            || t.starts_with("pcsx2 -")
            || t.starts_with("pcsx2 ")
    }

    fn is_game_active(&self, process: &ProcessInfo, emu: &EmuGameInfo) -> bool {
        let norm_game_name = normalize_for_match(emu.game_name);
        let rom_stem = Path::new(emu.rom_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        let norm_rom_stem = normalize_for_match(rom_stem);

        // Check window titles for game name (e.g. "Mortal Kombat: Shaolin Monks" or "PCSX2 v2.x | Mortal Kombat...")
        let title_matches = process.window_titles.iter().any(|title| {
            let norm_title = normalize_for_match(title);
            (!norm_game_name.is_empty() && norm_title.contains(&norm_game_name))
                || (!norm_rom_stem.is_empty() && norm_title.contains(&norm_rom_stem))
        });

        if title_matches {
            return true;
        }

        // Check active gameplay render indicators in window titles (e.g. Speed / FPS / GSdx / VPS)
        let is_rendering_gameplay = process.window_titles.iter().any(|title| {
            let t_lower = title.to_lowercase();
            if self.is_idle_window(title) {
                return false;
            }
            t_lower.contains("speed:")
                || t_lower.contains("fps:")
                || t_lower.contains("vps:")
                || t_lower.contains("gsdx")
                || t_lower.contains("slot:")
        });

        if is_rendering_gameplay {
            return true;
        }

        false
    }

    fn prepare_launch_command(&self, cmd: &mut Command, rom_path: &str, user_args: &str) {
        // PCSX2 does not accept `-batch` or `-nogui` via CLI in modern Qt versions
        let sanitized_template = user_args
            .replace("-nogui", "")
            .replace("--nogui", "")
            .replace("-batch", "")
            .replace("--batch", "")
            .trim()
            .to_string();

        if sanitized_template.is_empty() {
            cmd.arg("--");
            cmd.arg(rom_path);
        } else if sanitized_template.contains("{rom_path}") {
            let replaced = sanitized_template.replace("{rom_path}", rom_path);
            let parsed_args = parse_cmd_arguments(&replaced);
            cmd.args(parsed_args);
        } else {
            let parsed_args = parse_cmd_arguments(&sanitized_template);
            cmd.args(&parsed_args);
            if !sanitized_template.contains("--") {
                cmd.arg("--");
            }
            cmd.arg(rom_path);
        }
    }

    fn configure_file_dialog(&self, dialog: rfd::FileDialog) -> rfd::FileDialog {
        dialog
            .add_filter(
                "All Supported PS2 Images",
                &[
                    "bin", "iso", "cue", "mdf", "chd", "cso", "zso", "gz", "elf", "irx", "gs",
                    "dump",
                ],
            )
            .add_filter("Single-Track Raw Images", &["bin", "iso"])
            .add_filter("Cue Sheets", &["cue"])
            .add_filter("Media Descriptor File", &["mdf"])
            .add_filter("MAME CHD Images", &["chd"])
            .add_filter("CSO Images", &["cso"])
            .add_filter("ZSO Images", &["zso"])
            .add_filter("GZ Images", &["gz"])
            .add_filter("ELF Executables", &["elf"])
            .add_filter("IRX Executables", &["irx"])
            .add_filter("GS Dumps", &["gs", "xz", "zst"])
            .add_filter("Block Dumps", &["dump"])
            .add_filter("All Files", &["*"])
    }
}
