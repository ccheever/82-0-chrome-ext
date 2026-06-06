#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
mkdirSync(dist, { recursive: true });

const read = (path) => readFileSync(resolve(root, path), "utf8");
const css = read("src/overlay.css");
const sources = [
  "src/lib/engine.js",
  "src/lib/policy.js",
  "src/lib/board.js",
  "src/content.js",
].map(read);

const bootstrap = `(() => {
  document.querySelectorAll("#c820-coach").forEach((el) => el.remove());
  document.querySelectorAll(".c820-rec").forEach((el) => el.classList.remove("c820-rec"));
  document.getElementById("c820-bookmarklet-style")?.remove();
  globalThis.C820 = {};
  const style = document.createElement("style");
  style.id = "c820-bookmarklet-style";
  style.textContent = ${JSON.stringify(css)};
  document.documentElement.appendChild(style);
${sources.join("\n")}
})();`;

const bookmarklet = `javascript:${encodeURIComponent(bootstrap)}`;
const txtPath = resolve(dist, "82-0-coach-mobile-bookmarklet.txt");
const htmlPath = resolve(dist, "82-0-coach-mobile-bookmarklet.html");

writeFileSync(txtPath, `${bookmarklet}\n`);
writeFileSync(
  htmlPath,
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>82-0 Coach Mobile Bookmarklet</title>
  <style>
    body { margin: 0; font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b0d14; color: #e6e8ee; }
    main { max-width: 720px; margin: 0 auto; padding: 24px 16px 40px; }
    h1 { font-size: 24px; margin: 0 0 10px; }
    p { color: #b8bfce; }
    textarea { box-sizing: border-box; width: 100%; min-height: 180px; border: 1px solid #394154; border-radius: 8px; padding: 12px; color: #e6e8ee; background: #111622; font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
    button { display: inline-flex; align-items: center; border: 0; border-radius: 8px; padding: 11px 14px; margin: 12px 0; background: #22c55e; color: #062012; font-weight: 800; }
    ol { padding-left: 22px; }
    li { margin: 8px 0; }
    code { color: #f3c074; }
  </style>
</head>
<body>
  <main>
    <h1>82-0 Coach Mobile Bookmarklet</h1>
    <p>This is a Safari-on-iPhone trial path. It runs the coach from a bookmark on <code>82-0.com</code> without installing an iOS extension. It is best for Classic mode because HoopIQ hides stats that the real extension loads from its bundled dataset.</p>
    <button id="copy" type="button">Copy Bookmarklet</button>
    <textarea id="code" readonly>${bookmarklet.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</textarea>
    <ol>
      <li>Tap <strong>Copy Bookmarklet</strong>.</li>
      <li>Open any page in Safari, add a bookmark, and name it <strong>82-0 Coach</strong>.</li>
      <li>Edit that bookmark and replace its address with the copied <code>javascript:</code> text.</li>
      <li>Open <code>https://82-0.com</code>, start Classic mode, then choose the <strong>82-0 Coach</strong> bookmark.</li>
    </ol>
  </main>
  <script>
    const code = document.getElementById("code");
    document.getElementById("copy").addEventListener("click", async () => {
      code.select();
      code.setSelectionRange(0, code.value.length);
      await navigator.clipboard.writeText(code.value);
    });
  </script>
</body>
</html>
`,
);

console.log(`Bookmarklet: ${txtPath}`);
console.log(`Install page: ${htmlPath}`);
console.log(`Length: ${bookmarklet.length} bytes`);
