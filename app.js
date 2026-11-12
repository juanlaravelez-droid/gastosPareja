import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config.example.js";
import {
  validateExpense,
  validateGoal,
  validateGoalContribution,
  validateIncome,
} from "./src/application/wallet-validation.js";
import {
  formatMonthlyQuotaInput,
  getMonthlyQuotaProjection,
  parseMonthlyQuota,
} from "./src/application/monthly-quota.js?v=1";
import {
  prepareGoalCover,
  readGoalCoverAsDataUrl,
} from "./src/application/goal-cover.js?v=2";
import {
  calculateAvailableBalance,
  getDashboardSummary,
} from "./src/application/wallet-service.js?v=3";
import { createDemoStorage } from "./src/infrastructure/demo-storage.js?v=2";
import { createSupabaseRepository } from "./src/infrastructure/supabase-repository.js?v=3";
import { addExpense, deleteExpense } from "./src/application/expense-service.js?v=2";
import { createStorageRepository } from "./src/infrastructure/storage-repository.js?v=1";
import { createRenderer } from "./src/presentation/render.js?v=6";
import { createUi } from "./src/presentation/ui.js?v=4";
import { ThemeToggle } from "./src/presentation/components/ThemeToggle.js?v=2";
import { AppNavigation } from "./src/presentation/navigation.js?v=2";
import { DashboardView } from "./src/presentation/views/DashboardView.js?v=3";
import { formatCurrency } from "./src/presentation/formatCurrency.js";
let supabaseRepository;
let appNavigation;
const storageRepository = createStorageRepository();
const demoStorage = createDemoStorage(storageRepository);
const DEMO_BANNER_DISMISSED_KEY = "duo_dismiss_demo_banner";
const expenseDeleteTimers = new WeakMap();
let demoMode = false;
let state = {
  user: null,
  wallet: null,
  memberIndex: null,
  members: [],
  incomes: [],
  expenses: [],
  settlements: [],
  goals: [],
  goalContributions: [],
};
let workspaceRequest = 0;
let deferredInstallPrompt = null;
let installBannerDismissed = false;
let authMode = "login";
const { notify, showFormMessage, showRandomTip, showView } = createUi(storageRepository);
const themeToggle = new ThemeToggle(storageRepository, (message) => notify(message, true));
const dashboardView = new DashboardView({
  storage: storageRepository,
  formatCurrency,
  onQuickExpense: () => appNavigation?.openExpenseModal("gasto"),
  onTransfer: openGoalTransferDialog,
  onNotifications: () => notify("No hay notificaciones nuevas."),
  onError: (error, message) => {
    console.error(message, error);
    notify("No se pudo guardar la preferencia del dashboard.", true);
  },
});
const { renderApp } = createRenderer({
  getState: () => state,
  getDemoMode: () => demoMode,
  formatCurrency,
  escapeHtml,
  dashboardView,
  onSelectPrimary: selectPrimaryGoal,
});

function getPrimaryGoalStorageKey(walletId) {
  return `duobalance-primary-goal-${walletId}`;
}

function getMonthlyQuotaStorageKey(walletId) {
  return `duobalance-monthly-quota-${walletId}`;
}

function readMonthlyQuota(walletId) {
  try {
    const stored = storageRepository.getItem(getMonthlyQuotaStorageKey(walletId));
    if (!stored) return null;
    const value = JSON.parse(stored);
    if (
      Number.isSafeInteger(value?.monthlyQuota?.juan)
      && value.monthlyQuota.juan >= 0
      && Number.isSafeInteger(value.monthlyQuota.isa)
      && value.monthlyQuota.isa >= 0
      && value.monthlyQuota.juan + value.monthlyQuota.isa > 0
    ) {
      return value;
    }
    throw new Error("La configuración de cuotas mensuales guardada no es válida.");
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error("No se pudo interpretar la configuración de cuotas mensuales.", error);
    } else if (error.message !== "La configuración de cuotas mensuales guardada no es válida.") {
      console.error("No se pudo leer la configuración de cuotas mensuales.", error);
    } else {
      console.error(error.message, error);
    }
    notify("No se pudieron cargar las cuotas mensuales guardadas.", true);
    return null;
  }
}

function openMonthlyQuotaDialog() {
  const form = document.querySelector("#form-monthly-quota");
  const quota = state.monthlyQuota?.monthlyQuota;
  form.elements.namedItem("juan").value = quota ? formatMonthlyQuotaInput(quota.juan) : "";
  form.elements.namedItem("isa").value = quota ? formatMonthlyQuotaInput(quota.isa) : "";
  document.querySelector('[data-quota-member-name="one"]').textContent = state.wallet.nombre_miembro1;
  document.querySelector('[data-quota-member-name="two"]').textContent = state.wallet.nombre_miembro2;
  document.querySelector("[data-monthly-quota-error]").hidden = true;
  updateMonthlyQuotaTotal();
  document.querySelector("#monthly-quota-dialog").showModal();
  form.elements.namedItem("juan").focus();
}

function updateMonthlyQuotaTotal() {
  const form = document.querySelector("#form-monthly-quota");
  const first = parseMonthlyQuota(form.elements.namedItem("juan").value);
  const second = parseMonthlyQuota(form.elements.namedItem("isa").value);
  const total = (first || 0) + (second || 0);
  document.querySelector("[data-monthly-quota-total]").textContent =
    `${formatCurrency(total)}/mes`;
}

function formatMonthlyQuotaField(input) {
  const formatted = formatMonthlyQuotaInput(input.value);
  const cursorFromEnd = input.value.length - input.selectionStart;
  input.value = formatted;
  const nextPosition = Math.max(0, formatted.length - cursorFromEnd);
  input.setSelectionRange(nextPosition, nextPosition);
  updateMonthlyQuotaTotal();
}

function handleSaveMonthlyQuota(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const juan = parseMonthlyQuota(form.elements.namedItem("juan").value);
  const isa = parseMonthlyQuota(form.elements.namedItem("isa").value);
  const error = document.querySelector("[data-monthly-quota-error]");
  if (juan === null || isa === null) {
    error.textContent = "Ingresa montos válidos dentro del límite permitido.";
    error.hidden = false;
    return;
  }
  if (!Number.isSafeInteger(juan + isa)) {
    error.textContent = "La suma de las cuotas supera el monto máximo permitido.";
    error.hidden = false;
    return;
  }
  if (juan + isa === 0) {
    error.textContent = "El total de las cuotas debe ser mayor que cero.";
    error.hidden = false;
    return;
  }

  const quotaState = { monthlyQuota: { juan, isa } };
  try {
    storageRepository.setItem(
      getMonthlyQuotaStorageKey(state.wallet.id),
      JSON.stringify(quotaState),
    );
  } catch (storageError) {
    console.error("No se pudieron guardar las cuotas mensuales.", storageError);
    error.textContent = "No se pudieron guardar las cuotas en este dispositivo. Libera espacio e inténtalo de nuevo.";
    error.hidden = false;
    return;
  }

  state.monthlyQuota = quotaState;
  renderApp();
  document.querySelector("#monthly-quota-dialog").close();
  notify("Cuotas mensuales guardadas.");
}

