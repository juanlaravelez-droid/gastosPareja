const THEME_STORAGE_KEY = "duobalance-theme";

export class ThemeToggle {
  constructor(storage, onError = () => {}) {
    this.storage = storage;
    this.onError = onError;
    this.button = document.querySelector("#theme-toggle");
    this.systemTheme = window.matchMedia("(prefers-color-scheme: light)");
    this.hasStoredPreference = false;
  }

  initialize() {
    let theme = this.systemTheme.matches ? "light" : "dark";
    try {
      const savedTheme = this.storage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === "light" || savedTheme === "dark") {
        theme = savedTheme;
        this.hasStoredPreference = true;
      }
    } catch (error) {
      console.error("No se pudo leer la preferencia de tema.", error);
      this.onError("No se pudo leer la preferencia de tema.");
    }

    this.apply(theme);
    this.button?.addEventListener("click", () => {
      const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      this.apply(nextTheme);
      this.hasStoredPreference = true;
      try {
        this.storage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch (error) {
        console.error("No se pudo guardar la preferencia de tema.", error);
        this.onError("No se pudo guardar el tema; se conservará hasta cerrar esta página.");
      }
    });

    this.systemTheme.addEventListener("change", (event) => {
      if (!this.hasStoredPreference) this.apply(event.matches ? "light" : "dark");
    });
  }

  apply(theme) {
    const isLight = theme === "light";
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
    this.button?.setAttribute("aria-pressed", String(isLight));
    this.button?.setAttribute("aria-label", `Cambiar al tema ${isLight ? "oscuro" : "claro"}`);
    const icon = this.button?.querySelector(".theme-icon");
    const label = this.button?.querySelector("[data-theme-label]");
    if (icon) icon.textContent = isLight ? "🌙" : "☀️";
    if (label) label.textContent = isLight ? "Tema oscuro" : "Tema claro";
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      isLight ? "#CFE8E1" : "#0d1a2d",
    );
  }
}
