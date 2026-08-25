use std::process::Command;
use super::{parse_cmd_arguments, EmuGameInfo, EmulatorHandler, ProcessInfo};

pub struct EpsxeHandler;

impl EmulatorHandler for EpsxeHandler {
    fn name(&self) -> &'static str {
        "ePSXe"
    }

    fn matches(&self, proc_exe_lower: &str, emu_exe_lower: &str) -> bool {
        proc_exe_lower.contains("epsxe")
            && (emu_exe_lower.contains("epsxe") || emu_exe_lower.is_empty())
    }

    fn is_idle_window(&self, title: &str) -> bool {
        let t = title.trim().to_lowercase();
        t == "epsxe"
            || t.starts_with("epsxe ")
            || t.starts_with("epsxe -")
            || t.starts_with("epsxe v")
    }

    fn is_game_active(&self, process: &ProcessInfo, emu: &EmuGameInfo) -> bool {
        // ePSXe runs directly with ROM command line argument when launched
        let cmd_matches = process.cmd_args.iter().any(|arg| {
            let norm_arg = arg.to_lowercase().replace('\\', "/");
            norm_arg.contains(emu.rom_path)
                || (!emu.rom_file_name.is_empty() && norm_arg.contains(emu.rom_file_name))
        });

        cmd_matches
    }

    fn prepare_launch_command(&self, cmd: &mut Command, rom_path: &str, user_args: &str) {
        let template = user_args.trim().to_string();

        if template.is_empty() {
            cmd.arg("-nogui");
            cmd.arg("-loadbin");
            cmd.arg(rom_path);
        } else if template.contains("{rom_path}") {
            let replaced = template.replace("{rom_path}", rom_path);
            let parsed_args = parse_cmd_arguments(&replaced);
            cmd.args(parsed_args);
        } else {
            let parsed_args = parse_cmd_arguments(&template);
            let has_load_flag = parsed_args.iter().any(|a| {
                let a_low = a.to_lowercase();
                a_low == "-loadbin"
                    || a_low == "-loadiso"
                    || a_low == "-loadcue"
                    || a_low == "-loadchd"
            });
            cmd.args(&parsed_args);
            if !has_load_flag {
                cmd.arg("-loadbin");
            }
            cmd.arg(rom_path);
        }
    }

    fn configure_file_dialog(&self, dialog: rfd::FileDialog) -> rfd::FileDialog {
        dialog
            .add_filter(
                "Supported PS1 Images",
                &["chd", "iso", "bin", "cue", "img", "mdf", "pbp", "cso", "zso"],
            )
            .add_filter("CHD Compressed Images", &["chd"])
            .add_filter("Raw Disc Images (.bin / .iso / .img)", &["iso", "bin", "img"])
            .add_filter("Cue Sheets (.cue)", &["cue"])
            .add_filter("PSP / PS1 Eboot (.pbp)", &["pbp"])
            .add_filter("Media Descriptor (.mdf)", &["mdf"])
    }
}
