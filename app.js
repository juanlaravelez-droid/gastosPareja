import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config.example.js";

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
});
const DEMO_STORAGE_KEY = "billetera-demo-state-v1";
const DEMO_ACTIVE_KEY = "billetera-demo-active-v1";
const LAST_TIP_KEY = "billetera-last-tip-index-v1";
const THEME_STORAGE_KEY = "billetera-theme-v1";
const TIPS = [
  {
    category: "METAS Y FUTURO COMPARTIDO",
    quote: "Las mejores vacaciones no son las más caras, sino las que se disfrutan con la tranquilidad de que ya están pagas.",
  },
  {
    category: "METAS Y FUTURO COMPARTIDO",
    quote: "Ahorrar juntos hoy es el boleto para la tranquilidad y las aventuras de mañana.",
  },
  {
    category: "METAS Y FUTURO COMPARTIDO",
    quote: "No estamos guardando dinero; estamos financiando recuerdos que durarán toda la vida.",
  },
  {
    category: "METAS Y FUTURO COMPARTIDO",
    quote: "El amor sueña el destino, pero la disciplina financiera pavimenta la carretera para llegar a él.",
  },
  {
    category: "TRABAJO EN EQUIPO Y SINCRONÍA",
    quote: "Una pareja que habla de finanzas sin tabúes es un equipo imparable.",
  },
  {
    category: "TRABAJO EN EQUIPO Y SINCRONÍA",
    quote: "El éxito financiero en pareja no se mide en números individuales, sino en las metas que logran tachar juntos.",
  },
  {
    category: "TRABAJO EN EQUIPO Y SINCRONÍA",
    quote: "Dos visiones alineadas convierten cualquier meta económica en un logro inevitable.",
  },
  {
    category: "TRABAJO EN EQUIPO Y SINCRONÍA",
    quote: "Cuando la meta es compartida, el esfuerzo deja de ser una carga y se convierte en una victoria diaria de ambos.",
  },
  {
    category: "HÁBITOS Y MENTALIDAD",
    quote: "Decirle 'no' a un gasto impulsivo hoy es decirle un rotundo 'sí' a su proyecto de vida.",
  },
  {
    category: "HÁBITOS Y MENTALIDAD",
    quote: "La estabilidad económica no llega por suerte; se construye con una conversación sincera y una decisión a la vez.",
  },
  {
    category: "HÁBITOS Y MENTALIDAD",
    quote: "No se trata de privarse de la vida, sino de aprender a disfrutar de lo importante sin hipotecar la paz mental.",
  },
  {
    category: "HÁBITOS Y MENTALIDAD",
    quote: "El mejor regalo que pueden darse como pareja es la libertad financiera.",
  },
];

let supabase;
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
let notificationTimer;
let workspaceRequest = 0;

function setTheme(theme, persist = false) {
  const selectedTheme = theme === "rosa" ? "rosa" : "claro";
  document.documentElement.dataset.theme = selectedTheme;
  const button = document.querySelector("#theme-toggle");
  const isRose = selectedTheme === "rosa";
  button.textContent = isRose ? "Tema claro" : "Tema rosa";
  button.setAttribute("aria-pressed", String(isRose));
  button.setAttribute("aria-label", `Cambiar al tema ${isRose ? "claro" : "pastel rosa"}`);

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, selectedTheme);
    } catch (error) {
      console.error("No se pudo guardar la preferencia de tema.", error);
      notify("No se pudo guardar el tema; se conservará hasta cerrar esta página.", true);
    }
  }
}

function initializeTheme() {
  let savedTheme = "claro";
  try {
    savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || "claro";
  } catch (error) {
    console.error("No se pudo leer la preferencia de tema.", error);
  }
  setTheme(savedTheme);
}

function showView(viewId) {
  ["config-view", "auth-view", "setup-view", "dashboard"].forEach((id) => {
    document.querySelector(`#${id}`).hidden = id !== viewId;
  });
}

function notify(message, isError = false) {
  const notification = document.querySelector("#notification");
  window.clearTimeout(notificationTimer);
  notification.textContent = message;
  notification.classList.toggle("error", isError);
  notification.hidden = false;

  if (!isError) {
    notificationTimer = window.setTimeout(() => {
      notification.hidden = true;
    }, 3000);
  }
}

function showFormMessage(selector, message, isError = false) {
  const element = document.querySelector(selector);
  element.textContent = message;
  element.classList.toggle("error-text", isError);
}

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

function totalOf(rows, field = "amount") {
  return rows.reduce((total, row) => total + Number(row[field]), 0);
}

