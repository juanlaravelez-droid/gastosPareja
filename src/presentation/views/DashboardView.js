const BALANCE_VISIBILITY_KEY = "duobalance-privacy-mode";

const icons = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"></path>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle>',
  eyeOff: '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a14 14 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7a10.7 10.7 0 0 0 3-.4"></path>',
  sliders: '<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6"></path>',
  dashboard: '<rect x="3" y="3" width="8" height="8" rx="2"></rect><rect x="13" y="3" width="8" height="5" rx="2"></rect><rect x="13" y="10" width="8" height="11" rx="2"></rect><rect x="3" y="13" width="8" height="8" rx="2"></rect>',
  wallet: '<rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M3 9h18M16 15h.01M7 5V3h11"></path>',
  chart: '<path d="M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20"></path>',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"></path><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8Z"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
};

function icon(name, className = "") {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

export class DashboardView {
  constructor({
    root = document.querySelector("#finance-dashboard"),
    storage,
    formatCurrency,
    onQuickExpense,
    onSettle,
    onNotifications,
    onError = (error, message) => console.error(message, error),
  }) {
    if (!root) throw new Error("No se encontró el contenedor del dashboard financiero.");
    this.root = root;
    this.storage = storage;
    this.formatCurrency = formatCurrency;
    this.onQuickExpense = onQuickExpense;
    this.onSettle = onSettle;
    this.onNotifications = onNotifications;
    this.onError = onError;
    this.metrics = null;
    this.balancesVisible = this.readVisibilityPreference();
    this.bindEvents();
    this.setBalancesVisible(this.balancesVisible);
  }

  readVisibilityPreference() {
    try {
      return this.storage.getItem(BALANCE_VISIBILITY_KEY) !== "false";
    } catch (error) {
      this.onError(error, "No se pudo leer la preferencia de visibilidad de saldos.");
      return true;
    }
  }

  setBalancesVisible(visible) {
    this.balancesVisible = visible;
    this.root.dataset.balancesVisible = String(visible);
    this.root.querySelectorAll("[data-dashboard-balance]").forEach((element) => {
      element.textContent = visible ? element.dataset.value || "—" : "$ ••••••";
      element.classList.toggle("is-masked", !visible);
    });
    const monthCaption = this.root.querySelector("[data-dashboard-month-caption]");
    if (monthCaption?.dataset.value) {
      monthCaption.textContent = visible
        ? monthCaption.dataset.value
        : "Gastado este mes: $ ••••••";
      monthCaption.classList.toggle("is-masked", !visible);
    }
    const button = document.querySelector("#btn-toggle-visibility");
    if (button) {
      button.setAttribute("aria-pressed", String(!visible));
      button.setAttribute("aria-label", visible ? "Ocultar saldos" : "Mostrar saldos");
      button.innerHTML = `${icon(visible ? "eye" : "eyeOff")}<span class="visually-hidden">${visible ? "Ocultar saldos" : "Mostrar saldos"}</span>`;
    }
  }

  bindEvents() {
    document.querySelector("#btn-toggle-visibility")?.addEventListener("click", () => {
      const visible = !this.balancesVisible;
      this.setBalancesVisible(visible);
      try {
        this.storage.setItem(BALANCE_VISIBILITY_KEY, String(visible));
      } catch (error) {
        this.onError(error, "No se pudo guardar la preferencia de visibilidad de saldos.");
      }
    });
    this.root.querySelector("[data-dashboard-quick-expense]")?.addEventListener("click", () => {
      this.onQuickExpense();
    });
    this.root.querySelectorAll("[data-dashboard-settle]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.metrics?.settlementAmount > 0) this.onSettle(this.metrics);
      });
    });
    document.querySelector("[data-dashboard-notifications]")?.addEventListener("click", () => {
      this.onNotifications(this.metrics);
    });
    this.root.querySelector("[data-dashboard-report-filter]")?.addEventListener("click", () => {
      document.querySelector("#tab-movements")?.click();
    });
  }

  updateMetrics(summaryData) {
    this.metrics = summaryData;
    const setText = (selector, value) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = value;
    };
    const setMoney = (selector, value) => {
      const element = this.root.querySelector(selector);
      if (!element) return;
      element.dataset.value = this.formatCurrency(value);
      element.textContent = this.balancesVisible ? element.dataset.value : "$ ••••••";
      element.classList.toggle("is-masked", !this.balancesVisible);
    };
    const monthTitle = this.root.querySelector("[data-dashboard-month-title]");
    if (monthTitle) monthTitle.textContent = `Tu resumen de ${summaryData.monthLabel}`;

    setText("[data-dashboard-user]", summaryData.currentUserName);
    setText("[data-dashboard-avatar]", summaryData.avatarInitials);
    setText("[data-dashboard-pending]", String(summaryData.pendingCount));
    setText("[data-dashboard-overdue]", String(summaryData.overdueCount));
    setText("[data-dashboard-paid]", String(summaryData.paidCount));
    setText("[data-dashboard-balance-label]", summaryData.netBalance > 0
      ? "Te deben"
      : summaryData.netBalance < 0
        ? "Debes"
        : "En balance");
    setText("[data-dashboard-balance-caption]", summaryData.netBalance > 0
      ? `A tu favor frente a ${summaryData.partnerName}`
      : summaryData.netBalance < 0
        ? `Pendiente con ${summaryData.partnerName}`
        : "Sin saldos pendientes entre ustedes");
    const monthCaption = this.root.querySelector("[data-dashboard-month-caption]");
    if (monthCaption) {
      monthCaption.dataset.value = `Gastado este mes: ${this.formatCurrency(summaryData.monthExpenseTotal)}`;
      monthCaption.textContent = this.balancesVisible
        ? monthCaption.dataset.value
        : "Gastado este mes: $ ••••••";
      monthCaption.classList.toggle("is-masked", !this.balancesVisible);
    }
    setText("[data-dashboard-projection-note]", "Proyección según el ritmo de gasto actual");
    setText("[data-dashboard-upcoming]", "Todo en orden para el próximo mes");
    setMoney("[data-dashboard-net-balance]", Math.abs(summaryData.netBalance));
    setMoney("[data-dashboard-projection]", summaryData.projectedMonthExpense);
    setMoney("[data-dashboard-my-contribution]", summaryData.personalContribution);
    setMoney("[data-dashboard-partner-contribution]", summaryData.partnerContribution);
    setMoney("[data-dashboard-savings]", summaryData.savedTotal);

    const balanceCard = this.root.querySelector("[data-dashboard-net-card]");
    balanceCard?.classList.toggle("is-credit", summaryData.netBalance > 0);
    balanceCard?.classList.toggle("is-debt", summaryData.netBalance < 0);
    const canSettle = summaryData.settlementAmount > 0
      && summaryData.settlementPayerId === summaryData.currentUserId;
    this.root.querySelectorAll("[data-dashboard-settle]").forEach((settlementButton) => {
      settlementButton.disabled = !canSettle;
      settlementButton.textContent = canSettle ? "Saldar" : "Esperando pago";
      settlementButton.setAttribute("aria-label", canSettle
        ? `Saldar cuenta con ${summaryData.settlementReceiverName}`
        : "Esperando el pago de tu pareja");
    });
    const notificationBadge = document.querySelector("[data-dashboard-notification-count]");
    if (notificationBadge) {
      notificationBadge.textContent = String(summaryData.pendingCount);
      notificationBadge.hidden = summaryData.pendingCount === 0;
    }
  }
}
