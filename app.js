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

let supabase;
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

async function loadWorkspace(user) {
  const requestId = ++workspaceRequest;
  state.user = user;
  document.querySelector("#session-email").textContent = user.email;
  document.querySelector("#session-email").hidden = false;
  document.querySelector("#logout-button").hidden = false;
  document.querySelector("#offline-note").hidden = true;

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
      supabase.from("goals").select("id, title, target_amount, current_amount, created_at").eq("wallet_id", walletId).order("created_at", { ascending: true }),
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
  document.querySelector("#invite-panel").hidden = state.members.length >= 2;
}

function calcularProgresoMeta(goal) {
  return goal.target_amount <= 0
    ? 0
    : Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100));
}

function renderGoals() {
  return state.goals.map((goal) => {
    const progress = calcularProgresoMeta(goal);
    const complete = Number(goal.current_amount) >= Number(goal.target_amount);
    const remaining = Math.max(0, Number(goal.target_amount) - Number(goal.current_amount));

    return `
      <article class="goal-card">
        <div class="goal-topline">
          <div class="goal-title-wrap">
            <span class="goal-symbol" aria-hidden="true">✳</span>
            <h3 class="goal-title">${escapeHtml(goal.title)}</h3>
          </div>
          ${complete ? '<span class="goal-complete">Completada</span>' : ""}
        </div>
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
    showFormMessage("#auth-message", getErrorMessage(error), true);
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
  if (title.length < 3) {
    notify("El nombre de la meta debe tener al menos 3 caracteres.", true);
    return;
  }
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    notify("El monto objetivo debe ser mayor que cero.", true);
    return;
  }

  const { error } = await supabase.from("goals").insert({
    wallet_id: state.wallet.id,
    title,
    target_amount: targetAmount,
  });
  if (error) {
    console.error("No se pudo crear la meta.", error);
    notify(getErrorMessage(error), true);
    return;
  }
  form.reset();
  await refreshAndNotify("Meta creada.");
}

async function handleContribute(event) {
  event.preventDefault();
  const form = event.target.closest('form[data-form="abonar-meta"]');
  if (!form) return;
  const amount = Number(new FormData(form).get("montoAbonar"));
  if (!Number.isFinite(amount) || amount <= 0) {
    notify("El aporte debe ser un monto mayor que cero.", true);
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

async function handleInvite(event) {
  event.preventDefault();
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
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("No se pudo cerrar la sesión.", error);
    notify(getErrorMessage(error), true);
  }
}

function initializeEventHandlers() {
  document.querySelector("#form-login").addEventListener("submit", handleLogin);
  document.querySelector("#form-wallet").addEventListener("submit", handleCreateWallet);
  document.querySelector("#form-nombres").addEventListener("submit", handleSaveNames);
  document.querySelector("#form-ingreso").addEventListener("submit", handleNewIncome);
  document.querySelector("#form-gasto").addEventListener("submit", handleNewExpense);
  document.querySelector("#form-meta").addEventListener("submit", handleNewGoal);
  document.querySelector("#form-invitacion").addEventListener("submit", handleInvite);
  document.querySelector("#goals-list").addEventListener("submit", handleContribute);
  document.querySelector("#income-list").addEventListener("click", handleDeleteIncome);
  document.querySelector("#logout-button").addEventListener("click", handleLogout);
}

async function initializeApp() {
  initializeEventHandlers();

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_URL.includes("YOUR_PROJECT") ||
    SUPABASE_ANON_KEY.includes("YOUR_PUBLIC")
  ) {
    showView("config-view");
    return;
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
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

initializeApp();