function savePrimaryGoal(goalId) {
  state.primaryGoalId = goalId;
  try {
    storageRepository.setItem(getPrimaryGoalStorageKey(state.wallet.id), goalId);
  } catch (error) {
    console.error("No se pudo guardar la meta principal en este dispositivo.", error);
    notify("La meta principal cambió, pero no se pudo guardar esta preferencia en el dispositivo.", true);
  }
}

function selectPrimaryGoal(goalId) {
  savePrimaryGoal(goalId);
  notify("Meta principal actualizada.");
}

function loadPrimaryGoal(walletId, goals) {
  try {
    const savedGoalId = storageRepository.getItem(getPrimaryGoalStorageKey(walletId));
    return goals.some((goal) => goal.id === savedGoalId) ? savedGoalId : null;
  } catch (error) {
    console.error("No se pudo leer la meta principal guardada.", error);
    notify("No se pudo recuperar la meta principal guardada en este dispositivo.", true);
    return null;
  }
}

function openGoalEditor(goalId) {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) {
    notify("No se encontró la meta seleccionada.", true);
    return;
  }

  const form = document.querySelector("#form-edit-goal");
  form.dataset.goalId = goal.id;
  form.elements.namedItem("titulo").value = goal.title;
  form.elements.namedItem("montoObjetivo").value = Number(goal.target_amount);
  form.elements.namedItem("montoObjetivo").min = String(Number(goal.current_amount));
  form.elements.namedItem("fechaObjetivo").value = goal.target_date || "";
  const primaryToggle = form.querySelector("[data-primary-goal]");
  const isPrimary = state.primaryGoalId === goal.id;
  primaryToggle.checked = isPrimary;
  primaryToggle.disabled = isPrimary;
  form.querySelector("[data-primary-goal-label]").textContent = isPrimary
    ? "Esta es actualmente tu meta principal"
    : "Establecer como Meta Principal";
  document.querySelector("#goal-edit-title").textContent = `Editar ${goal.title}`;
  updateGoalEditorProgress(goal);
  updateGoalEditorPreview(goal);
  document.querySelector("#goal-edit-dialog").showModal();
  form.elements.namedItem("titulo").focus();
}

function updateGoalEditorProgress(goal = state.goals.find((item) =>
  item.id === document.querySelector("#form-edit-goal").dataset.goalId)) {
  if (!goal) return;
  const targetAmount = Number(document.querySelector('#form-edit-goal [name="montoObjetivo"]').value);
  const savedAmount = Number(goal.current_amount);
  const progress = Number.isFinite(targetAmount) && targetAmount > 0
    ? Math.min(100, Math.round(savedAmount / targetAmount * 100))
    : 0;
  document.querySelector("[data-goal-editor-progress]").textContent =
    `${formatCurrency(savedAmount)} ahorrados · ${progress}% del nuevo objetivo`;
}

function updateGoalEditorPreview(goal) {
  const preview = document.querySelector("[data-goal-edit-preview]");
  const placeholder = document.querySelector("[data-goal-edit-cover-placeholder]");
  const removeButton = document.querySelector("[data-remove-goal-cover]");
  const input = document.querySelector("[data-goal-cover-input]");
  const imageUrl = goal.cover_image_url || "";
  if (imageUrl) {
    preview.src = imageUrl;
    preview.hidden = false;
    placeholder.hidden = true;
  } else {
    preview.removeAttribute("src");
    preview.hidden = true;
    placeholder.hidden = false;
  }
  input.dataset.goalId = goal.id;
  removeButton.dataset.goalId = goal.id;
  removeButton.hidden = !imageUrl;
}

function getGoalTransferLimit(goalId) {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) return 0;
  const monthlyAvailable = getDashboardSummary(state).monthlyAvailableBalance;
  const walletAvailable = calculateAvailableBalance(state);
  const goalRemaining = Number(goal.target_amount) - Number(goal.current_amount);
  return Math.max(0, Math.min(monthlyAvailable, walletAvailable, goalRemaining));
}

function updateGoalTransferForm(resetAmount = false) {
  const form = document.querySelector("#form-transfer-goal");
  const select = form.elements.namedItem("goalId");
  const amountInput = form.elements.namedItem("montoAbonar");
  const goalId = select.value;
  const limit = getGoalTransferLimit(goalId);
  form.dataset.metaId = goalId;
  amountInput.max = String(limit);
  if (resetAmount) amountInput.value = limit > 0 ? limit.toFixed(2) : "";
  document.querySelector("[data-transfer-limit]").textContent =
    `Máximo disponible para esta meta: ${formatCurrency(limit)}`;
}

function openGoalTransferDialog() {
  const form = document.querySelector("#form-transfer-goal");
  if (!form.elements.namedItem("goalId").value) {
    notify("Primero crea una meta activa para transferir el ahorro.", true);
    return;
  }
  updateGoalTransferForm(true);
  document.querySelector("#dashboard-transfer-dialog").showModal();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function initializePwa() {
  const banner = document.querySelector("#pwa-install-banner");
  const installButton = document.querySelector("[data-pwa-install]");
  const dismissButton = document.querySelector("[data-pwa-dismiss]");
  const installHelp = document.querySelector("[data-pwa-install-help]");
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let isIosInstallGuide = false;

  if ("serviceWorker" in navigator) {
    const hadServiceWorkerController = Boolean(navigator.serviceWorker.controller);
    let updatedControllerPending = false;
    const reloadAfterUpdate = () => {
      if (
        !updatedControllerPending
        || document.visibilityState !== "visible"
        || document.querySelector("dialog[open], input:focus, select:focus, textarea:focus")
      ) return;
      updatedControllerPending = false;
      window.location.reload();
    };

    if (hadServiceWorkerController) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        updatedControllerPending = true;
        reloadAfterUpdate();
      }, { once: true });
      document.addEventListener("visibilitychange", reloadAfterUpdate);
      document.addEventListener("focusin", reloadAfterUpdate);
      document.addEventListener("focusout", () => {
        window.setTimeout(reloadAfterUpdate, 250);
      });
      document.addEventListener("close", reloadAfterUpdate, true);
    }

    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch((error) => {
        console.error("No se pudo actualizar el service worker de DuoBalance.", error);
      });
  }

  if (isStandalone) return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (!installBannerDismissed) banner.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    banner.hidden = true;
  });

  dismissButton.addEventListener("click", () => {
    installBannerDismissed = true;
    banner.hidden = true;
  });

  installButton.addEventListener("click", async () => {
    if (isIosInstallGuide) {
      installHelp.hidden = !installHelp.hidden;
      installButton.setAttribute("aria-expanded", String(!installHelp.hidden));
      return;
    }

    if (!deferredInstallPrompt) return;

    const installPrompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      banner.hidden = true;
    } catch (error) {
      console.error("No se pudo completar la instalación de DuoBalance.", error);
      banner.hidden = true;
    }
  });

  if (isIos) {
    isIosInstallGuide = true;
    installButton.setAttribute("aria-expanded", "false");
    banner.hidden = false;
  }
}

