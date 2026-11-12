import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config.example.js";
import {
  validateExpense,
  validateGoal,
  validateGoalContribution,
  validateIncome,
} from "./src/application/wallet-validation.js";
import {
  prepareGoalCover,
  readGoalCoverAsDataUrl,
} from "./src/application/goal-cover.js?v=1";
import {
  calculateAvailableBalance,
  getDashboardSummary,
} from "./src/application/wallet-service.js?v=2";
import { addSettlement } from "./src/application/expense-service.js?v=1";
import { createDemoStorage } from "./src/infrastructure/demo-storage.js?v=2";
import { createSupabaseRepository } from "./src/infrastructure/supabase-repository.js?v=2";
import { addExpense, deleteExpense } from "./src/application/expense-service.js?v=1";
import { createStorageRepository } from "./src/infrastructure/storage-repository.js?v=1";
import { createRenderer } from "./src/presentation/render.js?v=3";
import { createUi } from "./src/presentation/ui.js?v=4";
import { ThemeToggle } from "./src/presentation/components/ThemeToggle.js?v=1";
import { AppNavigation } from "./src/presentation/navigation.js?v=2";
import { DashboardView } from "./src/presentation/views/DashboardView.js?v=2";
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
const { notify, showFormMessage, showRandomTip, showView } = createUi(storageRepository);
const themeToggle = new ThemeToggle(storageRepository, (message) => notify(message, true));
const dashboardView = new DashboardView({
  storage: storageRepository,
  formatCurrency,
  onQuickExpense: () => appNavigation?.openExpenseModal("gasto"),
  onSettle: openSettlementDialog,
  onNotifications: (summary) => {
    notify(summary?.settlementAmount
      ? `Hay ${formatCurrency(summary.settlementAmount)} pendiente por saldar entre ustedes.`
      : "No tienen saldos pendientes por liquidar.");
  },
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
});

