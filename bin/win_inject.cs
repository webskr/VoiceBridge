using System;
using System.Runtime.InteropServices;
using System.IO;
using System.Windows.Forms;
using System.Drawing;
using System.Collections.Specialized;

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
    static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

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
        try {
            mouse_event(flags, dx, dy, mouseData, UIntPtr.Zero);
        } catch {}
    }

    [STAThread]
    public static void Main(string[] args) {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.InputEncoding = System.Text.Encoding.UTF8;

        string line;
        while ((line = Console.ReadLine()) != null) {
            try {
                if (line.StartsWith("TYPE:")) {
                    string text = line.Substring(5);
                    uint ret = 0;
                    foreach (char c in text) {
                        INPUT[] inp = new INPUT[2];
                        inp[0].type = INPUT_KEYBOARD;
                        inp[0].mkhi.ki.wVk = 0;
                        inp[0].mkhi.ki.wScan = (ushort)c;
                        inp[0].mkhi.ki.dwFlags = KEYEVENTF_UNICODE;
                        inp[1].type = INPUT_KEYBOARD;
                        inp[1].mkhi.ki.wVk = 0;
                        inp[1].mkhi.ki.wScan = (ushort)c;
                        inp[1].mkhi.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                        ret += SendInput(2, inp, Marshal.SizeOf(typeof(INPUT)));
                    }
                    if (ret == 0 && text.Length > 0) {
                        // Fallback: Clipboard + Ctrl+V
                        // Guarantees typing into any input even when UIPI blocks SendInput
                        byte[] bytes = System.Text.Encoding.Unicode.GetBytes(text + "\0");
                        IntPtr hMem = GlobalAlloc(0x0002, (UIntPtr)bytes.Length);
                        IntPtr ptr = GlobalLock(hMem);
                        Marshal.Copy(bytes, 0, ptr, bytes.Length);
                        GlobalUnlock(hMem);
                        OpenClipboard(IntPtr.Zero);
                        EmptyClipboard();
                        SetClipboardData(13, hMem);
                        CloseClipboard();

                        keybd_event(0x11, 0, 0, UIntPtr.Zero);
                        System.Threading.Thread.Sleep(10);
                        keybd_event(0x56, 0, 0, UIntPtr.Zero);
                        System.Threading.Thread.Sleep(25);
                        keybd_event(0x56, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                        System.Threading.Thread.Sleep(10);
                        keybd_event(0x11, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    }
                    Console.WriteLine("OK");
                } else if (line.StartsWith("BS:")) {
                    int count = int.Parse(line.Substring(3));
                    for (int i = 0; i < count; i++) {
                        keybd_event(0x08, 0, 0, UIntPtr.Zero);
                        keybd_event(0x08, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    }
                    Console.WriteLine("OK");
                } else if (line.StartsWith("KEY:")) {
                    string keyCmd = line.Substring(4).ToUpper().Trim();
                    if (keyCmd == "ENTER") {
                        keybd_event(0x0D, 0, 0, UIntPtr.Zero);
                        keybd_event(0x0D, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    } else if (keyCmd == "TAB") {
                        keybd_event(0x09, 0, 0, UIntPtr.Zero);
                        keybd_event(0x09, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    } else if (keyCmd == "ESC") {
                        keybd_event(0x1B, 0, 0, UIntPtr.Zero);
                        keybd_event(0x1B, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    } else if (keyCmd == "CTRL+C") {
                        keybd_event(0x11, 0, 0, UIntPtr.Zero);
                        System.Threading.Thread.Sleep(10);
                        keybd_event(0x43, 0, 0, UIntPtr.Zero);
                        System.Threading.Thread.Sleep(25);
                        keybd_event(0x43, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                        System.Threading.Thread.Sleep(10);
                        keybd_event(0x11, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    } else if (keyCmd == "CTRL+V") {
                        keybd_event(0x11, 0, 0, UIntPtr.Zero);
                        System.Threading.Thread.Sleep(10);
                        keybd_event(0x56, 0, 0, UIntPtr.Zero);
                        System.Threading.Thread.Sleep(25);
                        keybd_event(0x56, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                        System.Threading.Thread.Sleep(10);
                        keybd_event(0x11, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    } else if (keyCmd == "VOL_UP") {
                        keybd_event(0xAF, 0, 0, UIntPtr.Zero);
                        keybd_event(0xAF, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    } else if (keyCmd == "VOL_DOWN") {
                        keybd_event(0xAE, 0, 0, UIntPtr.Zero);
                        keybd_event(0xAE, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    } else if (keyCmd == "VOL_MUTE") {
                        keybd_event(0xAD, 0, 0, UIntPtr.Zero);
                        keybd_event(0xAD, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    }
                    Console.WriteLine("OK");
                } else if (line.StartsWith("MOUSE_MOVE:")) {
                    string[] parts = line.Substring(11).Split(',');
                    if (parts.Length == 2) {
                        int dx = (int)Math.Round(double.Parse(parts[0], System.Globalization.CultureInfo.InvariantCulture));
                        int dy = (int)Math.Round(double.Parse(parts[1], System.Globalization.CultureInfo.InvariantCulture));
                        Point cur = Cursor.Position;
                        Cursor.Position = new Point(cur.X + dx, cur.Y + dy);
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
                    System.Threading.Thread.Sleep(10);
                    SendMouseInput(MOUSEEVENTF_LEFTUP);
                    Console.WriteLine("OK");
                } else if (line == "MOUSE_CLICK:RIGHT") {
                    SendMouseInput(MOUSEEVENTF_RIGHTDOWN);
                    System.Threading.Thread.Sleep(10);
                    SendMouseInput(MOUSEEVENTF_RIGHTUP);
                    Console.WriteLine("OK");
                } else if (line.StartsWith("MOUSE_SCROLL:")) {
                    int dy = (int)Math.Round(double.Parse(line.Substring(13), System.Globalization.CultureInfo.InvariantCulture));
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
                } else if (line.StartsWith("CLIP_IMAGE:")) {
                    string filePath = line.Substring(11).Trim();
                    try {
                        if (File.Exists(filePath)) {
                            Bitmap bmp = null;
                            using (Image img = Image.FromFile(filePath)) {
                                bmp = new Bitmap(img);
                            }
                            DataObject data = new DataObject();
                            data.SetImage(bmp);
                            data.SetText(filePath);
                            StringCollection files = new StringCollection();
                            files.Add(filePath);
                            data.SetFileDropList(files);
                            Clipboard.SetDataObject(data, true, 5, 100);
                            Console.WriteLine("OK");
                        } else {
                            Console.WriteLine("ERR:FILE_NOT_FOUND");
                        }
                    } catch (Exception ex) {
                        Console.WriteLine("ERR:" + ex.Message);
                    }
                } else if (line.StartsWith("CLIP_FILE:")) {
                    string filePath = line.Substring(10).Trim();
                    try {
                        if (File.Exists(filePath)) {
                            DataObject data = new DataObject();
                            StringCollection files = new StringCollection();
                            files.Add(filePath);
                            data.SetFileDropList(files);
                            data.SetText(filePath);
                            Clipboard.SetDataObject(data, true, 5, 100);
                            Console.WriteLine("OK");
                        } else {
                            Console.WriteLine("ERR:FILE_NOT_FOUND");
                        }
                    } catch (Exception ex) {
                        Console.WriteLine("ERR:" + ex.Message);
                    }
                } else if (line == "PING") {
                    Console.WriteLine("PONG");
                }
            } catch (Exception ex) {
                Console.WriteLine("ERR:" + ex.Message);
            }
        }
    }
}
