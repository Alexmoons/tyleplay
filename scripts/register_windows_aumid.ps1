param(
    [string]$ExePath = "",
    [string]$AppId = "com.artyle.tyleplay",
    [string]$ShortcutName = "TylePlay.lnk"
)

try {
    $AppData = [Environment]::GetFolderPath('ApplicationData')
    $ProgramsDir = Join-Path $AppData 'Microsoft\Windows\Start Menu\Programs'
    if (-not (Test-Path $ProgramsDir)) {
        New-Item -ItemType Directory -Path $ProgramsDir -Force | Out-Null
    }

    $ShortcutPath = Join-Path $ProgramsDir $ShortcutName

    if ([string]::IsNullOrWhiteSpace($ExePath)) {
        $ExePath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    }

    # Create WScript.Shell shortcut
    $ws = New-Object -ComObject WScript.Shell
    $s = $ws.CreateShortcut($ShortcutPath)
    $s.TargetPath = $ExePath
    if (Test-Path $ExePath) {
        $s.WorkingDirectory = [System.IO.Path]::GetDirectoryName($ExePath)
    }
    $s.Description = "TylePlay Desktop Application"
    $s.Save()

    # Set System.AppUserModel.ID on shortcut via PropertyStore
    $TypeDefinition = @"
using System;
using System.Runtime.InteropServices;

public static class AUMIDHelper {
    [DllImport("shell32.dll", SetLastError = true)]
    public static extern int SHGetPropertyStoreFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
        IntPtr pbc,
        int flags,
        ref Guid riid,
        out IPropertyStore ppv);

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    public struct PROPERTYKEY {
        public Guid fmtid;
        public uint pid;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct PROPVARIANT {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public IntPtr pwszVal;
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDA11DDCF443"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPropertyStore {
        int GetCount(out uint cProps);
        int GetAt(uint iProp, out PROPERTYKEY pkey);
        int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
        int SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
        int Commit();
    }

    public static bool SetShortcutAppId(string shortcutPath, string appId) {
        try {
            Guid IID_IPropertyStore = new Guid("886D8EEB-8CF2-4446-8D02-CDA11DDCF443");
            IPropertyStore store;
            int hr = SHGetPropertyStoreFromParsingName(shortcutPath, IntPtr.Zero, 2, ref IID_IPropertyStore, out store);
            if (hr == 0 && store != null) {
                PROPERTYKEY key = new PROPERTYKEY {
                    fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),
                    pid = 5
                };
                PROPVARIANT pv = new PROPVARIANT {
                    vt = 31,
                    pwszVal = Marshal.StringToCoTaskMemUni(appId)
                };
                store.SetValue(ref key, ref pv);
                store.Commit();
                Marshal.FreeCoTaskMem(pv.pwszVal);
                return true;
            }
        } catch { }
        return false;
    }
}
"@

    Add-Type -TypeDefinition $TypeDefinition -ErrorAction SilentlyContinue
    [AUMIDHelper]::SetShortcutAppId($ShortcutPath, $AppId) | Out-Null
    Write-Host "Successfully registered Windows AUMID shortcut: $ShortcutPath"
} catch {
    Write-Error $_.Exception.Message
}
