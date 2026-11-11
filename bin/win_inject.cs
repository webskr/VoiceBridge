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
        [FieldOffset(0)] public MOUSEINPUT mi;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    const uint INPUT_MOUSE = 0;
    const uint INPUT_KEYBOARD = 1;

    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint KEYEVENTF_UNICODE = 0x0004;

    const uint MOUSEEVENTF_MOVE = 0x0001;
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;
    const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    const uint MOUSEEVENTF_WHEEL = 0x0800;

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

    static void SendMouseInput(uint flags, int dx = 0, int dy = 0, uint mouseData = 0) {
        INPUT[] inp = new INPUT[1];
        inp[0].type = INPUT_MOUSE;
        inp[0].mkhi.mi.dx = dx;
        inp[0].mkhi.mi.dy = dy;
        inp[0].mkhi.mi.mouseData = mouseData;
        inp[0].mkhi.mi.dwFlags = flags;
        SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
    }

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
            } else if (line.StartsWith("KEY:")) {
                string keyCmd = line.Substring(4).ToUpper().Trim();
                if (keyCmd == "ENTER") {
                    INPUT[] inp = new INPUT[2];
                    inp[0].type = INPUT_KEYBOARD;
                    inp[0].mkhi.ki.wVk = 0x0D;
                    inp[1].type = INPUT_KEYBOARD;
                    inp[1].mkhi.ki.wVk = 0x0D;
                    inp[1].mkhi.ki.dwFlags = KEYEVENTF_KEYUP;
                    SendInput(2, inp, Marshal.SizeOf(typeof(INPUT)));
                } else if (keyCmd == "TAB") {
                    INPUT[] inp = new INPUT[2];
                    inp[0].type = INPUT_KEYBOARD;
                    inp[0].mkhi.ki.wVk = 0x09;
                    inp[1].type = INPUT_KEYBOARD;
                    inp[1].mkhi.ki.wVk = 0x09;
                    inp[1].mkhi.ki.dwFlags = KEYEVENTF_KEYUP;
                    SendInput(2, inp, Marshal.SizeOf(typeof(INPUT)));
                } else if (keyCmd == "ESC") {
                    INPUT[] inp = new INPUT[2];
                    inp[0].type = INPUT_KEYBOARD;
                    inp[0].mkhi.ki.wVk = 0x1B;
                    inp[1].type = INPUT_KEYBOARD;
                    inp[1].mkhi.ki.wVk = 0x1B;
                    inp[1].mkhi.ki.dwFlags = KEYEVENTF_KEYUP;
                    SendInput(2, inp, Marshal.SizeOf(typeof(INPUT)));
                } else if (keyCmd == "CTRL+C") {
                    INPUT[] inp = new INPUT[4];
                    inp[0].type = INPUT_KEYBOARD; inp[0].mkhi.ki.wVk = 0x11; // Ctrl down
                    inp[1].type = INPUT_KEYBOARD; inp[1].mkhi.ki.wVk = 0x43; // C down
                    inp[2].type = INPUT_KEYBOARD; inp[2].mkhi.ki.wVk = 0x43; inp[2].mkhi.ki.dwFlags = KEYEVENTF_KEYUP;
                    inp[3].type = INPUT_KEYBOARD; inp[3].mkhi.ki.wVk = 0x11; inp[3].mkhi.ki.dwFlags = KEYEVENTF_KEYUP;
                    SendInput(4, inp, Marshal.SizeOf(typeof(INPUT)));
                } else if (keyCmd == "CTRL+V") {
                    INPUT[] inp = new INPUT[4];
                    inp[0].type = INPUT_KEYBOARD; inp[0].mkhi.ki.wVk = 0x11;
                    inp[1].type = INPUT_KEYBOARD; inp[1].mkhi.ki.wVk = 0x56; // V down
                    inp[2].type = INPUT_KEYBOARD; inp[2].mkhi.ki.wVk = 0x56; inp[2].mkhi.ki.dwFlags = KEYEVENTF_KEYUP;
                    inp[3].type = INPUT_KEYBOARD; inp[3].mkhi.ki.wVk = 0x11; inp[3].mkhi.ki.dwFlags = KEYEVENTF_KEYUP;
                    SendInput(4, inp, Marshal.SizeOf(typeof(INPUT)));
                } else if (keyCmd == "VOL_UP") {
                    INPUT[] inp = new INPUT[2];
                    inp[0].type = INPUT_KEYBOARD; inp[0].mkhi.ki.wVk = 0xAF; // VK_VOLUME_UP
                    inp[1].type = INPUT_KEYBOARD; inp[1].mkhi.ki.wVk = 0xAF; inp[1].mkhi.ki.dwFlags = KEYEVENTF_KEYUP;
                    SendInput(2, inp, Marshal.SizeOf(typeof(INPUT)));
                } else if (keyCmd == "VOL_DOWN") {
                    INPUT[] inp = new INPUT[2];
                    inp[0].type = INPUT_KEYBOARD; inp[0].mkhi.ki.wVk = 0xAE; // VK_VOLUME_DOWN
                    inp[1].type = INPUT_KEYBOARD; inp[1].mkhi.ki.wVk = 0xAE; inp[1].mkhi.ki.dwFlags = KEYEVENTF_KEYUP;
                    SendInput(2, inp, Marshal.SizeOf(typeof(INPUT)));
                } else if (keyCmd == "VOL_MUTE") {
                    INPUT[] inp = new INPUT[2];
                    inp[0].type = INPUT_KEYBOARD; inp[0].mkhi.ki.wVk = 0xAD; // VK_VOLUME_MUTE
                    inp[1].type = INPUT_KEYBOARD; inp[1].mkhi.ki.wVk = 0xAD; inp[1].mkhi.ki.dwFlags = KEYEVENTF_KEYUP;
                    SendInput(2, inp, Marshal.SizeOf(typeof(INPUT)));
                }
                Console.WriteLine("OK");
            } else if (line.StartsWith("MOUSE_MOVE:")) {
                // Format: MOUSE_MOVE:dx,dy
                string[] parts = line.Substring(11).Split(',');
                if (parts.Length == 2) {
                    int dx = (int)Math.Round(double.Parse(parts[0]));
                    int dy = (int)Math.Round(double.Parse(parts[1]));
                    SendMouseInput(MOUSEEVENTF_MOVE, dx, dy);
                }
                Console.WriteLine("OK");
            } else if (line == "MOUSE_DOWN:LEFT") {
                SendMouseInput(MOUSEEVENTF_LEFTDOWN);
                Console.WriteLine("OK");
            } else if (line == "MOUSE_UP:LEFT") {
                SendMouseInput(MOUSEEVENTF_LEFTUP);
                Console.WriteLine("OK");
            } else if (line == "MOUSE_CLICK:LEFT") {
                SendMouseInput(MOUSEEVENTF_LEFTDOWN);
                SendMouseInput(MOUSEEVENTF_LEFTUP);
                Console.WriteLine("OK");
            } else if (line == "MOUSE_CLICK:RIGHT") {
                SendMouseInput(MOUSEEVENTF_RIGHTDOWN);
                SendMouseInput(MOUSEEVENTF_RIGHTUP);
                Console.WriteLine("OK");
            } else if (line.StartsWith("MOUSE_SCROLL:")) {
                // dy in lines or units
                int dy = (int)Math.Round(double.Parse(line.Substring(13)));
                SendMouseInput(MOUSEEVENTF_WHEEL, 0, 0, (uint)dy);
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

