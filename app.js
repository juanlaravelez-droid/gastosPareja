import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config.example.js";
import {
  validateExpense,
  validateGoal,
  validateGoalContribution,
  validateIncome,
} from "./src/application/wallet-validation.js";
import { calculateAvailableBalance } from "./src/domain/finance.js";
import { createDemoStorage } from "./src/infrastructure/demo-storage.js";
import { createSupabaseRepository } from "./src/infrastructure/supabase-repository.js";
import { createRenderer } from "./src/presentation/render.js";
import { createUi } from "./src/presentation/ui.js";

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 2,
});
let supabaseRepository;
const demoStorage = createDemoStorage(localStorage);
let demoMode = false;
let state = {
  user: null,
  wallet: null,
  memberIndex: null,
  members: [],
  incomes: [],
  expenses: [],
  goals: [],
};
let workspaceRequest = 0;
const { initializeTheme, notify, setTheme, showFormMessage, showRandomTip, showView } =
  createUi(localStorage);
const { renderApp } = createRenderer({
  getState: () => state,
  getDemoMode: () => demoMode,
  formatCurrency,
  escapeHtml,
});

function formatCurrency(amount) {
  return currencyFormatter.format(amount);
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
    goals: state.goals.map((goal) => ({ ...goal })),
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
  sessionLabel.textContent = enabled ? "Demo local" : state.user?.email || "";
  sessionLabel.hidden = !enabled && !state.user?.email;
  logoutButton.textContent = enabled ? "Salir de demo" : "Cerrar sesión";
  logoutButton.hidden = false;
  offlineNote.textContent = enabled
    ? "Solo guardado en este navegador"
    : "Billetera compartida y privada";
  offlineNote.hidden = enabled;
  document.querySelector("#demo-notice").hidden = !enabled;
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
  document.querySelector("#logout-button").hidden = false;
  document.querySelector("#logout-button").textContent = "Cerrar sesión";
  document.querySelector("#offline-note").hidden = true;
  document.querySelector("#demo-notice").hidden = true;

  try {
    const workspace = await supabaseRepository.getWorkspace(user.id);

    if (requestId !== workspaceRequest) return false;

    if (!workspace) {
      state = { ...state, wallet: null, memberIndex: null, members: [], incomes: [], expenses: [], goals: [] };
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
    document.querySelector("#setup-message").textContent =
      `No pudimos cargar los datos compartidos: ${getErrorMessage(error)}`;
    return false;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
  if (!email) {
    showFormMessage("#auth-message", "Escribe un correo electrónico válido.", true);
    return;
  }

  const button = form.querySelector('button[type="submit"]');
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
    commitDemoChange(() => {
      state.incomes.unshift({
        id: crypto.randomUUID(),
        author_id: authorId,
        amount,
        created_at: new Date().toISOString(),
      });
      form.reset();
    }, "Ingreso agregado a la demo.");
    return;
  }

  const { error } = await supabaseRepository.createIncome(state.wallet.id, authorId, amount);
  if (error) {
    console.error("No se pudo registrar el ingreso.", error);
    notify(getErrorMessage(error), true);
    return;
  }
  form.reset();
  await refreshAndNotify("Ingreso agregado.");
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
    commitDemoChange(() => {
      state.expenses.unshift({
        id: crypto.randomUUID(),
        author_id: state.user.id,
        description,
        amount,
        created_at: new Date().toISOString(),
      });
      form.reset();
    }, "Gasto registrado en la demo.");
    return;
  }

  const { error } = await supabaseRepository.registerExpense(state.wallet.id, description, amount);
  if (error) {
    console.error("No se pudo registrar el gasto.", error);
    notify(getErrorMessage(error), true);
    return;
  }
  form.reset();
  await refreshAndNotify("Gasto registrado y descontado del saldo.");
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
  if (await loadWorkspace(state.user)) notify(message);
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
    state = { user: null, wallet: null, memberIndex: null, members: [], incomes: [], expenses: [], goals: [] };
    document.querySelector("#session-email").hidden = true;
    document.querySelector("#logout-button").hidden = true;
    document.querySelector("#offline-note").hidden = false;
    document.querySelector("#demo-notice").hidden = true;
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
  document.querySelector("#theme-toggle").addEventListener("click", () => {
    const currentTheme = document.documentElement.dataset.theme;
    setTheme(currentTheme === "rosa" ? "claro" : "rosa", true);
  });
  document.querySelector("#form-login").addEventListener("submit", handleLogin);
  document.querySelector("#form-wallet").addEventListener("submit", handleCreateWallet);
  document.querySelector("#form-nombres").addEventListener("submit", handleSaveNames);
  document.querySelector("#form-ingreso").addEventListener("submit", handleNewIncome);
  document.querySelector("#form-gasto").addEventListener("submit", handleNewExpense);
  document.querySelector("#form-meta").addEventListener("submit", handleNewGoal);
  document.querySelector("#form-invitacion").addEventListener("submit", handleInvite);
  document.querySelector("#goals-list").addEventListener("submit", handleContribute);
  document.querySelector("#goals-list").addEventListener("click", handleGoalActions);
  document.querySelector("#income-list").addEventListener("click", handleDeleteIncome);
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
      document.querySelector("#offline-note").hidden = false;
      showView("auth-view");
      return;
    }
    void loadWorkspace(session.user);
  });
}

async function initializeApp() {
  initializeTheme();
  initializeEventHandlers();

  const hasSupabaseConfiguration = Boolean(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes("YOUR_PROJECT") &&
    !SUPABASE_ANON_KEY.includes("YOUR_PUBLIC")
  );
  if (hasSupabaseConfiguration) {
    supabaseRepository = createSupabaseRepository(createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  }

  if (restoreDemoSession()) {
    if (supabaseRepository) listenForAuthChanges();
    return;
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
