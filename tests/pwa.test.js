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
  assert.equal(manifest.background_color, "#172d4d");
  assert.equal(manifest.theme_color, "#172d4d");
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
  assert.match(html, /name="theme-color" content="#172d4d"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(html, /rel="apple-touch-icon" href="\.\/icons\/icon-192\.png"/);
  assert.match(html, /data-pwa-install/);
  assert.match(html, /Toca Compartir y luego “Agregar al inicio”/);
});

test("provides accessible password visibility and account creation controls", async () => {
  const html = await readFile(path.join(root, "index.html"), "utf8");
  const app = await readFile(path.join(root, "app.js"), "utf8");

  assert.match(html, /data-toggle-password aria-label="Mostrar contraseña"/);
  assert.match(html, /id="signup-name" name="displayName"/);
  assert.match(html, /data-toggle-auth-mode>¿Primera vez aquí\? Crear cuenta de pareja/);
  assert.match(html, /data-auth-submit/);
  assert.match(app, /¡Enlace enviado!/);
  assert.match(app, /function isValidEmail/);
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

test("does not render a pending settlement card in the Balance view", async () => {
  const html = await readFile(path.join(root, "index.html"), "utf8");
  const styles = await readFile(path.join(root, "styles.css"), "utf8");
  const balanceView = html.slice(
    html.indexOf('<section id="view-balance"'),
    html.indexOf('<section id="view-movements"'),
  );

  assert.doesNotMatch(balanceView, /Pendientes|saldo por liquidar|Te deben|Debes|Saldar|data-dashboard-settle/);
  assert.match(balanceView, /Fondo Disponible/);
  assert.match(balanceView, /data-dashboard-month-savings/);
  assert.match(balanceView, /data-dashboard-transfer/);
  assert.match(balanceView, /data-dashboard-my-contribution[\s\S]*data-dashboard-partner-contribution[\s\S]*dashboard-projection-card/);
  assert.match(styles, /\.dashboard-contributions-grid\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)/);
  assert.match(styles, /\.dashboard-projection-card/);
  assert.match(balanceView, /Fondo común · total ahorrado/);
});

test("provides an accessible shared-goal editing dialog and interactive goal cards", async () => {
  const html = await readFile(path.join(root, "index.html"), "utf8");
  const renderer = await readFile(path.join(root, "src/presentation/render.js"), "utf8");
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const styles = await readFile(path.join(root, "styles.css"), "utf8");

  assert.match(html, /<dialog id="goal-edit-dialog"/);
  assert.match(html, /name="titulo" type="text" minlength="3"/);
  assert.match(html, /name="montoObjetivo" type="number" min="0\.01"/);
  assert.match(html, /accept="image\/\*"/);
  assert.match(html, /data-remove-goal-cover hidden/);
  assert.match(renderer, /data-edit-goal="\$\{escapeHtml\(goal\.id\)\}"/);
  assert.match(renderer, /Fijar como meta principal/);
  assert.match(renderer, /data-movement-type="transferencia_meta"/);
  assert.match(app, /function handleGoalCardClick/);
  assert.match(app, /function handleGoalCardKeyDown/);
  assert.match(styles, /\.goal-edit-dialog\s*\{/);
  assert.match(styles, /\.goal-card:active/);
});

test("renders secondary goals as a compact carousel and supports primary promotion", async () => {
  const html = await readFile(path.join(root, "index.html"), "utf8");
  const renderer = await readFile(path.join(root, "src/presentation/render.js"), "utf8");
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const styles = await readFile(path.join(root, "styles.css"), "utf8");
  const themeToggle = await readFile(
    path.join(root, "src/presentation/components/ThemeToggle.js"),
    "utf8",
  );

  assert.match(styles, /\.goal-selector\s*\{[^}]*display:\s*flex;[^}]*overflow-x:\s*auto;[^}]*scroll-snap-type:\s*x mandatory;/s);
  assert.match(styles, /\.goal-selector-card\.is-single\s*\{[^}]*flex-basis:\s*100%;/s);
  assert.match(renderer, /goal\.cover_image_url[\s\S]*goal-selector-cover/);
  assert.match(renderer, /data-select-goal=/);
  assert.match(renderer, /onSelectPrimary\(selectedGoalId\)/);
  assert.match(html, /data-primary-goal/);
  assert.match(html, /data-primary-goal-label/);
  assert.match(app, /savePrimaryGoal\(goal\.id\)/);
  assert.match(app, /scrollIntoView\(\{ behavior: "smooth"/);
  assert.match(themeToggle, /isLight \? "#e3eee6"/);
});

test("provides monthly savings quota setup and progress UI", async () => {
  const html = await readFile(path.join(root, "index.html"), "utf8");
  const renderer = await readFile(path.join(root, "src/presentation/render.js"), "utf8");
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const worker = await readFile(path.join(root, "sw.js"), "utf8");
  const quota = await readFile(path.join(root, "src/application/monthly-quota.js"), "utf8");

  assert.match(html, /Configurar cuotas mensuales/);
  assert.match(html, /id="monthly-quota-dialog"/);
  assert.match(html, /name="juan" type="text" inputmode="numeric"/);
  assert.match(html, /name="isa" type="text" inputmode="numeric"/);
  assert.match(html, /data-monthly-quota-total/);
  assert.match(html, /data-monthly-quota-projection/);
  assert.match(renderer, /data-monthly-quota-projection/);
  assert.match(renderer, /Al ritmo de/);
  assert.match(app, /monthlyQuota: \{ juan, isa \}/);
  assert.match(app, /duobalance-monthly-quota-/);
  assert.match(worker, /"\.\/src\/application\/monthly-quota\.js"/);
  assert.match(quota, /Math\.ceil\(remaining \/ monthlyTotal\)/);
});
