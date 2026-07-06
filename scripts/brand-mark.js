#!/usr/bin/env node
// Regenerate Hearth's brand assets from one source of truth.
//
//   node scripts/brand-mark.js
//
// Writes client/public/{favicon.svg, icon-192.png, icon-512.png}. The React
// component client/src/components/HearthMark.tsx mirrors this exact geometry.
//
// The mark: a minimal terminal window with an ember prompt — the web terminal
// distilled to one glyph. SVG is authored in a 48-unit space; PNGs are
// rasterised with headless Chromium. Chromium's old-headless has a ~256px
// minimum window, so small icons are rendered large and box-downscaled to an
// exact size (a tiny pure-Node PNG codec below — no image deps required).
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const GRAD = `<linearGradient id="hg" x1="6" y1="40" x2="42" y2="8" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#ff5f2e"/><stop offset=".55" stop-color="#ff7a45"/><stop offset="1" stop-color="#ffb454"/></linearGradient>`;

// Window frame + hairline title rail + ">" caret + lit cursor underscore.
function mark(stroke = "url(#hg)", cursor = "#ffb454") {
  return (
    `<rect x="8" y="10.5" width="32" height="27" rx="7.5" fill="none" stroke="${stroke}" stroke-width="3"/>` +
    `<path d="M8.6 17.5 H39.4" stroke="${stroke}" stroke-width="2" opacity=".45"/>` +
    `<path d="M16 23 L21.5 27 L16 31" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<rect x="24.5" y="29" width="8.5" height="2.8" rx="1.4" fill="${cursor}"/>`
  );
}

// Always author in the 48-unit viewBox; width/height scales it up cleanly.
function svg(side, tile) {
  const bg = tile ? `<rect width="48" height="48" rx="${48 * 0.24}" fill="#17130E"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 48 48" style="display:block"><defs>${GRAD}</defs>${bg}<g>${mark()}</g></svg>`;
}

// ---- tiny PNG codec (8-bit, non-interlaced, RGB/RGBA) --------------------
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

function decode(buf) {
  let p = 8, w = 0, h = 0, ch = 4; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString("ascii", p + 4, p + 8); const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ch = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 4; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]; const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride); const orow = out.subarray(y * stride, y * stride + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? orow[x - ch] : 0, b = y > 0 ? out[(y - 1) * stride + x] : 0, c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0;
      let v = row[x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1; else if (ft === 4) v += paeth(a, b, c);
      orow[x] = v & 0xff;
    }
  }
  return { w, h, ch, data: out };
}

function encode(w, h, ch, data) {
  const stride = w * ch, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunk = (type, body) => { const b = Buffer.concat([Buffer.from(type, "ascii"), body]); const out = Buffer.alloc(body.length + 12); out.writeUInt32BE(body.length, 0); b.copy(out, 4); out.writeUInt32BE(crc32(b), out.length - 4); return out; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// Box-downscale by an integer factor.
function downscale(img, f) {
  const w = img.w / f | 0, h = img.h / f | 0, ch = img.ch, out = Buffer.alloc(w * h * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) {
    let sum = 0; for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) sum += img.data[((y * f + dy) * img.w + (x * f + dx)) * ch + c];
    out[(y * w + x) * ch + c] = (sum / (f * f) + 0.5) | 0;
  }
  return { w, h, ch, data: out };
}

// ---- render ---------------------------------------------------------------
const PUB = path.resolve(__dirname, "../client/public");
const TMP = os.tmpdir();
const CHROME =
  process.env.CHROME ||
  ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/google-chrome"].find((p) => { try { return fs.existsSync(p); } catch { return false; } });

fs.writeFileSync(path.join(PUB, "favicon.svg"), svg(48, true) + "\n");
console.log("wrote favicon.svg");

if (!CHROME) {
  console.warn("no Chromium found — skipped PNG icons (set CHROME=<path> to enable)");
} else {
  const shoot = (side, file) => {
    const html = path.join(TMP, `hearth-icon-${side}.html`);
    fs.writeFileSync(html, `<!doctype html><html style="margin:0"><body style="margin:0;background:#17130E">${svg(side, true)}</body>`);
    execFileSync(CHROME, ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
      "--force-device-scale-factor=1", `--window-size=${side},${side}`, `--screenshot=${file}`, `file://${html}`], { stdio: "ignore" });
  };
  // 512 renders correctly at native size (above Chromium's ~256px min window).
  shoot(512, path.join(PUB, "icon-512.png"));
  console.log("wrote icon-512.png");
  // 192 would mis-scale at native size → render 3× (576) then box-downscale.
  const big = path.join(TMP, "hearth-icon-576.png");
  shoot(576, big);
  fs.writeFileSync(path.join(PUB, "icon-192.png"), encode192(downscale(decode(fs.readFileSync(big)), 3)));
  console.log("wrote icon-192.png (576→192)");
}
function encode192(img) { return encode(img.w, img.h, img.ch, img.data); }
