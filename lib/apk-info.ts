import { inflateRawSync } from "node:zlib";

/**
 * Reads what an Android app file (.apk) says about itself, without any Android tools:
 * the version (from the compiled AndroidManifest.xml), whether it is a test (debug) build, and
 * the address it opens (from Capacitor's assets/capacitor.config.json).
 * Used to check uploads in Settings → Mobile app and to tell phones about updates.
 */
export type ApkInfo = {
  appId: string;
  versionCode: number;
  versionName: string;
  debuggable: boolean;
  /** The address the app opens (server.url in capacitor.config.json), or null if not set */
  serverUrl: string | null;
};

export class ApkReadError extends Error {}

// ---- Zip ----------------------------------------------------------------------------------

/** The uncompressed bytes of one file inside the zip, or null if it isn't there. */
function zipEntry(zip: Buffer, wanted: string): Buffer | null {
  // End of central directory: last 22+ bytes, signature 0x06054b50.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ApkReadError("That isn't a valid Android app file (.apk).");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) break;
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new ApkReadError("The app file uses an unknown compression.");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// ---- Compiled Android XML (AXML) ------------------------------------------------------------

const RES_STRING_POOL = 0x0001;
const RES_XML_RESOURCE_MAP = 0x0180;
const RES_XML_START_ELEMENT = 0x0102;
const UTF8_FLAG = 0x100;
const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;
const TYPE_BOOLEAN = 0x12;
// android:versionCode, android:versionName, android:debuggable
const ATTR_VERSION_CODE = 0x0101021b;
const ATTR_VERSION_NAME = 0x0101021c;
const ATTR_DEBUGGABLE = 0x0101000f;

function readStringPool(buf: Buffer, at: number): string[] {
  const count = buf.readUInt32LE(at + 8);
  const flags = buf.readUInt32LE(at + 16);
  const stringsStart = at + buf.readUInt32LE(at + 20);
  const utf8 = (flags & UTF8_FLAG) !== 0;
  const strings: string[] = [];
  for (let i = 0; i < count; i++) {
    let p = stringsStart + buf.readUInt32LE(at + 28 + i * 4);
    if (utf8) {
      // UTF-16 length (1-2 bytes), then UTF-8 byte length (1-2 bytes), then the bytes.
      p += buf[p]! & 0x80 ? 2 : 1;
      let len = buf[p]!;
      if (len & 0x80) {
        len = ((len & 0x7f) << 8) | buf[p + 1]!;
        p += 2;
      } else p += 1;
      strings.push(buf.toString("utf8", p, p + len));
    } else {
      let len = buf.readUInt16LE(p);
      if (len & 0x8000) {
        len = ((len & 0x7fff) << 16) | buf.readUInt16LE(p + 2);
        p += 4;
      } else p += 2;
      strings.push(buf.toString("utf16le", p, p + len * 2));
    }
  }
  return strings;
}

type Attr = { name: string; resId: number; type: number; data: number; raw: string | null };

function parseManifest(xml: Buffer) {
  let strings: string[] = [];
  let resMap: number[] = [];
  const elements: { name: string; attrs: Attr[] }[] = [];
  let p = xml.readUInt16LE(2); // skip the file header
  while (p + 8 <= xml.length) {
    const type = xml.readUInt16LE(p);
    const headerSize = xml.readUInt16LE(p + 2);
    const size = xml.readUInt32LE(p + 4);
    if (size < 8) break;
    if (type === RES_STRING_POOL) strings = readStringPool(xml, p);
    else if (type === RES_XML_RESOURCE_MAP) {
      resMap = [];
      for (let q = p + headerSize; q < p + size; q += 4) resMap.push(xml.readUInt32LE(q));
    } else if (type === RES_XML_START_ELEMENT) {
      const ext = p + headerSize;
      const name = strings[xml.readUInt32LE(ext + 4)] ?? "";
      const attrStart = xml.readUInt16LE(ext + 8);
      const attrSize = xml.readUInt16LE(ext + 10);
      const attrCount = xml.readUInt16LE(ext + 12);
      const attrs: Attr[] = [];
      for (let i = 0; i < attrCount; i++) {
        const a = ext + attrStart + i * attrSize;
        const nameIdx = xml.readUInt32LE(a + 4);
        const rawIdx = xml.readUInt32LE(a + 8);
        attrs.push({
          name: strings[nameIdx] ?? "",
          resId: resMap[nameIdx] ?? 0,
          type: xml[a + 15]!,
          data: xml.readUInt32LE(a + 16),
          raw: rawIdx !== 0xffffffff ? (strings[rawIdx] ?? null) : null,
        });
      }
      elements.push({ name, attrs });
    }
    p += size;
  }
  return { elements, strings };
}

const findAttr = (attrs: Attr[], resId: number, name: string) => attrs.find((a) => a.resId === resId || a.name === name);

export function readApk(apk: Buffer): ApkInfo {
  if (!(apk.length > 4 && apk.readUInt32LE(0) === 0x04034b50)) throw new ApkReadError("That isn't an Android app file (.apk).");
  const manifestXml = zipEntry(apk, "AndroidManifest.xml");
  if (!manifestXml) throw new ApkReadError("That isn't an Android app file (no AndroidManifest.xml).");

  const { elements, strings } = parseManifest(manifestXml);
  const manifest = elements.find((e) => e.name === "manifest");
  const application = elements.find((e) => e.name === "application");
  if (!manifest) throw new ApkReadError("Couldn't read the app file's manifest.");

  const pkg = manifest.attrs.find((a) => a.name === "package");
  const code = findAttr(manifest.attrs, ATTR_VERSION_CODE, "versionCode");
  const name = findAttr(manifest.attrs, ATTR_VERSION_NAME, "versionName");
  const debug = application && findAttr(application.attrs, ATTR_DEBUGGABLE, "debuggable");

  const versionCode = code && (code.type === TYPE_INT_DEC || code.type === TYPE_INT_HEX) ? code.data : Number(code?.raw ?? NaN);
  const versionName = name ? (name.raw ?? (name.type === TYPE_STRING ? (strings[name.data] ?? "") : String(name.data))) : "";
  if (!Number.isInteger(versionCode) || versionCode <= 0) throw new ApkReadError("Couldn't read the app's version number.");

  let serverUrl: string | null = null;
  const config = zipEntry(apk, "assets/capacitor.config.json");
  if (config) {
    try {
      serverUrl = (JSON.parse(config.toString("utf8")) as { server?: { url?: string } }).server?.url ?? null;
    } catch {
      serverUrl = null;
    }
  }

  return {
    appId: pkg?.raw ?? "",
    versionCode,
    versionName: versionName || String(versionCode),
    debuggable: !!debug && debug.type === TYPE_BOOLEAN && debug.data !== 0,
    serverUrl,
  };
}

// ---- Checks --------------------------------------------------------------------------------

/** Must match appId in mobile/capacitor.config.ts (and applicationId in android/app/build.gradle). */
export const APP_ID = "com.attendancedesk.app";

/** Why this app file can't go to staff, or null if it can. */
export function apkProblem(apk: { appId: string; debuggable: boolean; serverUrl: string | null }): string | null {
  if (apk.appId && apk.appId !== APP_ID) return `This is a different app (${apk.appId}), not the Attendance app.`;
  if (apk.debuggable) return "This is a test (debug) build. Upload the signed release build: run npm run release:android in the mobile folder.";
  let url: URL | null = null;
  try {
    url = apk.serverUrl ? new URL(apk.serverUrl) : null;
  } catch {
    url = null;
  }
  if (!url) return "This app file doesn't say which address to open. Rebuild it with npm run release:android.";
  if (url.protocol !== "https:" || /^(localhost|127\.|10\.|192\.168\.)/.test(url.hostname) || url.hostname.endsWith(".trycloudflare.com")) {
    return `This app opens ${url.origin}, which only works on this computer or for a short time. Rebuild it with your fixed https address (SERVER_URL in mobile/.env).`;
  }
  return null;
}
