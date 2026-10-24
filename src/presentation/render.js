import { calculateAvailableBalance, calculateGoalProgress, totalOf } from "../domain/finance.js";

export function createRenderer({ getState, getDemoMode, formatCurrency, escapeHtml }) {
  const dateFormatter = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function getTodayDateInput() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getMemberName(state, userId) {
    const member = state.members.find((item) => item.user_id === userId);
    if (!member) return "Integrante";
    return member.member_index === 1 ? state.wallet.nombre_miembro1 : state.wallet.nombre_miembro2;
  }

  function renderGoals(state) {
    return state.goals.map((goal) => {
      const progress = calculateGoalProgress(goal);
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

  function renderIncomes(state) {
    return state.incomes.map((income) => `
    <article class="income-row">
      <span class="income-symbol" aria-hidden="true">↗</span>
      <div class="income-details">
        <strong>${escapeHtml(getMemberName(state, income.author_id))}</strong>
        <span>${escapeHtml(dateFormatter.format(new Date(income.created_at)))}</span>
      </div>
      <span class="income-amount">+ ${formatCurrency(Number(income.amount))}</span>
      <button class="icon-button" type="button" data-action="eliminar-ingreso" data-income-id="${escapeHtml(income.id)}" aria-label="Eliminar ingreso" title="Eliminar ingreso">×</button>
    </article>
  `).join("");
  }

  function renderExpenses(state) {
    return state.expenses.map((expense) => `
    <article class="income-row">
      <span class="income-symbol expense-symbol" aria-hidden="true">−</span>
      <div class="income-details">
        <strong>${escapeHtml(expense.description)} · ${escapeHtml(getMemberName(state, expense.author_id))}</strong>
        <span>${escapeHtml(dateFormatter.format(new Date(expense.created_at)))}</span>
      </div>
      <span class="expense-amount">− ${formatCurrency(Number(expense.amount))}</span>
    </article>
  `).join("");
  }

  function renderApp() {
    const state = getState();
    const memberTotals = [0, 0];
    for (const income of state.incomes) {
      const member = state.members.find((item) => item.user_id === income.author_id);
      if (member) memberTotals[member.member_index - 1] += Number(income.amount);
    }

    document.querySelector("#saldo-disponible").textContent =
      formatCurrency(calculateAvailableBalance(state));
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
    document.querySelector("#goals-list").innerHTML = renderGoals(state);
    document.querySelector("#income-list").innerHTML = renderIncomes(state);
    document.querySelector("#expense-list").innerHTML = renderExpenses(state);
    document.querySelector("#goals-empty").hidden = state.goals.length > 0;
    document.querySelector("#income-empty").hidden = state.incomes.length > 0;
    document.querySelector("#expense-empty").hidden = state.expenses.length > 0;
    document.querySelector("#invite-panel").hidden = getDemoMode() || state.members.length >= 2;
  }

  return { renderApp };
}