function hasSupabaseConfiguration() {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes("YOUR_PROJECT") &&
    !SUPABASE_ANON_KEY.includes("YOUR_PUBLIC")
  );
}

async function createConfiguredSupabaseRepository() {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  return createSupabaseRepository(createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
}

function getErrorMessage(error) {
  return error?.message || "Ocurrió un error inesperado. Inténtalo de nuevo.";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setAuthMessage(message, type = "info") {
  showFormMessage("#auth-message", message, type === "error");
  const element = document.querySelector("#auth-message");
  element.classList.toggle("is-success", type === "success");
  element.classList.toggle("is-loading", type === "loading");
}

function setAuthButtonLoading(button, isLoading, loadingText) {
  const label = button.querySelector(".button-label");
  if (isLoading) {
    button.dataset.idleContent = label.innerHTML;
    label.textContent = loadingText;
    button.disabled = true;
    button.classList.add("state-loading");
    return;
  }
  label.innerHTML = button.dataset.idleContent || label.innerHTML;
  button.disabled = false;
  button.classList.remove("state-loading");
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === "signup";
  document.querySelector("#auth-title").textContent = isSignup
    ? "Crear cuenta de pareja"
    : "Entren a su billetera";
  document.querySelector("#auth-intro").textContent = isSignup
    ? "Creen su cuenta para empezar. Después podrán configurar la billetera compartida e invitar a su pareja."
    : "Inicien sesión con su correo y contraseña. También pueden pedir un enlace mágico al correo.";
  document.querySelector("#signup-name-field").hidden = !isSignup;
  document.querySelector("#login-password").autocomplete = isSignup ? "new-password" : "current-password";
  document.querySelector("#login-password").value = "";
  document.querySelector("[data-auth-submit] .button-label").innerHTML = isSignup
    ? 'Crear cuenta <span aria-hidden="true">→</span>'
    : 'Iniciar sesión <span aria-hidden="true">→</span>';
  document.querySelector("[data-send-magic-link]").hidden = isSignup;
  document.querySelector("[data-toggle-auth-mode]").textContent = isSignup
    ? "¿Ya tienen cuenta? Iniciar sesión"
    : "¿Primera vez aquí? Crear cuenta de pareja";
  setAuthMessage("");
}

function togglePasswordVisibility() {
  const input = document.querySelector("#login-password");
  const button = document.querySelector("[data-toggle-password]");
  const icon = button.querySelector("[data-password-icon]");
  const isVisible = input.type === "text";
  input.type = isVisible ? "password" : "text";
  button.setAttribute("aria-label", isVisible ? "Mostrar contraseña" : "Ocultar contraseña");
  button.setAttribute("aria-pressed", String(!isVisible));
  icon.innerHTML = isVisible
    ? '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle>'
    : '<path d="m3 3 18 18"></path><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path><path d="M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-3.1 3.8M6.2 6.2C3.5 8.1 2 12 2 12s3.5 7 10 7a10 10 0 0 0 4-.8"></path>';
}

function getLoginErrorMessage(error) {
  if (error?.status === 429 || /rate limit/i.test(error?.message || "")) {
    return "Supabase limitó temporalmente el envío del correo. Espera al menos un minuto antes de volver a intentarlo. Si persiste, configura un proveedor SMTP propio y revisa Authentication → Rate Limits en Supabase.";
  }
  if (/invalid login credentials/i.test(error?.message || "")) {
    return "El correo o la contraseña no son correctos.";
  }
  if (/user already registered|already registered/i.test(error?.message || "")) {
    return "Ya existe una cuenta con ese correo. Inicien sesión o prueben con otra dirección.";
  }
  if (/password.*(weak|short|least|minimum)/i.test(error?.message || "")) {
    return "La contraseña no cumple los requisitos de seguridad. Prueba con una contraseña más larga.";
  }
  return getErrorMessage(error);
}

async function getEdgeFunctionErrorMessage(error) {
  if (error?.name === "FunctionsFetchError") {
    return "No se pudo conectar con invite-member. Comprueba que la función esté desplegada en el proyecto Supabase configurado y que permita solicitudes desde este sitio.";
  }
  if (error?.context instanceof Response) {
    try {
      const body = await error.context.clone().json();
      if (typeof body?.error === "string") return body.error;
    } catch (parseError) {
      console.error("No se pudo leer el detalle del error de invitación.", parseError);
    }
  }
  return getErrorMessage(error);
}

function saveDemoState() {
  try {
    demoStorage.saveDemoState(state);
    return true;
  } catch (error) {
    console.error("No se pudo guardar la demo local.", error);
    notify("No se pudieron guardar los cambios de la demo en este navegador.", true);
    return false;
  }
}

function commitDemoChange(update, message) {
  const previous = {
    wallet: { ...state.wallet },
    primaryGoalId: state.primaryGoalId,
    incomes: state.incomes.map((income) => ({ ...income })),
    expenses: state.expenses.map((expense) => ({ ...expense })),
    settlements: (state.settlements || []).map((settlement) => ({ ...settlement })),
    goals: state.goals.map((goal) => ({ ...goal })),
    goalContributions: (state.goalContributions || []).map((contribution) => ({ ...contribution })),
  };
  update();
  if (!saveDemoState()) {
    state = { ...state, ...previous };
    renderApp();
    return false;
  }
  renderApp();
  notify(message);
  return true;
}

function setDemoHeader(enabled) {
  const sessionLabel = document.querySelector("#session-email");
  const logoutButton = document.querySelector("#logout-button");
  const offlineNote = document.querySelector("#offline-note");
  document.querySelector(".dashboard-user-actions").hidden = false;
  sessionLabel.textContent = enabled ? "Demo local" : state.user?.email || "";
  sessionLabel.hidden = !enabled && !state.user?.email;
  logoutButton.textContent = enabled ? "Salir de demo" : "Cerrar sesión";
  logoutButton.hidden = false;
  offlineNote.textContent = enabled
    ? "Solo guardado en este navegador"
    : "Billetera compartida y privada";
  offlineNote.hidden = enabled;
  const demoNotice = document.querySelector("#demo-notice");
  if (!enabled || isDemoBannerDismissed()) {
    demoNotice.hidden = true;
  } else {
    demoNotice.hidden = false;
    demoNotice.classList.remove("is-dismissing");
    demoNotice.removeAttribute("aria-hidden");
  }
}

function isDemoBannerDismissed() {
  try {
    return storageRepository.getItem(DEMO_BANNER_DISMISSED_KEY) === "true";
  } catch (error) {
    console.error("No se pudo leer la preferencia del aviso de demo.", error);
    notify("No se pudo leer la preferencia para ocultar el aviso de demo.", true);
    return false;
  }
}

function dismissDemoBanner() {
  const demoNotice = document.querySelector("#demo-notice");
  try {
    storageRepository.setItem(DEMO_BANNER_DISMISSED_KEY, "true");
  } catch (error) {
    console.error("No se pudo guardar la preferencia del aviso de demo.", error);
    notify("El aviso se ocultará, pero no se pudo guardar la preferencia.", true);
  }
  demoNotice.setAttribute("aria-hidden", "true");
  demoNotice.classList.add("is-dismissing");
  window.setTimeout(() => {
    demoNotice.hidden = true;
    demoNotice.classList.remove("is-dismissing");
  }, 240);
}

function startDemo() {
  try {
    state = demoStorage.readDemoState();
    state.primaryGoalId = loadPrimaryGoal(state.wallet.id, state.goals);
    state.monthlyQuota = readMonthlyQuota(state.wallet.id);
    demoMode = true;
    if (!saveDemoState()) {
      demoMode = false;
      return;
    }
    demoStorage.setActive(true);
    setDemoHeader(true);
    renderApp();
    showRandomTip();
    showView("dashboard");
  } catch (error) {
    console.error("No se pudo iniciar la demo local.", error);
    showView("auth-view");
    showFormMessage("#auth-message", getErrorMessage(error), true);
  }
}

function restoreDemoSession() {
  try {
    if (!demoStorage.isActive()) return false;
    state = demoStorage.readDemoState();
    state.primaryGoalId = loadPrimaryGoal(state.wallet.id, state.goals);
    state.monthlyQuota = readMonthlyQuota(state.wallet.id);
    demoMode = true;
    setDemoHeader(true);
    renderApp();
    showRandomTip();
    showView("dashboard");
  } catch (error) {
    console.error("No se pudo restaurar la demo local.", error);
    showView("auth-view");
    showFormMessage("#auth-message", getErrorMessage(error), true);
  }
  return true;
}

async function loadWorkspace(user) {
  const requestId = ++workspaceRequest;
  demoMode = false;
  state.user = user;
  document.querySelector("#session-email").textContent = user.email;
  document.querySelector("#session-email").hidden = false;
  document.querySelector(".dashboard-user-actions").hidden = false;
  document.querySelector("#logout-button").hidden = false;
  document.querySelector("#logout-button").textContent = "Cerrar sesión";
  document.querySelector("#offline-note").hidden = true;
  document.querySelector("#demo-notice").hidden = true;

  try {
    const workspace = await supabaseRepository.getWorkspace(user.id);

    if (requestId !== workspaceRequest) return false;

    if (!workspace) {
      state = {
        ...state,
        wallet: null,
        memberIndex: null,
        members: [],
        incomes: [],
        expenses: [],
        settlements: [],
        goals: [],
        goalContributions: [],
      };
      state.primaryGoalId = null;
      state.monthlyQuota = null;
      document.querySelector('#form-wallet [name="miembro1"]').value =
        String(user.user_metadata?.display_name || "").trim();
      document.querySelector("#setup-title").textContent = "Crear billetera en pareja";
      document.querySelector("#form-wallet").hidden = false;
      showView("setup-view");
      return false;
    }

    state = { user, ...workspace };
    state.primaryGoalId = loadPrimaryGoal(state.wallet.id, state.goals);
    state.monthlyQuota = readMonthlyQuota(state.wallet.id);
    renderApp();
    showRandomTip();
    showView("dashboard");
    return true;
  } catch (error) {
    console.error("No se pudo cargar la billetera compartida.", error);
    if (requestId !== workspaceRequest) return false;
    showView("setup-view");
    document.querySelector("#setup-title").textContent = "No se pudo cargar la billetera";
    document.querySelector("#form-wallet").hidden = true;
    document.querySelector("#setup-message").textContent =
      `No pudimos cargar los datos compartidos. No crees otra billetera hasta resolverlo: ${getErrorMessage(error)}`;
    return false;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.querySelector("[data-auth-submit]").disabled) return;
  const submittedMode = authMode;
  const formData = new FormData(form);
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!isValidEmail(email)) {
    setAuthMessage("Escribe un correo electrónico válido.", "error");
    document.querySelector("#login-email").focus();
    return;
  }
  if (!password) {
    setAuthMessage("Escribe tu contraseña.", "error");
    document.querySelector("#login-password").focus();
    return;
  }

  const submitButton = form.querySelector("[data-auth-submit]");
  const magicButton = form.querySelector("[data-send-magic-link]");
  const modeToggle = document.querySelector("[data-toggle-auth-mode]");
  setAuthButtonLoading(submitButton, true, submittedMode === "signup" ? "Creando cuenta..." : "Entrando...");
  magicButton.disabled = true;
  modeToggle.disabled = true;
  setAuthMessage(submittedMode === "signup" ? "Creando su cuenta..." : "Iniciando sesión...", "loading");
  try {
    const result = submittedMode === "signup"
      ? await supabaseRepository.signUp(
        email,
        password,
        String(formData.get("displayName") || "").trim(),
        window.location.origin + window.location.pathname,
      )
      : await supabaseRepository.signInWithPassword(email, password);
    const { data, error } = result;
    if (error) throw error;
    if (submittedMode === "signup" && !data.session) {
      setAuthMessage(
        "Cuenta creada. Revisen su correo y confirmen la dirección para continuar.",
        "success",
      );
    }
  } catch (error) {
    console.error(submittedMode === "signup" ? "No se pudo crear la cuenta." : "No se pudo iniciar sesión con contraseña.", error);
    setAuthMessage(getLoginErrorMessage(error), "error");
  } finally {
    setAuthButtonLoading(submitButton, false);
    magicButton.disabled = false;
    modeToggle.disabled = false;
  }
}

async function handleMagicLink() {
  const email = String(document.querySelector("#login-email").value || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    setAuthMessage("Escribe un correo electrónico válido.", "error");
    document.querySelector("#login-email").focus();
    return;
  }

  const button = document.querySelector("[data-send-magic-link]");
  const submitButton = document.querySelector("[data-auth-submit]");
  const modeToggle = document.querySelector("[data-toggle-auth-mode]");
  setAuthButtonLoading(button, true, "Enviando enlace...");
  submitButton.disabled = true;
  modeToggle.disabled = true;
  setAuthMessage("Enviando el enlace...", "loading");
  try {
    const { error } = await supabaseRepository.signInWithOtp(
      email,
      window.location.origin + window.location.pathname,
    );
    if (error) throw error;
    setAuthMessage(
      "¡Enlace enviado! Revisen su bandeja de entrada o carpeta de spam para entrar.",
      "success",
    );
  } catch (error) {
    console.error("No se pudo enviar el enlace de acceso.", error);
    setAuthMessage(getLoginErrorMessage(error), "error");
  } finally {
    setAuthButtonLoading(button, false);
    submitButton.disabled = false;
    modeToggle.disabled = false;
  }
}

async function handleCreateWallet(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const miembro1 = String(data.get("miembro1") || "").trim();
  const miembro2 = String(data.get("miembro2") || "").trim();
  if (miembro1.length < 2 || miembro2.length < 2) {
    document.querySelector("#setup-message").textContent = "Escriban ambos nombres (al menos 2 caracteres).";
    return;
  }

  const { error } = await supabaseRepository.createWallet(miembro1, miembro2);
  if (error) {
    console.error("No se pudo crear la billetera.", error);
    document.querySelector("#setup-message").textContent = getErrorMessage(error);
    return;
  }

  await loadWorkspace(state.user);
}

async function handleSaveNames(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const miembro1 = String(data.get("miembro1") || "").trim();
  const miembro2 = String(data.get("miembro2") || "").trim();
  if (miembro1.length < 2 || miembro2.length < 2) {
    notify("Escriban ambos nombres (al menos 2 caracteres).", true);
    return;
  }

  if (demoMode) {
    commitDemoChange(() => {
      state.wallet.nombre_miembro1 = miembro1;
      state.wallet.nombre_miembro2 = miembro2;
    }, "Nombres actualizados en esta demo.");
    return;
  }

  const { error } = await supabaseRepository.updateWalletNames(state.wallet.id, miembro1, miembro2);
  if (error) {
    console.error("No se pudieron actualizar los nombres.", error);
    notify(getErrorMessage(error), true);
    return;
  }
  if (await loadWorkspace(state.user)) notify("Nombres actualizados.");
}

async function handleNewIncome(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const authorId = String(formData.get("autor") || "");
  const amount = Number(formData.get("monto"));
  const validationError = validateIncome({ authorId, amount, members: state.members });
  if (validationError) {
    notify(validationError, true);
    return;
  }

  if (demoMode) {
    const saved = commitDemoChange(() => {
      state.incomes.unshift({
        id: crypto.randomUUID(),
        author_id: authorId,
        amount,
        created_at: new Date().toISOString(),
      });
      form.reset();
    }, "Ingreso agregado a la demo.");
    if (saved) appNavigation.closeExpenseModal();
    return;
  }

  const { error } = await supabaseRepository.createIncome(state.wallet.id, authorId, amount);
  if (error) {
    console.error("No se pudo registrar el ingreso.", error);
    notify(getErrorMessage(error), true);
    return;
  }
  form.reset();
  if (await refreshAndNotify("Ingreso agregado.")) appNavigation.closeExpenseModal();
}

async function handleNewExpense(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const description = String(data.get("descripcion") || "").trim();
  const amount = Number(data.get("monto"));
  const validationError = validateExpense({
    description,
    amount,
    ...(demoMode ? { availableBalance: calculateAvailableBalance(state) } : {}),
  });
  if (validationError) {
    notify(validationError, true);
    return;
  }

  if (demoMode) {
    const saved = commitDemoChange(() => {
      state.expenses = addExpense(state.expenses, {
        id: crypto.randomUUID(),
        author_id: state.user.id,
        description,
        amount,
        created_at: new Date().toISOString(),
      });
      form.reset();
    }, "Gasto registrado en la demo.");
    if (saved) appNavigation.closeExpenseModal();
    return;
  }

  const { error } = await supabaseRepository.registerExpense(state.wallet.id, description, amount);
  if (error) {
    console.error("No se pudo registrar el gasto.", error);
    notify(getErrorMessage(error), true);
    return;
  }
  form.reset();
  if (await refreshAndNotify("Gasto registrado y descontado del saldo.")) appNavigation.closeExpenseModal();
}

async function handleNewGoal(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const title = String(data.get("titulo") || "").trim();
  const targetAmount = Number(data.get("montoObjetivo"));
  const targetDate = String(data.get("fechaObjetivo") || "").trim() || null;
  const validationError = validateGoal({ title, targetAmount, targetDate });
  if (validationError) {
    notify(validationError, true);
    return;
  }

  if (demoMode) {
    commitDemoChange(() => {
      state.goals.unshift({
        id: crypto.randomUUID(),
        title,
        target_amount: targetAmount,
        target_date: targetDate,
        current_amount: 0,
        created_at: new Date().toISOString(),
      });
      form.reset();
    }, "Meta creada en la demo.");
    return;
  }

  const { error } = await supabaseRepository.createGoal(state.wallet.id, title, targetAmount, targetDate);
  if (error) {
    console.error("No se pudo crear la meta.", error);
    notify(getErrorMessage(error), true);
    return;
  }
  form.reset();
  await refreshAndNotify("Meta creada.");
}

async function handleUpdateGoal(form) {
  const data = new FormData(form);
  const title = String(data.get("titulo") || "").trim();
  const targetAmount = Number(data.get("montoObjetivo"));
  const targetDate = String(data.get("fechaObjetivo") || "").trim() || null;
  const promoteToPrimary = form.querySelector("[data-primary-goal]").checked;
  const goal = state.goals.find((item) => item.id === form.dataset.goalId);
  if (!goal) {
    notify("No se encontró la meta seleccionada.", true);
    return;
  }
  const validationError = validateGoal({
    title,
    targetAmount,
    targetDate,
    currentAmount: Number(goal.current_amount),
  });
  if (validationError) {
    notify(validationError, true);
    return;
  }

  if (demoMode) {
    const saved = commitDemoChange(() => {
      goal.title = title;
      goal.target_amount = targetAmount;
      goal.target_date = targetDate;
      if (promoteToPrimary) state.primaryGoalId = goal.id;
    }, "Meta actualizada");
    if (saved) {
      if (promoteToPrimary) savePrimaryGoal(goal.id);
      document.querySelector("#goal-edit-dialog").close();
      if (promoteToPrimary) {
        document.querySelector(".savings-hero-card").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    return;
  }

  const { error } = await supabaseRepository.updateGoal(
    state.wallet.id,
    goal.id,
    title,
    targetAmount,
    targetDate,
  );
  if (error) {
    console.error("No se pudo actualizar la meta.", error);
    notify(getErrorMessage(error), true);
    return;
  }
  if (promoteToPrimary) savePrimaryGoal(goal.id);
  if (await refreshAndNotify("Meta actualizada")) {
    document.querySelector("#goal-edit-dialog").close();
    if (promoteToPrimary) {
      document.querySelector(".savings-hero-card").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

function handleGoalCoverActions(event) {
  const changeButton = event.target.closest("[data-change-goal-cover]");
  if (changeButton) {
    event.preventDefault();
    event.stopPropagation();
    changeButton.closest(".goal-cover-actions").querySelector("[data-goal-cover-input]").click();
    return;
  }

  const removeButton = event.target.closest("[data-remove-goal-cover]");
  if (removeButton) {
    event.preventDefault();
    event.stopPropagation();
    void handleRemoveGoalCover(removeButton.dataset.goalId);
  }
}

async function deleteStoredGoalCover(path) {
  try {
    const { error } = await supabaseRepository.deleteGoalCoverFile(path);
    if (error) console.error("No se pudo eliminar un archivo de portada.", error);
    return error;
  } catch (error) {
    console.error("No se pudo eliminar un archivo de portada.", error);
    return error;
  }
}

async function handleGoalCoverSelection(event) {
  const input = event.target.closest("[data-goal-cover-input]");
  const file = input?.files?.[0];
  if (!input || !file) return;

  const goal = state.goals.find((item) => item.id === input.dataset.goalId);
  if (!goal) {
    notify("No se encontró la meta seleccionada.", true);
    input.value = "";
    return;
  }

  const controls = input.closest(".goal-cover-actions");
  controls.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
  let uploadedPath = null;
  try {
    const coverBlob = await prepareGoalCover(file);
    if (demoMode) {
      const coverImageUrl = await readGoalCoverAsDataUrl(coverBlob);
      const saved = commitDemoChange(() => {
        goal.cover_image_url = coverImageUrl;
        delete goal.cover_image_path;
      }, "Portada actualizada en esta demo.");
      if (saved) {
        updateGoalEditorPreview(state.goals.find((item) => item.id === goal.id));
      }
      return;
    }

    const previousPath = goal.cover_image_path;
    const newPath = `${state.wallet.id}/${goal.id}/${crypto.randomUUID()}.jpg`;
    const uploadResult = await supabaseRepository.uploadGoalCover(newPath, coverBlob);
    if (uploadResult.error) throw uploadResult.error;
    uploadedPath = newPath;

    const { error } = await supabaseRepository.setGoalCover(
      state.wallet.id,
      goal.id,
      newPath,
    );
    if (error) throw error;
    uploadedPath = null;

    let cleanupError = null;
    if (previousPath) {
      cleanupError = await deleteStoredGoalCover(previousPath);
    }

    if (await loadWorkspace(state.user)) {
      updateGoalEditorPreview(state.goals.find((item) => item.id === goal.id));
      notify(cleanupError
        ? "Portada actualizada. No se pudo eliminar el archivo de la portada anterior."
        : "Portada compartida actualizada.");
    }
  } catch (error) {
    console.error("No se pudo actualizar la portada de la meta.", error);
    let cleanupError = null;
    if (uploadedPath) {
      cleanupError = await deleteStoredGoalCover(uploadedPath);
    }
    notify(cleanupError
      ? `${getErrorMessage(error)} No se pudo limpiar el archivo que no se guardó.`
      : getErrorMessage(error), true);
  } finally {
    input.value = "";
    controls.querySelectorAll("button").forEach((button) => {
      button.disabled = false;
    });
  }
}

async function handleRemoveGoalCover(goalId) {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal?.cover_image_url) return;

  if (demoMode) {
    const saved = commitDemoChange(() => {
      delete goal.cover_image_url;
    }, "Portada eliminada de la demo.");
    if (saved) {
      updateGoalEditorPreview(state.goals.find((item) => item.id === goal.id));
    }
    return;
  }

  try {
    const previousPath = goal.cover_image_path;
    const { error } = await supabaseRepository.setGoalCover(state.wallet.id, goal.id, null);
    if (error) throw error;

    const cleanupError = previousPath
      ? await deleteStoredGoalCover(previousPath)
      : null;
    if (await loadWorkspace(state.user)) {
      updateGoalEditorPreview(state.goals.find((item) => item.id === goal.id));
      notify(cleanupError
        ? "Portada quitada. No se pudo eliminar el archivo anterior."
        : "Portada quitada.");
    }
  } catch (error) {
    console.error("No se pudo quitar la portada de la meta.", error);
    notify(getErrorMessage(error), true);
  }
}

async function handleDeleteGoal(goalId) {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) {
    notify("No se encontró la meta seleccionada.", true);
    return;
  }
  const savedAmount = Number(goal.current_amount);
  const confirmation = savedAmount > 0
    ? `¿Eliminar la meta "${goal.title}"? Los ${formatCurrency(savedAmount)} ahorrados volverán al saldo disponible.`
    : `¿Eliminar la meta "${goal.title}"?`;
  if (!window.confirm(confirmation)) return;

  if (demoMode) {
    commitDemoChange(() => {
      state.goals = state.goals.filter((item) => item.id !== goalId);
      state.goalContributions = (state.goalContributions || [])
        .filter((contribution) => contribution.goal_id !== goalId);
    }, "Meta eliminada de la demo; sus fondos volvieron al saldo disponible.");
    return;
  }

  const { error } = await supabaseRepository.deleteGoal(state.wallet.id, goalId);
  if (error) {
    console.error("No se pudo eliminar la meta.", error);
    notify(getErrorMessage(error), true);
    return;
  }
  await refreshAndNotify("Meta eliminada; sus fondos volvieron al saldo disponible.");
}

async function handleContribute(event) {
  event.preventDefault();
  const form = event.target.closest('form[data-form="abonar-meta"]');
  if (!form) return;
  const isTransfer = form.hasAttribute("data-transfer-form");
  const goalId = isTransfer
    ? String(form.elements.namedItem("goalId").value)
    : form.dataset.metaId;
  const amount = Number(new FormData(form).get("montoAbonar"));
  const availableBalance = isTransfer
    ? Math.min(calculateAvailableBalance(state), getDashboardSummary(state).monthlyAvailableBalance)
    : calculateAvailableBalance(state);
  const goal = state.goals.find((item) => item.id === goalId);
  const validationError = validateGoalContribution({
    amount,
    goal,
    availableBalance,
  });
  if (validationError) {
    notify(validationError, true);
    return;
  }

  if (demoMode) {
    const saved = commitDemoChange(() => {
      goal.current_amount += amount;
      state.goalContributions = state.goalContributions || [];
      state.goalContributions.push({
        id: crypto.randomUUID(),
        goal_id: goalId,
        contributor_id: state.user.id,
        amount,
        created_at: new Date().toISOString(),
      });
    }, isTransfer ? "Transferencia a meta registrada." : "Aporte asignado a la meta en la demo.");
    if (saved && isTransfer) document.querySelector("#dashboard-transfer-dialog").close();
    return;
  }

  const { error } = await supabaseRepository.contributeToGoal(
    state.wallet.id,
    goalId,
    amount,
  );
  if (error) {
    console.error("No se pudo abonar a la meta.", error);
    notify(getErrorMessage(error), true);
    return;
  }
  if (await refreshAndNotify(isTransfer ? "Transferencia a meta registrada." : "Aporte asignado a la meta.")) {
    if (isTransfer) document.querySelector("#dashboard-transfer-dialog").close();
  }
}

async function handleDeleteIncome(event) {
  const button = event.target.closest('[data-action="eliminar-ingreso"]');
  if (!button) return;
  if (demoMode) {
    commitDemoChange(() => {
      state.incomes = state.incomes.filter((income) => income.id !== button.dataset.incomeId);
    }, "Ingreso eliminado de la demo.");
    return;
  }
  const { error } = await supabaseRepository.deleteIncome(state.wallet.id, button.dataset.incomeId);
  if (error) {
    console.error("No se pudo eliminar el ingreso.", error);
    notify(getErrorMessage(error), true);
    return;
  }
  await refreshAndNotify("Ingreso eliminado.");
}

async function handleDeleteExpense(event) {
  const button = event.target.closest('[data-action="eliminar-gasto"]');
  if (!button) return;

  const expense = state.expenses.find((item) => item.id === button.dataset.expenseId);
  if (!expense) {
    notify("No se encontró el gasto seleccionado.", true);
    return;
  }
  const label = button.querySelector(".delete-confirm-label");
  if (button.dataset.confirmState !== "warning") {
    button.dataset.confirmState = "warning";
    button.setAttribute("aria-label", `Toca de nuevo para eliminar el gasto ${expense.description}`);
    button.title = "Toca de nuevo para confirmar";
    if (label) label.textContent = "¿Eliminar?";
    const timer = window.setTimeout(() => {
      if (!button.isConnected) return;
      delete button.dataset.confirmState;
      button.setAttribute("aria-label", `Eliminar gasto ${expense.description}`);
      button.title = "Eliminar gasto";
      if (label) label.textContent = "Eliminar";
      expenseDeleteTimers.delete(button);
    }, 4000);
    expenseDeleteTimers.set(button, timer);
    return;
  }

  window.clearTimeout(expenseDeleteTimers.get(button));
  expenseDeleteTimers.delete(button);
  button.dataset.confirmState = "loading";
  button.classList.add("state-loading");
  button.disabled = true;
  button.setAttribute("aria-label", `Eliminando gasto ${expense.description}`);
  button.setAttribute("aria-busy", "true");
  if (label) label.textContent = "Eliminando";

  if (demoMode) {
    commitDemoChange(() => {
      state.expenses = deleteExpense(state.expenses, expense.id);
    }, "Gasto eliminado de la demo; el monto volvió al saldo disponible.");
    return;
  }

  const { error } = await supabaseRepository.deleteExpense(state.wallet.id, expense.id);
  if (error) {
    console.error("No se pudo eliminar el gasto.", error);
    button.disabled = false;
    button.classList.remove("state-loading");
    delete button.dataset.confirmState;
    button.removeAttribute("aria-busy");
    button.setAttribute("aria-label", `Eliminar gasto ${expense.description}`);
    button.title = "Eliminar gasto";
    if (label) label.textContent = "Eliminar";
    notify(getErrorMessage(error), true);
    return;
  }
  await refreshAndNotify("Gasto eliminado; el monto volvió al saldo disponible.");
}

function handleGoalActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  event.stopPropagation();
  if (button.dataset.action === "eliminar-meta") {
    void handleDeleteGoal(button.dataset.goalId);
  }
}

function handleGoalCardClick(event) {
  if (event.target.closest("button, a, input, select, textarea, form, label")) {
    event.stopPropagation();
    return;
  }
  const card = event.target.closest("[data-edit-goal]");
  if (card) openGoalEditor(card.dataset.editGoal);
}

function handleGoalCardKeyDown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (event.target.closest("button, a, input, select, textarea, form, label")) return;
  const card = event.target.closest("[data-edit-goal]");
  if (!card) return;
  event.preventDefault();
  openGoalEditor(card.dataset.editGoal);
}

async function handleInvite(event) {
  event.preventDefault();
  if (demoMode) {
    showFormMessage("#invite-message", "Las invitaciones solo están disponibles en una billetera conectada a Supabase.", true);
    return;
  }
  const form = event.currentTarget;
  const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFormMessage("#invite-message", "Escribe un correo electrónico válido.", true);
    return;
  }
  if (email === state.user.email?.toLowerCase()) {
    showFormMessage("#invite-message", "La invitación debe enviarse a otra persona.", true);
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  showFormMessage("#invite-message", "Enviando invitación...");
  try {
    const { data, error } = await supabaseRepository.inviteMember(state.wallet.id, email);
    if (error) throw error;
    showFormMessage("#invite-message", data?.message || "Invitación enviada. La otra persona debe abrir el correo y aceptar.");
    form.reset();
  } catch (error) {
    console.error("No se pudo enviar la invitación.", error);
    showFormMessage("#invite-message", await getEdgeFunctionErrorMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

async function refreshAndNotify(message) {
  if (await loadWorkspace(state.user)) {
    notify(message);
    return true;
  }
  return false;
}

async function handleLogout() {
  if (demoMode) {
    try {
      demoStorage.setActive(false);
    } catch (error) {
      console.error("No se pudo cerrar la demo local.", error);
      notify("No se pudo cerrar la demo local.", true);
      return;
    }
    demoMode = false;
    state = {
      user: null,
      wallet: null,
      memberIndex: null,
      members: [],
      incomes: [],
      expenses: [],
      settlements: [],
      goals: [],
      goalContributions: [],
    };
    document.querySelector("#session-email").hidden = true;
    document.querySelector("#logout-button").hidden = true;
    document.querySelector(".dashboard-user-actions").hidden = true;
    document.querySelector("#offline-note").hidden = false;
    document.querySelector("#demo-notice").hidden = true;
    if (!supabaseRepository && hasSupabaseConfiguration()) {
      try {
        supabaseRepository = await createConfiguredSupabaseRepository();
      } catch (error) {
        console.error("No se pudo cargar el cliente de Supabase al salir de la demo.", error);
        showView("auth-view");
        showFormMessage(
          "#auth-message",
          "No se pudo conectar con el servicio de acceso. Comprueba tu conexión o vuelve a probar la demo local.",
          true,
        );
        return;
      }
    }

    if (supabaseRepository) {
      const { data, error } = await supabaseRepository.getSession();
      if (error) {
        console.error("No se pudo comprobar la sesión.", error);
        showView("auth-view");
        showFormMessage("#auth-message", getErrorMessage(error), true);
      } else if (data.session) {
        await loadWorkspace(data.session.user);
      } else {
        showView("auth-view");
      }
    } else {
      showView("config-view");
    }
    return;
  }
  const { error } = await supabaseRepository.signOut();
  if (error) {
    console.error("No se pudo cerrar la sesión.", error);
    notify(getErrorMessage(error), true);
  }
}

function initializeEventHandlers() {
  appNavigation = new AppNavigation();

  document.querySelector("[data-dismiss-demo-notice]").addEventListener("click", dismissDemoBanner);
  document.querySelector("#form-login").addEventListener("submit", handleLogin);
  document.querySelector("[data-send-magic-link]").addEventListener("click", handleMagicLink);
  document.querySelector("[data-toggle-password]").addEventListener("click", togglePasswordVisibility);
  document.querySelector("[data-toggle-auth-mode]").addEventListener("click", () => {
    setAuthMode(authMode === "login" ? "signup" : "login");
  });
  document.querySelector("#form-wallet").addEventListener("submit", handleCreateWallet);
  document.querySelector("#form-nombres").addEventListener("submit", handleSaveNames);
  document.querySelector("#form-ingreso").addEventListener("submit", handleNewIncome);
  document.querySelector("#form-gasto").addEventListener("submit", handleNewExpense);
  document.querySelector("#form-edit-goal").addEventListener("submit", (event) => {
    event.preventDefault();
    void handleUpdateGoal(event.currentTarget);
  });
  document.querySelector("#form-monthly-quota").addEventListener("submit", handleSaveMonthlyQuota);
  document.querySelectorAll('#form-monthly-quota input[inputmode="numeric"]').forEach((input) => {
    input.addEventListener("input", () => formatMonthlyQuotaField(input));
  });
  document.querySelectorAll("[data-open-monthly-quota]").forEach((button) => {
    button.addEventListener("click", openMonthlyQuotaDialog);
  });
  document.querySelectorAll("[data-close-monthly-quota]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("#monthly-quota-dialog").close();
    });
  });
  document.querySelector("#monthly-quota-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  document.querySelector('#form-edit-goal [name="montoObjetivo"]').addEventListener("input", () => {
    updateGoalEditorProgress();
  });
  document.querySelector("#form-transfer-goal").addEventListener("submit", handleContribute);
  document.querySelector("[data-transfer-goal]").addEventListener("change", () => {
    updateGoalTransferForm(true);
  });
  document.querySelector("#dashboard-transfer-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  document.querySelectorAll("[data-close-transfer]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("#dashboard-transfer-dialog").close();
    });
  });
  document.querySelector("#goal-edit-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  document.querySelectorAll("[data-close-goal-editor]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("#goal-edit-dialog").close();
    });
  });
  document.querySelector("#form-meta").addEventListener("submit", handleNewGoal);
  document.querySelector("#form-invitacion").addEventListener("submit", handleInvite);
  document.querySelector("#view-goals").addEventListener("click", handleGoalCoverActions);
  document.querySelector("#view-goals").addEventListener("click", handleGoalCardClick);
  document.querySelector("#view-goals").addEventListener("keydown", handleGoalCardKeyDown);
  document.querySelector("#view-goals").addEventListener("change", handleGoalCoverSelection);
  document.querySelector("#goal-edit-dialog").addEventListener("click", handleGoalCoverActions);
  document.querySelector("#goal-edit-dialog").addEventListener("change", handleGoalCoverSelection);
  document.querySelector("#goals-list").addEventListener("submit", handleContribute);
  document.querySelector("#goals-list").addEventListener("click", handleGoalActions);
  document.querySelector("#income-list").addEventListener("click", handleDeleteIncome);
  document.querySelector("#expense-list").addEventListener("click", handleDeleteExpense);
  document.querySelector("#logout-button").addEventListener("click", handleLogout);
  document.querySelectorAll("[data-start-demo]").forEach((button) => {
    button.addEventListener("click", startDemo);
  });
}

