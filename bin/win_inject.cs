using System;
using System.Runtime.InteropServices;
using System.IO;

class WinInject {
    [StructLayout(LayoutKind.Sequential)]
    struct INPUT {
        public uint type;
        public MOUSEKEYBDHARDWAREINPUT mkhi;
    }

    [StructLayout(LayoutKind.Explicit, Size = 32)]
    struct MOUSEKEYBDHARDWAREINPUT {
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    const uint INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint KEYEVENTF_UNICODE = 0x0004;

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    static extern bool OpenClipboard(IntPtr hWndNewOwner);
    [DllImport("user32.dll")]
    static extern bool CloseClipboard();
    [DllImport("user32.dll")]
    static extern bool EmptyClipboard();
    [DllImport("user32.dll")]
    static extern IntPtr SetClipboardData(uint uFormat, IntPtr hMem);
    [DllImport("kernel32.dll")]
    static extern IntPtr GlobalAlloc(uint uFlags, UIntPtr dwBytes);
    [DllImport("kernel32.dll")]
    static extern IntPtr GlobalLock(IntPtr hMem);
    [DllImport("kernel32.dll")]
    static extern bool GlobalUnlock(IntPtr hMem);

    public static void Main(string[] args) {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.InputEncoding = System.Text.Encoding.UTF8;
        string line;
        while ((line = Console.ReadLine()) != null) {
            if (line.StartsWith("TYPE:")) {
                string text = line.Substring(5);
                foreach (char c in text) {
                    INPUT[] inp = new INPUT[2];
                    inp[0].type = INPUT_KEYBOARD;
                    inp[0].mkhi.ki.wScan = (ushort)c;
                    inp[0].mkhi.ki.dwFlags = KEYEVENTF_UNICODE;
                    inp[1].type = INPUT_KEYBOARD;
                    inp[1].mkhi.ki.wScan = (ushort)c;
                    inp[1].mkhi.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                    SendInput(2, inp, Marshal.SizeOf(typeof(INPUT)));
                }
                Console.WriteLine("OK");
            } else if (line.StartsWith("BS:")) {
                int count = int.Parse(line.Substring(3));
                for (int i = 0; i < count; i++) {
                    INPUT[] inp = new INPUT[2];
                    inp[0].type = INPUT_KEYBOARD;
                    inp[0].mkhi.ki.wVk = 0x08;
                    inp[1].type = INPUT_KEYBOARD;
                    inp[1].mkhi.ki.wVk = 0x08;
                    inp[1].mkhi.ki.dwFlags = KEYEVENTF_KEYUP;
                    SendInput(2, inp, Marshal.SizeOf(typeof(INPUT)));
                }
                Console.WriteLine("OK");
            } else if (line.StartsWith("CLIP:")) {
                string text = line.Substring(5);
                byte[] bytes = System.Text.Encoding.Unicode.GetBytes(text + "\0");
                IntPtr hMem = GlobalAlloc(0x0002, (UIntPtr)bytes.Length);
                IntPtr ptr = GlobalLock(hMem);
                Marshal.Copy(bytes, 0, ptr, bytes.Length);
                GlobalUnlock(hMem);
                OpenClipboard(IntPtr.Zero);
                EmptyClipboard();
                SetClipboardData(13, hMem);
                CloseClipboard();
                Console.WriteLine("OK");
            } else if (line == "PING") {
                Console.WriteLine("PONG");
            }
        }
    }
}
