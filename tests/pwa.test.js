import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));

test("declares installable DuoBalance metadata and correctly sized icons", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));

  assert.equal(manifest.name, "DuoBalance - Finanzas en Pareja");
  assert.equal(manifest.short_name, "DuoBalance");
  assert.equal(manifest.start_url, "./index.html");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.background_color, "#111d35");
  assert.equal(manifest.theme_color, "#111d35");
  assert.equal(manifest.orientation, "portrait");

  for (const icon of manifest.icons) {
    assert.equal(icon.purpose, "any maskable");
    const png = await readFile(path.join(root, icon.src));
    assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});

test("pre-caches existing local app-shell assets in the service worker", async () => {
  const serviceWorker = await readFile(path.join(root, "sw.js"), "utf8");
  const assetBlock = serviceWorker.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(assetBlock);

  const assets = [...assetBlock[1].matchAll(/"(\.\/[^"]+)"/g)]
    .map((match) => match[1]);
  assert.ok(assets.includes("./index.html"));
  assert.ok(assets.includes("./manifest.json"));
  assert.ok(assets.includes("./styles.css"));
  assert.ok(assets.includes("./app.js"));

  for (const asset of assets) {
    await assert.doesNotReject(readFile(path.join(root, asset)));
  }

  assert.match(serviceWorker, /addEventListener\("install"/);
  assert.match(serviceWorker, /addEventListener\("activate"/);
  assert.match(serviceWorker, /addEventListener\("fetch"/);
});

test("provides PWA metadata and install controls in the page", async () => {
  const html = await readFile(path.join(root, "index.html"), "utf8");

  assert.match(html, /rel="manifest" href="\.\/manifest\.json"/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover"/);
  assert.match(html, /name="theme-color" content="#111d35"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(html, /rel="apple-touch-icon" href="\.\/icons\/icon-192\.png"/);
  assert.match(html, /data-pwa-install/);
  assert.match(html, /Toca Compartir y luego “Agregar al inicio”/);
});

test("shows the main goal and other plans before monthly contributions and advice", async () => {
  const html = await readFile(path.join(root, "index.html"), "utf8");
  const goalsView = html.slice(
    html.indexOf('<section id="view-goals"'),
    html.indexOf('<section id="view-balance"'),
  );
  const heroPosition = goalsView.indexOf("savings-hero-card");
  const plansPosition = goalsView.indexOf("secondary-goals");
  const monthlyPosition = goalsView.indexOf("monthly-savings-card");
  const tipPosition = goalsView.indexOf("tip-card");
  const monthlyEndPosition = goalsView.indexOf("</section>", monthlyPosition);
  const settingsView = html.slice(
    html.indexOf('<section id="view-settings"'),
    html.indexOf("</main>"),
  );

  assert.ok(heroPosition >= 0);
  assert.ok(plansPosition > heroPosition);
  assert.ok(monthlyPosition > plansPosition);
  assert.ok(tipPosition > monthlyPosition && tipPosition < monthlyEndPosition);
  assert.doesNotMatch(settingsView, /tip-card/);
});