function listenForAuthChanges() {
  supabaseRepository.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION" || demoMode) return;
    if (!session) {
      workspaceRequest += 1;
      setAuthMode("login");
      document.querySelector("#session-email").hidden = true;
      document.querySelector("#logout-button").hidden = true;
      document.querySelector(".dashboard-user-actions").hidden = true;
      document.querySelector("#offline-note").hidden = false;
      showView("auth-view");
      return;
    }
    void loadWorkspace(session.user);
  });
}

async function initializeApp() {
  initializePwa();
  themeToggle.initialize();
  initializeEventHandlers();

  if (restoreDemoSession()) return;

  if (hasSupabaseConfiguration()) {
    try {
      supabaseRepository = await createConfiguredSupabaseRepository();
    } catch (error) {
      console.error("No se pudo cargar el cliente de Supabase.", error);
      showView("auth-view");
      showFormMessage(
        "#auth-message",
        "No se pudo conectar con el servicio de acceso. Comprueba tu conexión o prueba la demo local.",
        true,
      );
      return;
    }
  }

  if (!hasSupabaseConfiguration()) {
    showView("config-view");
    return;
  }

  const { data, error } = await supabaseRepository.getSession();
  if (error) {
    console.error("No se pudo comprobar la sesión.", error);
    showView("auth-view");
    showFormMessage("#auth-message", getErrorMessage(error), true);
  } else if (data.session) {
    await loadWorkspace(data.session.user);
  } else {
    showView("auth-view");
  }

  listenForAuthChanges();
}

initializeApp();
