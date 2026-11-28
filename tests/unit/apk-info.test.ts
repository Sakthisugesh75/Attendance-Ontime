import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { APP_ID, ApkReadError, apkProblem, readApk } from "@/lib/apk-info";

/** A minimal zip holding the given files (deflated), enough for readApk. */
function zip(files: Record<string, Buffer>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const comp = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** A tiny compiled AndroidManifest.xml (UTF-8 string pool, resource map, two elements). */
function manifest({ pkg, code, name, debuggable }: { pkg: string; code: number; name: string; debuggable: boolean }) {
  const strings = ["versionCode", "versionName", "debuggable", "package", "manifest", "application", pkg, name];
  const enc = strings.map((s) => {
    const b = Buffer.from(s, "utf8");
    return Buffer.concat([Buffer.from([s.length, b.length]), b, Buffer.from([0])]);
  });
  const offsets = Buffer.alloc(strings.length * 4);
  let o = 0;
  enc.forEach((e, i) => {
    offsets.writeUInt32LE(o, i * 4);
    o += e.length;
  });
  let body = Buffer.concat(enc);
  if (body.length % 4) body = Buffer.concat([body, Buffer.alloc(4 - (body.length % 4))]);
  const poolHeader = Buffer.alloc(28);
  poolHeader.writeUInt16LE(0x0001, 0);
  poolHeader.writeUInt16LE(28, 2);
  poolHeader.writeUInt32LE(28 + offsets.length + body.length, 4);
  poolHeader.writeUInt32LE(strings.length, 8);
  poolHeader.writeUInt32LE(0x100, 16);
  poolHeader.writeUInt32LE(28 + offsets.length, 20);
  const pool = Buffer.concat([poolHeader, offsets, body]);

  const map = Buffer.alloc(8 + 12);
  map.writeUInt16LE(0x0180, 0);
  map.writeUInt16LE(8, 2);
  map.writeUInt32LE(map.length, 4);
  map.writeUInt32LE(0x0101021b, 8);
  map.writeUInt32LE(0x0101021c, 12);
  map.writeUInt32LE(0x0101000f, 16);

  const element = (nameIdx: number, attrs: [number, number, number, number][]) => {
    const b = Buffer.alloc(16 + 20 + attrs.length * 20);
    b.writeUInt16LE(0x0102, 0);
    b.writeUInt16LE(16, 2);
    b.writeUInt32LE(b.length, 4);
    b.writeUInt32LE(0xffffffff, 16);
    b.writeUInt32LE(nameIdx, 20);
    b.writeUInt16LE(20, 24);
    b.writeUInt16LE(20, 26);
    b.writeUInt16LE(attrs.length, 28);
    attrs.forEach(([nameI, raw, type, data], i) => {
      const a = 36 + i * 20;
      b.writeUInt32LE(0xffffffff, a);
      b.writeUInt32LE(nameI, a + 4);
      b.writeUInt32LE(raw, a + 8);
      b.writeUInt16LE(8, a + 12);
      b[a + 15] = type;
      b.writeUInt32LE(data, a + 16);
    });
    return b;
  };
  const NONE = 0xffffffff;
  const manifestEl = element(4, [
    [0, NONE, 0x10, code],
    [1, 7, 0x03, 7],
    [3, 6, 0x03, 6],
  ]);
  const appEl = element(5, [[2, NONE, 0x12, debuggable ? 0xffffffff : 0]]);
  const chunks = Buffer.concat([pool, map, manifestEl, appEl]);
  const head = Buffer.alloc(8);
  head.writeUInt16LE(0x0003, 0);
  head.writeUInt16LE(8, 2);
  head.writeUInt32LE(8 + chunks.length, 4);
  return Buffer.concat([head, chunks]);
}

const apk = (opts: { pkg?: string; code?: number; name?: string; debuggable?: boolean; url?: string | null }) =>
  zip({
    "AndroidManifest.xml": manifest({ pkg: opts.pkg ?? APP_ID, code: opts.code ?? 3, name: opts.name ?? "1.0.2", debuggable: opts.debuggable ?? false }),
    ...(opts.url !== null ? { "assets/capacitor.config.json": Buffer.from(JSON.stringify({ server: { url: opts.url ?? "https://attendance.example.org/dashboard" } })) } : {}),
  });

describe("readApk", () => {
  it("reads the version, app id, debug flag and address", () => {
    expect(readApk(apk({ code: 7, name: "1.2.0", url: "https://hr.example.org/dashboard" }))).toEqual({
      appId: APP_ID,
      versionCode: 7,
      versionName: "1.2.0",
      debuggable: false,
      serverUrl: "https://hr.example.org/dashboard",
    });
  });

  it("spots a debug build", () => {
    expect(readApk(apk({ debuggable: true })).debuggable).toBe(true);
  });

  it("rejects files that aren't apps", () => {
    expect(() => readApk(Buffer.from("not a zip at all, just text"))).toThrow(ApkReadError);
    expect(() => readApk(zip({ "readme.txt": Buffer.from("hi") }))).toThrow(ApkReadError);
  });
});

describe("apkProblem", () => {
  const ok = { appId: APP_ID, debuggable: false, serverUrl: "https://attendance.example.org/dashboard" };

  it("accepts a signed release build for a public https address", () => {
    expect(apkProblem(ok)).toBeNull();
  });

  it.each([
    ["a test build", { ...ok, debuggable: true }],
    ["another app", { ...ok, appId: "com.other.app" }],
    ["no address", { ...ok, serverUrl: null }],
    ["localhost", { ...ok, serverUrl: "http://localhost:6001/dashboard" }],
    ["plain http", { ...ok, serverUrl: "http://attendance.example.org/dashboard" }],
    ["the office network", { ...ok, serverUrl: "https://192.168.1.19:6001/dashboard" }],
    ["a quick tunnel", { ...ok, serverUrl: "https://random-words.trycloudflare.com/dashboard" }],
  ])("refuses %s", (_label, input) => {
    expect(apkProblem(input)).toMatch(/./);
  });
});