function calcularSaldo() {
  return totalOf(state.incomes) - totalOf(state.expenses) - totalOf(state.goals, "current_amount");
}

function isValidDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function showRandomTip() {
  let previousIndex = -1;
  try {
    const savedIndex = localStorage.getItem(LAST_TIP_KEY);
    if (savedIndex !== null) previousIndex = Number(savedIndex);
  } catch (error) {
    console.error("No se pudo leer el último tip mostrado.", error);
  }

  let index = Math.floor(Math.random() * TIPS.length);
  if (TIPS.length > 1 && index === previousIndex) {
    index = (index + 1 + Math.floor(Math.random() * (TIPS.length - 1))) % TIPS.length;
  }

  document.querySelector("#tip-category").textContent = TIPS[index].category;
  document.querySelector("#tip-quote").textContent = `“${TIPS[index].quote}”`;
  try {
    localStorage.setItem(LAST_TIP_KEY, String(index));
  } catch (error) {
    console.error("No se pudo guardar el último tip mostrado.", error);
  }
}

function createDemoState() {
  const now = Date.now();
  const firstMemberId = "demo-member-1";
  const secondMemberId = "demo-member-2";
  const dateDaysAgo = (daysAgo) => new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  return {
    user: { id: firstMemberId, email: "Demo local" },
    wallet: { id: "demo-wallet", nombre_miembro1: "Juan", nombre_miembro2: "Isa" },
    memberIndex: 1,
    members: [
      { user_id: firstMemberId, member_index: 1 },
      { user_id: secondMemberId, member_index: 2 },
    ],
    incomes: [
      { id: "demo-income-1", author_id: firstMemberId, amount: 2200000, created_at: dateDaysAgo(6) },
      { id: "demo-income-2", author_id: secondMemberId, amount: 1800000, created_at: dateDaysAgo(3) },
    ],
    expenses: [
      { id: "demo-expense-1", author_id: secondMemberId, description: "Mercado", amount: 245000, created_at: dateDaysAgo(2) },
    ],
    goals: [
      {
        id: "demo-goal-1",
        title: "Viaje juntos",
        target_amount: 1500000,
        target_date: new Date(now + 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        current_amount: 300000,
        created_at: dateDaysAgo(5),
      },
    ],
  };
}

function saveDemoState() {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({
      wallet: state.wallet,
      members: state.members,
      incomes: state.incomes,
      expenses: state.expenses,
      goals: state.goals,
    }));
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

function readDemoState() {
  const saved = localStorage.getItem(DEMO_STORAGE_KEY);
  if (!saved) return createDemoState();

  const data = JSON.parse(saved);
  if (
    !data?.wallet ||
    typeof data.wallet.nombre_miembro1 !== "string" ||
    typeof data.wallet.nombre_miembro2 !== "string" ||
    !Array.isArray(data.members) ||
    !Array.isArray(data.incomes) ||
    !Array.isArray(data.expenses) ||
    !Array.isArray(data.goals)
  ) {
    throw new Error("Los datos guardados de la demo están incompletos. Borra los datos locales del sitio para iniciar una demo nueva.");
  }

  return {
    ...data,
    user: { id: "demo-member-1", email: "Demo local" },
    memberIndex: 1,
  };
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
    state = readDemoState();
    demoMode = true;
    if (!saveDemoState()) {
      demoMode = false;
      return;
    }
    localStorage.setItem(DEMO_ACTIVE_KEY, "true");
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
    if (localStorage.getItem(DEMO_ACTIVE_KEY) !== "true") return false;
    state = readDemoState();
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
    let membershipResult = await supabase
      .from("wallet_members")
      .select("wallet_id, member_index")
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipResult.error) throw membershipResult.error;

    if (!membershipResult.data) {
      const invitationResult = await supabase.functions.invoke("accept-invitation", { body: {} });
      if (invitationResult.error) throw invitationResult.error;
      if (invitationResult.data?.accepted) {
        membershipResult = await supabase
          .from("wallet_members")
          .select("wallet_id, member_index")
          .eq("user_id", user.id)
          .maybeSingle();
        if (membershipResult.error) throw membershipResult.error;
      }
    }

    if (requestId !== workspaceRequest) return false;

    if (!membershipResult.data) {
      state = { ...state, wallet: null, memberIndex: null, members: [], incomes: [], expenses: [], goals: [] };
      showView("setup-view");
      return false;
    }

    const walletId = membershipResult.data.wallet_id;
    const [walletResult, membersResult, incomeResult, expenseResult, goalsResult] = await Promise.all([
      supabase.from("wallets").select("id, nombre_miembro1, nombre_miembro2").eq("id", walletId).single(),
      supabase.from("wallet_members").select("user_id, member_index").eq("wallet_id", walletId),
      supabase.from("incomes").select("id, author_id, amount, created_at").eq("wallet_id", walletId).order("created_at", { ascending: false }),
      supabase.from("expenses").select("id, author_id, description, amount, created_at").eq("wallet_id", walletId).order("created_at", { ascending: false }),
      supabase.from("goals").select("id, title, target_amount, target_date, current_amount, created_at").eq("wallet_id", walletId).order("created_at", { ascending: true }),
    ]);

    for (const result of [walletResult, membersResult, incomeResult, expenseResult, goalsResult]) {
      if (result.error) throw result.error;
    }

    if (requestId !== workspaceRequest) return;

    state = {
      user,
      wallet: walletResult.data,
      memberIndex: membershipResult.data.member_index,
      members: membersResult.data,
      incomes: incomeResult.data,
      expenses: expenseResult.data,
      goals: goalsResult.data,
    };
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

function renderApp() {
  const memberTotals = [0, 0];
  for (const income of state.incomes) {
    const member = state.members.find((item) => item.user_id === income.author_id);
    if (member) memberTotals[member.member_index - 1] += Number(income.amount);
  }

  document.querySelector("#saldo-disponible").textContent = formatCurrency(calcularSaldo());
  document.querySelector("#total-ingresos").textContent = formatCurrency(totalOf(state.incomes));
  document.querySelector("#total-gastos").textContent = formatCurrency(totalOf(state.expenses));
  document.querySelector("#total-ahorrado").textContent = formatCurrency(totalOf(state.goals, "current_amount"));
  document.querySelector("#nombre-miembro1").textContent = state.wallet.nombre_miembro1;
  document.querySelector("#nombre-miembro2").textContent = state.wallet.nombre_miembro2;
  document.querySelector("#aporte-miembro1").textContent = formatCurrency(memberTotals[0]);
  document.querySelector("#aporte-miembro2").textContent = formatCurrency(memberTotals[1]);
  document.querySelector("#nombre-miembro1-edicion").value = state.wallet.nombre_miembro1;
  document.querySelector("#nombre-miembro2-edicion").value = state.wallet.nombre_miembro2;
  const incomeAuthor = document.querySelector("#ingreso-autor");
  incomeAuthor.innerHTML = [...state.members]
    .sort((first, second) => first.member_index - second.member_index)
    .map((member) => {
      const memberName = member.member_index === 1
        ? state.wallet.nombre_miembro1
        : state.wallet.nombre_miembro2;
      return `<option value="${escapeHtml(member.user_id)}">${escapeHtml(memberName)}</option>`;
    })
    .join("");
  incomeAuthor.value = state.user.id;
  incomeAuthor.disabled = state.members.length < 2;
  document.querySelector("#goal-count").textContent = `${state.goals.length} ${state.goals.length === 1 ? "meta" : "metas"}`;
  document.querySelector("#income-count").textContent = `${state.incomes.length} ${state.incomes.length === 1 ? "ingreso" : "ingresos"}`;
  document.querySelector("#expense-count").textContent = `${state.expenses.length} ${state.expenses.length === 1 ? "gasto" : "gastos"}`;
  document.querySelector("#goals-list").innerHTML = renderGoals();
  document.querySelector("#income-list").innerHTML = renderIncomes();
  document.querySelector("#expense-list").innerHTML = renderExpenses();
  document.querySelector("#goals-empty").hidden = state.goals.length > 0;
  document.querySelector("#income-empty").hidden = state.incomes.length > 0;
  document.querySelector("#expense-empty").hidden = state.expenses.length > 0;
  document.querySelector("#invite-panel").hidden = demoMode || state.members.length >= 2;
}

function calcularProgresoMeta(goal) {
  return goal.target_amount <= 0
    ? 0
    : Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100));
}

