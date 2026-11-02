/* --- Windows' own: the pointer, a window's owner and corners ---------------------
   For picture-in-picture: where the pointer is and whether its button is
   down (even over other apps), a window kept above one Zen window only,
   and its corners as Theme › Size and shape › Corners says. Windows only; elsewhere these do
   nothing and say nothing. */
const Win32 = {
  load() {
    if (this.api !== undefined) return this.api;
    this.api = null;
    if (Services.appinfo.OS !== "WINNT") return null;
    try {
      const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
      const u32 = ctypes.open("user32.dll");
      let dwm = null;
      try {
        dwm = ctypes.open("dwmapi.dll");
      } catch {}
      const POINT = new ctypes.StructType("POINT", [{ x: ctypes.int32_t }, { y: ctypes.int32_t }]);
      const api = {
        ctypes, POINT,
        getCursorPos: u32.declare("GetCursorPos", ctypes.winapi_abi, ctypes.int32_t, POINT.ptr),
        keyState: u32.declare("GetAsyncKeyState", ctypes.winapi_abi, ctypes.int16_t, ctypes.int32_t),
        setPos: u32.declare("SetWindowPos", ctypes.winapi_abi, ctypes.int32_t, ctypes.voidptr_t, ctypes.intptr_t, ctypes.int32_t, ctypes.int32_t, ctypes.int32_t, ctypes.int32_t, ctypes.uint32_t),
        getWindow: u32.declare("GetWindow", ctypes.winapi_abi, ctypes.voidptr_t, ctypes.voidptr_t, ctypes.uint32_t),
        setLong: u32.declare(ctypes.size_t.size === 8 ? "SetWindowLongPtrW" : "SetWindowLongW", ctypes.winapi_abi, ctypes.intptr_t, ctypes.voidptr_t, ctypes.int32_t, ctypes.intptr_t),
        dwmSet: dwm?.declare("DwmSetWindowAttribute", ctypes.winapi_abi, ctypes.int32_t, ctypes.voidptr_t, ctypes.uint32_t, ctypes.voidptr_t, ctypes.uint32_t) ?? null,
      };
      window.addEventListener("unload", () => {
        u32.close();
        dwm?.close();
      }, { once: true });
      this.api = api;
    } catch (e) {
      console.error("[Zenith] Windows' own", e);
    }
    return this.api;
  },

  hwnd(win) {
    const api = this.load();
    return api ? api.ctypes.voidptr_t(api.ctypes.UInt64(win.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow).nativeHandle)) : null;
  },

  // The pointer, in device pixels, and whether the left button is down.
  pointer() {
    const api = this.load();
    if (!api) return null;
    const pt = new api.POINT();
    if (!api.getCursorPos(pt.address())) return null;
    // (Down now, or pressed since the last look: a quick click counts.)
    return { x: pt.x, y: pt.y, down: (api.keyState(0x01) & 0x8001) !== 0 };
  },

  // Owned by another window: above it only, minimised and closed with it.
  // (Once owned, left alone: something resets it now and then, so it's
  // looked at again.)
  own(win, owner) {
    const api = this.load();
    if (!api) return false;
    const now = api.ctypes.cast(api.getWindow(this.hwnd(win), 4 /* GW_OWNER */), api.ctypes.uintptr_t).value.toString();
    if (owner && now === api.ctypes.cast(this.hwnd(owner), api.ctypes.uintptr_t).value.toString()) return true;
    api.setLong(this.hwnd(win), -8 /* GWLP_HWNDPARENT */, owner ? api.ctypes.cast(this.hwnd(owner), api.ctypes.intptr_t) : 0);
    // (Above its owner only: not on top of other apps.)
    if (owner) api.setPos(this.hwnd(win), -2 /* HWND_NOTOPMOST */, 0, 0, 0, 0, 0x0013 /* NOSIZE | NOMOVE | NOACTIVATE */);
    return true;
  },

  // Windows 11's corners: square, small round or round.
  corners(win, kind) {
    const api = this.load();
    if (!api?.dwmSet) return;
    const v = new (api.ctypes.ArrayType(api.ctypes.uint32_t, 1))([{ square: 1, soft: 3, round: 2 }[kind] ?? 3]);
    api.dwmSet(this.hwnd(win), 33 /* DWMWA_WINDOW_CORNER_PREFERENCE */, v.address(), 4);
  },
};