function openSettlementDialog(metrics) {
  const dialog = document.querySelector("#dashboard-settlement-dialog");
  const form = document.querySelector("#form-settlement");
  if (
    !dialog ||
    !form ||
    !metrics?.settlementAmount ||
    metrics.settlementPayerId !== state.user.id
  ) return;

  form.elements.namedItem("payerId").value = metrics.settlementPayerId;
  form.elements.namedItem("receiverId").value = metrics.settlementReceiverId;
  form.elements.namedItem("amount").max = String(metrics.settlementAmount);
  form.elements.namedItem("amount").value = metrics.settlementAmount.toFixed(2);
  document.querySelector("#settlement-description").textContent =
    `${metrics.settlementPayerName} debe a ${metrics.settlementReceiverName}.`;
  dialog.showModal();
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
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("No se pudo registrar el service worker de DuoBalance.", error);
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

function getLoginErrorMessage(error) {
  if (error?.status === 429 || /rate limit/i.test(error?.message || "")) {
    return "Supabase limitó temporalmente el envío del correo. Espera al menos un minuto antes de volver a intentarlo. Si persiste, configura un proveedor SMTP propio y revisa Authentication → Rate Limits en Supabase.";
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
      document.querySelector("#setup-title").textContent = "Crear billetera en pareja";
      document.querySelector("#form-wallet").hidden = false;
      showView("setup-view");
      return false;
    }

    state = { user, ...workspace };
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
  const formData = new FormData(form);
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || !password) {
    showFormMessage("#auth-message", "Escribe tu correo y contraseña.", true);
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  showFormMessage("#auth-message", "Iniciando sesión...");
  try {
    const { error } = await supabaseRepository.signInWithPassword(email, password);
    if (error) throw error;
  } catch (error) {
    console.error("No se pudo iniciar sesión con contraseña.", error);
    showFormMessage("#auth-message", getErrorMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

async function handleMagicLink() {
  const email = String(document.querySelector("#login-email").value || "").trim().toLowerCase();
  if (!email) {
    showFormMessage("#auth-message", "Escribe un correo electrónico válido.", true);
    return;
  }

  const button = document.querySelector("[data-send-magic-link]");
  button.disabled = true;
  showFormMessage("#auth-message", "Enviando el enlace...");
  try {
    const { error } = await supabaseRepository.signInWithOtp(
      email,
      window.location.origin + window.location.pathname,
    );
    if (error) throw error;
    showFormMessage("#auth-message", "Revisa tu correo y abre el enlace para entrar.");
  } catch (error) {
    console.error("No se pudo enviar el enlace de acceso.", error);
    showFormMessage("#auth-message", getLoginErrorMessage(error), true);
  } finally {
    button.disabled = false;
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

async function handleRegisterSettlement(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const payerId = String(data.get("payerId") || "");
  const receiverId = String(data.get("receiverId") || "");
  const amount = Number(data.get("amount"));
  const summary = getDashboardSummary(state);
  const amountInCents = amount * 100;
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    Math.abs(amountInCents - Math.round(amountInCents)) > Number.EPSILON * Math.max(1, amountInCents)
  ) {
    notify("Ingresa un monto válido con máximo dos decimales.", true);
    return;
  }
  if (
    payerId !== summary.settlementPayerId ||
    receiverId !== summary.settlementReceiverId ||
    payerId !== state.user.id ||
    amount > summary.settlementAmount
  ) {
    notify("El saldo pendiente cambió. Actualiza la página antes de registrar la liquidación.", true);
    return;
  }

  if (demoMode) {
    const saved = commitDemoChange(() => {
      state.settlements = addSettlement(state.settlements || [], {
        id: crypto.randomUUID(),
        payer_id: payerId,
        receiver_id: receiverId,
        amount,
        created_at: new Date().toISOString(),
      });
    }, "Liquidación registrada en la demo.");
    if (saved) document.querySelector("#dashboard-settlement-dialog").close();
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { error } = await supabaseRepository.registerSettlement(
      state.wallet.id,
      payerId,
      receiverId,
      amount,
    );
    if (error) throw error;
    if (await loadWorkspace(state.user)) {
      document.querySelector("#dashboard-settlement-dialog").close();
      notify("Liquidación registrada.");
    }
  } catch (error) {
    console.error("No se pudo registrar la liquidación.", error);
    notify(getErrorMessage(error), true);
  } finally {
    button.disabled = false;
  }
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
    commitDemoChange(() => {
      goal.title = title;
      goal.target_amount = targetAmount;
      goal.target_date = targetDate;
    }, "Meta actualizada en la demo.");
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
  await refreshAndNotify("Meta actualizada.");
}

function handleGoalCoverActions(event) {
  const changeButton = event.target.closest("[data-change-goal-cover]");
  if (changeButton) {
    changeButton.closest(".savings-hero-card")
      .querySelector("[data-goal-cover-input]")
      .click();
    return;
  }

  const removeButton = event.target.closest("[data-remove-goal-cover]");
  if (removeButton) void handleRemoveGoalCover(removeButton.dataset.goalId);
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
      commitDemoChange(() => {
        goal.cover_image_url = coverImageUrl;
        delete goal.cover_image_path;
      }, "Portada actualizada en esta demo.");
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
    commitDemoChange(() => {
      delete goal.cover_image_url;
    }, "Portada eliminada de la demo.");
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
  if (!form) {
    const editForm = event.target.closest('form[data-form="editar-meta"]');
    if (editForm) await handleUpdateGoal(editForm);
    return;
  }
  const amount = Number(new FormData(form).get("montoAbonar"));
  if (demoMode) {
    const goal = state.goals.find((item) => item.id === form.dataset.metaId);
    const validationError = validateGoalContribution({
      amount,
      goal,
      availableBalance: calculateAvailableBalance(state),
    });
    if (validationError) {
      notify(validationError, true);
      return;
    }
    commitDemoChange(() => {
      goal.current_amount += amount;
      state.goalContributions = state.goalContributions || [];
      state.goalContributions.push({
        id: crypto.randomUUID(),
        goal_id: goal.id,
        contributor_id: state.user.id,
        amount,
        created_at: new Date().toISOString(),
      });
    }, "Aporte asignado a la meta en la demo.");
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    notify("El aporte debe ser un monto mayor que cero.", true);
    return;
  }

  const { error } = await supabaseRepository.contributeToGoal(
    state.wallet.id,
    form.dataset.metaId,
    amount,
  );
  if (error) {
    console.error("No se pudo abonar a la meta.", error);
    notify(getErrorMessage(error), true);
    return;
  }
  await refreshAndNotify("Aporte asignado a la meta.");
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

  if (button.dataset.action === "editar-meta") {
    const card = button.closest(".goal-card");
    const form = card?.querySelector('form[data-form="editar-meta"]');
    if (!form) return;
    form.hidden = false;
    button.setAttribute("aria-expanded", "true");
    form.querySelector('input[name="titulo"]').focus();
  } else if (button.dataset.action === "cancelar-edicion-meta") {
    const card = button.closest(".goal-card");
    const form = card?.querySelector('form[data-form="editar-meta"]');
    if (!form) return;
    form.reset();
    form.hidden = true;
    card.querySelector('[data-action="editar-meta"]')?.setAttribute("aria-expanded", "false");
  } else if (button.dataset.action === "eliminar-meta") {
    void handleDeleteGoal(button.dataset.goalId);
  }
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
  document.querySelector("#form-wallet").addEventListener("submit", handleCreateWallet);
  document.querySelector("#form-nombres").addEventListener("submit", handleSaveNames);
  document.querySelector("#form-ingreso").addEventListener("submit", handleNewIncome);
  document.querySelector("#form-gasto").addEventListener("submit", handleNewExpense);
  document.querySelector("#form-settlement").addEventListener("submit", handleRegisterSettlement);
  document.querySelectorAll("[data-close-settlement]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("#dashboard-settlement-dialog").close();
    });
  });
  document.querySelector("#form-meta").addEventListener("submit", handleNewGoal);
  document.querySelector("#form-invitacion").addEventListener("submit", handleInvite);
  document.querySelector("#view-goals").addEventListener("click", handleGoalCoverActions);
  document.querySelector("#view-goals").addEventListener("change", handleGoalCoverSelection);
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

  if (!hasSupabaseConfiguration) {
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