function getTodayDateInput() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderGoals() {
  return state.goals.map((goal) => {
    const progress = calcularProgresoMeta(goal);
    const complete = Number(goal.current_amount) >= Number(goal.target_amount);
    const remaining = Math.max(0, Number(goal.target_amount) - Number(goal.current_amount));
    const targetDate = goal.target_date
      ? new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "UTC" })
        .format(new Date(`${goal.target_date}T00:00:00Z`))
      : null;
    const isOverdue = !complete && goal.target_date && goal.target_date < getTodayDateInput();

    return `
      <article class="goal-card">
        <div class="goal-topline">
          <div class="goal-title-wrap">
            <span class="goal-symbol" aria-hidden="true">✳</span>
            <h3 class="goal-title">${escapeHtml(goal.title)}</h3>
          </div>
          ${complete ? '<span class="goal-complete">Completada</span>' : ""}
        </div>
        ${targetDate ? `<p class="goal-deadline${isOverdue ? " overdue" : ""}">${isOverdue ? "Fecha vencida" : "Fecha objetivo"} · ${escapeHtml(targetDate)}</p>` : ""}
        <div class="goal-moneyline">
          <span><strong>${formatCurrency(Number(goal.current_amount))}</strong> ahorrados</span>
          <span>de ${formatCurrency(Number(goal.target_amount))}</span>
        </div>
        <div class="progress-track" role="progressbar" aria-label="Progreso de ${escapeHtml(goal.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <div class="goal-bottomline">
          <span class="goal-percent">${complete ? "¡Lo lograron!" : `${progress}% · Faltan ${formatCurrency(remaining)}`}</span>
          ${complete ? "" : `
            <form class="contribute-form" data-form="abonar-meta" data-meta-id="${escapeHtml(goal.id)}" novalidate>
              <label class="visually-hidden" for="aporte-${escapeHtml(goal.id)}">Monto a abonar a ${escapeHtml(goal.title)}</label>
              <input id="aporte-${escapeHtml(goal.id)}" name="montoAbonar" type="number" min="0.01" step="any" inputmode="decimal" placeholder="Monto" required>
              <button class="button button-primary button-small" type="submit">Abonar</button>
            </form>
          `}
        </div>
        <div class="goal-actions">
          <button class="button button-light button-small" type="button" data-action="editar-meta" data-goal-id="${escapeHtml(goal.id)}" aria-expanded="false">Editar</button>
          <button class="button button-light button-small goal-delete-button" type="button" data-action="eliminar-meta" data-goal-id="${escapeHtml(goal.id)}">Eliminar</button>
        </div>
        <form class="goal-edit-form stacked-form" data-form="editar-meta" data-goal-id="${escapeHtml(goal.id)}" hidden>
          <label>
            <span>Nombre de la meta</span>
            <input name="titulo" type="text" minlength="3" maxlength="80" value="${escapeHtml(goal.title)}" required>
          </label>
          <label>
            <span>Monto objetivo (mínimo ${formatCurrency(Number(goal.current_amount))})</span>
            <input name="montoObjetivo" type="number" min="${Number(goal.current_amount)}" step="any" inputmode="decimal" value="${Number(goal.target_amount)}" required>
          </label>
          <label>
            <span>Fecha objetivo (opcional)</span>
            <input name="fechaObjetivo" type="date" value="${escapeHtml(goal.target_date || "")}">
          </label>
          <div class="goal-edit-actions">
            <button class="button button-primary button-small" type="submit">Guardar cambios</button>
            <button class="button button-light button-small" type="button" data-action="cancelar-edicion-meta">Cancelar</button>
          </div>
        </form>
      </article>
    `;
  }).join("");
}

function getMemberName(userId) {
  const member = state.members.find((item) => item.user_id === userId);
  if (!member) return "Integrante";
  return member.member_index === 1 ? state.wallet.nombre_miembro1 : state.wallet.nombre_miembro2;
}

function renderIncomes() {
  return state.incomes.map((income) => `
    <article class="income-row">
      <span class="income-symbol" aria-hidden="true">↗</span>
      <div class="income-details">
        <strong>${escapeHtml(getMemberName(income.author_id))}</strong>
        <span>${escapeHtml(dateFormatter.format(new Date(income.created_at)))}</span>
      </div>
      <span class="income-amount">+ ${formatCurrency(Number(income.amount))}</span>
      <button class="icon-button" type="button" data-action="eliminar-ingreso" data-income-id="${escapeHtml(income.id)}" aria-label="Eliminar ingreso" title="Eliminar ingreso">×</button>
    </article>
  `).join("");
}

function renderExpenses() {
  return state.expenses.map((expense) => `
    <article class="income-row">
      <span class="income-symbol expense-symbol" aria-hidden="true">−</span>
      <div class="income-details">
        <strong>${escapeHtml(expense.description)} · ${escapeHtml(getMemberName(expense.author_id))}</strong>
        <span>${escapeHtml(dateFormatter.format(new Date(expense.created_at)))}</span>
      </div>
      <span class="expense-amount">− ${formatCurrency(Number(expense.amount))}</span>
    </article>
  `).join("");
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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
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

  const { error } = await supabase.rpc("create_wallet", {
    p_nombre_miembro1: miembro1,
    p_nombre_miembro2: miembro2,
  });
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

  const { error } = await supabase.rpc("update_wallet_names", {
    p_wallet_id: state.wallet.id,
    p_nombre_miembro1: miembro1,
    p_nombre_miembro2: miembro2,
  });
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
  const isMember = state.members.some((member) => member.user_id === authorId);
  if (!isMember) {
    notify("Selecciona una de las dos personas de la billetera.", true);
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    notify("El monto del ingreso debe ser mayor que cero.", true);
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

  const { error } = await supabase.from("incomes").insert({
    wallet_id: state.wallet.id,
    author_id: authorId,
    amount,
  });
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
  if (description.length < 2) {
    notify("La descripción debe tener al menos 2 caracteres.", true);
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    notify("El monto del gasto debe ser mayor que cero.", true);
    return;
  }

  if (demoMode) {
    if (amount > calcularSaldo()) {
      notify("Saldo disponible insuficiente para registrar este gasto.", true);
      return;
    }
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

  const { error } = await supabase.rpc("register_expense", {
    p_wallet_id: state.wallet.id,
    p_description: description,
    p_amount: amount,
  });
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
  if (title.length < 3) {
    notify("El nombre de la meta debe tener al menos 3 caracteres.", true);
    return;
  }
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    notify("El monto objetivo debe ser mayor que cero.", true);
    return;
  }
  if (targetDate && !isValidDateInput(targetDate)) {
    notify("Selecciona una fecha objetivo válida.", true);
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

  const { error } = await supabase.from("goals").insert({
    wallet_id: state.wallet.id,
    title,
    target_amount: targetAmount,
    target_date: targetDate,
  });
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
  if (title.length < 3) {
    notify("El nombre de la meta debe tener al menos 3 caracteres.", true);
    return;
  }
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    notify("El monto objetivo debe ser mayor que cero.", true);
    return;
  }
  if (targetAmount < Number(goal.current_amount)) {
    notify("El monto objetivo no puede ser menor a lo que ya han ahorrado.", true);
    return;
  }
  if (targetDate && !isValidDateInput(targetDate)) {
    notify("Selecciona una fecha objetivo válida.", true);
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

  const { error } = await supabase.rpc("update_goal", {
    p_wallet_id: state.wallet.id,
    p_goal_id: goal.id,
    p_title: title,
    p_target_amount: targetAmount,
    p_target_date: targetDate,
  });
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

  const { error } = await supabase.rpc("delete_goal", {
    p_wallet_id: state.wallet.id,
    p_goal_id: goalId,
  });
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
  if (!Number.isFinite(amount) || amount <= 0) {
    notify("El aporte debe ser un monto mayor que cero.", true);
    return;
  }

  if (demoMode) {
    const goal = state.goals.find((item) => item.id === form.dataset.metaId);
    if (!goal) {
      notify("No se encontró la meta seleccionada.", true);
      return;
    }
    if (amount > calcularSaldo()) {
      notify("Saldo disponible insuficiente para realizar este aporte.", true);
      return;
    }
    if (goal.current_amount + amount > goal.target_amount) {
      notify("El aporte supera el monto que falta para completar esta meta.", true);
      return;
    }
    commitDemoChange(() => {
      goal.current_amount += amount;
    }, "Aporte asignado a la meta en la demo.");
    return;
  }

  const { error } = await supabase.rpc("contribute_to_goal", {
    p_wallet_id: state.wallet.id,
    p_goal_id: form.dataset.metaId,
    p_amount: amount,
  });
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
  const { error } = await supabase.rpc("delete_income", {
    p_wallet_id: state.wallet.id,
    p_income_id: button.dataset.incomeId,
  });
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
    const { data, error } = await supabase.functions.invoke("invite-member", {
      body: { wallet_id: state.wallet.id, email },
    });
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
      localStorage.removeItem(DEMO_ACTIVE_KEY);
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
    if (supabase) {
      const { data, error } = await supabase.auth.getSession();
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
  const { error } = await supabase.auth.signOut();
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
  supabase.auth.onAuthStateChange((event, session) => {
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
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  if (restoreDemoSession()) {
    if (supabase) listenForAuthChanges();
    return;
  }

  if (!hasSupabaseConfiguration) {
    showView("config-view");
    return;
  }

  const { data, error } = await supabase.auth.getSession();
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
