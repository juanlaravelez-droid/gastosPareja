import {
  getDashboardSummary,
  getGoalProgressSegments,
  getGoalSummary,
  getSavingsContributionSummary,
  getWalletSummary,
} from "../application/wallet-service.js?v=2";

function getExpenseCategory(description = "") {
  const text = description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/(comida|almuerzo|cena|desayuno|mercado|super|restaurante|cafe|snack|hamburguesa|pizza|sushi|compras\s+alimentos)/i.test(text)) {
    return { name: "Alimentación", icon: "🍽️", class: "cat-food" };
  }
  if (/(uber|taxi|gasolina|peaje|transporte|metro|bus|pasaje|estacionamiento|parqueadero|didi)/i.test(text)) {
    return { name: "Transporte", icon: "🚗", class: "cat-transport" };
  }
  if (/(arriendo|alquiler|renta|luz|agua|gas|internet|wifi|servicios|administracion|casa|hogar)/i.test(text)) {
    return { name: "Hogar y Servicios", icon: "🏠", class: "cat-home" };
  }
  if (/(cine|salida|bar|fiesta|concierto|suscripcion|netflix|spotify|disney|juego|diversion|ocio)/i.test(text)) {
    return { name: "Ocio y Salidas", icon: "🍿", class: "cat-leisure" };
  }
  if (/(viaje|vuelo|hotel|hospedaje|airbnb|playa|vacaciones|paseo|tour)/i.test(text)) {
    return { name: "Viajes", icon: "✈️", class: "cat-travel" };
  }
  if (/(farmacia|medico|medicina|salud|droga|cita|hospital|doctor|dentista|odont)/i.test(text)) {
    return { name: "Salud", icon: "💊", class: "cat-health" };
  }
  if (/(ropa|zapatos|tienda|compra|shopping|amazon|celular|tecnologia|regalo)/i.test(text)) {
    return { name: "Compras", icon: "🛍️", class: "cat-shopping" };
  }
  return { name: "Gasto común", icon: "💳", class: "cat-general" };
}

export function createRenderer({ getState, getDemoMode, formatCurrency, escapeHtml, dashboardView }) {
  let selectedGoalId = null;
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
      const { progress, complete, remaining, overdue: isOverdue } = getGoalSummary(goal, getTodayDateInput());
      const targetDate = goal.target_date
        ? new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "UTC" })
          .format(new Date(`${goal.target_date}T00:00:00Z`))
        : null;

      return `
      <article class="goal-card${complete ? " goal-complete-card" : ""}">
        <div class="goal-topline">
          <div class="goal-title-wrap">
            <span class="goal-symbol" aria-hidden="true">${complete ? "🎉" : "🎯"}</span>
            <div class="goal-heading-group">
              <h3 class="goal-title">${escapeHtml(goal.title)}</h3>
              ${targetDate ? `<p class="goal-deadline${isOverdue ? " overdue" : ""}">${isOverdue ? "⚠️ Vencida el" : "Objetivo para"} ${escapeHtml(targetDate)}</p>` : ""}
            </div>
          </div>
          ${complete ? '<span class="goal-complete">¡Alcanzada!</span>' : `<span class="goal-progress-badge">${progress}%</span>`}
        </div>

        <div class="goal-moneyline">
          <span><strong>${formatCurrency(Number(goal.current_amount))}</strong> ahorrados</span>
          <span class="goal-target-total">de ${formatCurrency(Number(goal.target_amount))}</span>
        </div>

        <div class="progress-track" role="progressbar" aria-label="Progreso de ${escapeHtml(goal.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
          <div class="progress-fill${complete ? " progress-fill-complete" : ""}" style="width: ${progress}%"></div>
        </div>

        <div class="goal-bottomline">
          <span class="goal-percent">${complete ? "¡Felicidades, meta cumplida!" : `Faltan ${formatCurrency(remaining)}`}</span>
          ${complete ? "" : `
            <form class="contribute-form" data-form="abonar-meta" data-meta-id="${escapeHtml(goal.id)}" novalidate>
              <label class="visually-hidden" for="aporte-${escapeHtml(goal.id)}">Monto a abonar a ${escapeHtml(goal.title)}</label>
              <div class="input-with-prefix contribute-input-wrap">
                <span class="input-prefix" aria-hidden="true">$</span>
                <input id="aporte-${escapeHtml(goal.id)}" name="montoAbonar" type="number" min="0.01" step="any" inputmode="decimal" placeholder="Monto" required>
              </div>
              <button class="button button-emerald button-small" type="submit">Abonar</button>
            </form>
          `}
        </div>

        <div class="goal-actions">
          <button class="button button-light button-small" type="button" data-action="editar-meta" data-goal-id="${escapeHtml(goal.id)}" aria-expanded="false">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Editar
          </button>
          <button class="button button-light button-small goal-delete-button" type="button" data-action="eliminar-meta" data-goal-id="${escapeHtml(goal.id)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Eliminar
          </button>
        </div>

        <form class="goal-edit-form stacked-form" data-form="editar-meta" data-goal-id="${escapeHtml(goal.id)}" hidden>
          <label>
            <span class="label-text">Nombre de la meta</span>
            <input name="titulo" type="text" minlength="3" maxlength="80" value="${escapeHtml(goal.title)}" required>
          </label>
          <label>
            <span class="label-text">Monto objetivo (mínimo ${formatCurrency(Number(goal.current_amount))})</span>
            <input name="montoObjetivo" type="number" min="${Number(goal.current_amount)}" step="any" inputmode="decimal" value="${Number(goal.target_amount)}" required>
          </label>
          <label>
            <span class="label-text">Fecha objetivo (opcional)</span>
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

  function renderSavingsOverview(state) {
    const overview = document.querySelector("[data-savings-overview]");
    if (!state.goals.length) {
      selectedGoalId = null;
      overview.hidden = true;
      return;
    }

    let activeGoal = state.goals.find((goal) => goal.id === selectedGoalId);
    if (!activeGoal) {
      activeGoal = state.goals.find((goal) =>
        Number(goal.current_amount) < Number(goal.target_amount)) || state.goals[0];
      selectedGoalId = activeGoal.id;
    }

    const memberOneName = state.wallet.nombre_miembro1;
    const memberTwoName = state.wallet.nombre_miembro2;
    const contributionSummary = getSavingsContributionSummary(
      activeGoal,
      state.goalContributions || [],
      state.members,
    );
    const goalSummary = getGoalSummary(activeGoal, getTodayDateInput());
    const memberOne = contributionSummary.memberAmounts.find((member) => member.memberIndex === 1);
    const memberTwo = contributionSummary.memberAmounts.find((member) => member.memberIndex === 2);
    const monthlyMemberOne = contributionSummary.monthlyAmounts.find((member) => member.memberIndex === 1);
    const monthlyMemberTwo = contributionSummary.monthlyAmounts.find((member) => member.memberIndex === 2);
    const targetAmount = Number(activeGoal.target_amount);
    const progressSegments = getGoalProgressSegments(activeGoal, contributionSummary);

    overview.hidden = false;
    document.querySelector("[data-active-goal-title]").textContent = activeGoal.title;
    const coverImage = document.querySelector("[data-active-goal-cover]");
    const coverImageUrl = activeGoal.cover_image_url || "";
    if (coverImageUrl) {
      coverImage.src = coverImageUrl;
      coverImage.hidden = false;
    } else {
      coverImage.removeAttribute("src");
      coverImage.hidden = true;
    }
    coverImage.onerror = () => {
      coverImage.hidden = true;
      coverImage.removeAttribute("src");
    };
    document.querySelector("[data-goal-cover-input]").dataset.goalId = activeGoal.id;
    const removeCoverButton = document.querySelector("[data-remove-goal-cover]");
    removeCoverButton.dataset.goalId = activeGoal.id;
    removeCoverButton.hidden = !coverImageUrl;
    document.querySelector("[data-active-goal-total]").textContent = formatCurrency(Number(activeGoal.current_amount));
    document.querySelector("[data-active-goal-target]").textContent = formatCurrency(targetAmount);
    document.querySelector("[data-active-goal-percent]").textContent = `${goalSummary.progress}% completado`;

    const progressTrack = document.querySelector("[data-active-goal-progress]");
    progressTrack.setAttribute("aria-label", `Progreso de ${activeGoal.title}`);
    progressTrack.setAttribute("aria-valuenow", String(goalSummary.progress));
    progressTrack.querySelector('[data-goal-segment="unattributed"]').style.width =
      `${progressSegments.unattributed}%`;
    progressTrack.querySelector('[data-goal-segment="one"]').style.width =
      `${progressSegments.memberOne}%`;
    progressTrack.querySelector('[data-goal-segment="two"]').style.width =
      `${progressSegments.memberTwo}%`;

    document.querySelector('[data-goal-member-name="one"]').textContent = memberOneName;
    document.querySelector('[data-goal-member-name="two"]').textContent = memberTwoName;
    document.querySelector('[data-goal-member-amount="one"]').textContent = formatCurrency(memberOne?.amount || 0);
    document.querySelector('[data-goal-member-amount="two"]').textContent = formatCurrency(memberTwo?.amount || 0);
    document.querySelector('[data-goal-member-percent="one"]').textContent =
      `${memberOne?.goalPercentage || 0}% de la meta`;
    document.querySelector('[data-goal-member-percent="two"]').textContent =
      `${memberTwo?.goalPercentage || 0}% de la meta`;

    const unattributedNote = document.querySelector("[data-goal-unattributed]");
    unattributedNote.hidden = contributionSummary.unattributedAmount <= 0;
    unattributedNote.textContent = contributionSummary.unattributedAmount > 0
      ? `${formatCurrency(contributionSummary.unattributedAmount)} ahorrados antes de activar el desglose por integrante.`
      : "";

    const now = new Date();
    document.querySelector("[data-savings-month]").textContent = new Intl.DateTimeFormat("es-CO", {
      month: "long",
      year: "numeric",
    }).format(now);
    document.querySelector('[data-monthly-member-name="one"]').textContent = memberOneName;
    document.querySelector('[data-monthly-member-name="two"]').textContent = memberTwoName;
    document.querySelector('[data-monthly-member-amount="one"]').textContent =
      formatCurrency(monthlyMemberOne?.amount || 0);
    document.querySelector('[data-monthly-member-amount="two"]').textContent =
      formatCurrency(monthlyMemberTwo?.amount || 0);
    const monthlyMaximum = Math.max(monthlyMemberOne?.amount || 0, monthlyMemberTwo?.amount || 0);
    document.querySelector('[data-monthly-member-bar="one"]').style.width =
      `${monthlyMaximum ? (monthlyMemberOne?.amount || 0) / monthlyMaximum * 100 : 0}%`;
    document.querySelector('[data-monthly-member-bar="two"]').style.width =
      `${monthlyMaximum ? (monthlyMemberTwo?.amount || 0) / monthlyMaximum * 100 : 0}%`;
    document.querySelector("[data-monthly-quota-status]").textContent =
      "Aún no han configurado una cuota mensual compartida.";

    const otherGoals = state.goals.filter((goal) => goal.id !== activeGoal.id);
    const goalSelector = document.querySelector("[data-goal-selector]");
    goalSelector.innerHTML = otherGoals.map((goal) => {
      const { progress } = getGoalSummary(goal, getTodayDateInput());
      return `<button class="goal-selector-card" type="button" data-select-goal="${escapeHtml(goal.id)}">
        <span>${escapeHtml(goal.title)}</span>
        <strong>${progress}%</strong>
        <small>${formatCurrency(Number(goal.current_amount))} de ${formatCurrency(Number(goal.target_amount))}</small>
      </button>`;
    }).join("");
    goalSelector.closest(".secondary-goals").hidden = otherGoals.length === 0;
  }

  function renderIncomes(state) {
    return state.incomes.map((income) => {
      const author = getMemberName(state, income.author_id);
      const formattedDate = dateFormatter.format(new Date(income.created_at));
      return `
      <article class="transaction-card income-card income-row" data-id="${escapeHtml(income.id)}">
        <div class="transaction-icon income-icon-bg">
          <span class="income-arrow" aria-hidden="true">↗</span>
        </div>
        <div class="transaction-details">
          <div class="transaction-top">
            <h4 class="transaction-name">Aporte al fondo común</h4>
            <span class="transaction-category-chip cat-income">Ingreso</span>
          </div>
          <div class="transaction-sub">
            <span class="transaction-author">
              <span class="author-avatar-dot income-dot"></span>
              Aportado por <strong>${escapeHtml(author)}</strong>
            </span>
            <span class="meta-separator" aria-hidden="true">·</span>
            <time class="transaction-time">${escapeHtml(formattedDate)}</time>
          </div>
        </div>
        <div class="transaction-amount-col">
          <span class="income-amount">+ ${formatCurrency(Number(income.amount))}</span>
          <button class="icon-button delete-income-button" type="button" data-action="eliminar-ingreso" data-income-id="${escapeHtml(income.id)}" aria-label="Eliminar aporte" title="Eliminar aporte">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </article>
    `;
    }).join("");
  }

  function renderExpenses(state) {
    return state.expenses.map((expense) => {
      const category = getExpenseCategory(expense.description);
      const author = getMemberName(state, expense.author_id);
      const formattedDate = dateFormatter.format(new Date(expense.created_at));
      return `
      <article class="transaction-card expense-card income-row" data-id="${escapeHtml(expense.id)}">
        <div class="transaction-icon expense-icon-bg ${category.class}">
          <span class="category-emoji" aria-hidden="true">${category.icon}</span>
        </div>
        <div class="transaction-details">
          <div class="transaction-top">
            <h4 class="transaction-name">${escapeHtml(expense.description)}</h4>
            <span class="transaction-category-chip ${category.class}">${category.name}</span>
          </div>
          <div class="transaction-sub">
            <span class="transaction-author">
              <span class="author-avatar-dot"></span>
              Pagado por <strong>${escapeHtml(author)}</strong>
            </span>
            <span class="meta-separator" aria-hidden="true">·</span>
            <time class="transaction-time">${escapeHtml(formattedDate)}</time>
          </div>
        </div>
        <div class="transaction-amount-col">
          <span class="expense-amount">− ${formatCurrency(Number(expense.amount))}</span>
          <span class="transaction-badge badge-debt">Gasto común</span>
          <button class="button button-icon button-destructive delete-expense-button" type="button" data-action="eliminar-gasto" data-expense-id="${escapeHtml(expense.id)}" aria-label="Eliminar gasto ${escapeHtml(expense.description)}" title="Eliminar gasto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            <span class="button-label delete-confirm-label">Eliminar</span>
            <svg class="button-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity=".25"></circle><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path></svg>
          </button>
        </div>
      </article>
    `;
    }).join("");
  }

  function renderApp() {
    const state = getState();
    const summary = getWalletSummary(state);
    dashboardView.updateMetrics(getDashboardSummary(state));
    const balanceElement = document.querySelector("#saldo-disponible");
    balanceElement.textContent = formatCurrency(summary.availableBalance);

    document.querySelector("#total-ingresos").textContent = formatCurrency(summary.incomeTotal);
    document.querySelector("#total-gastos").textContent = formatCurrency(summary.expenseTotal);
    document.querySelector("#total-ahorrado").textContent = formatCurrency(summary.savedTotal);
    document.querySelector("#nombre-miembro1").textContent = state.wallet.nombre_miembro1;
    document.querySelector("#nombre-miembro2").textContent = state.wallet.nombre_miembro2;
    document.querySelector("#aporte-miembro1").textContent = formatCurrency(summary.contributions[0]);
    document.querySelector("#aporte-miembro2").textContent = formatCurrency(summary.contributions[1]);
    document.querySelector("#nombre-miembro1-edicion").value = state.wallet.nombre_miembro1;
    document.querySelector("#nombre-miembro2-edicion").value = state.wallet.nombre_miembro2;

    const splitFill1 = document.querySelector("#split-fill-m1");
    const splitFill2 = document.querySelector("#split-fill-m2");
    if (splitFill1) splitFill1.style.width = `${summary.percentages[0]}%`;
    if (splitFill2) splitFill2.style.width = `${summary.percentages[1]}%`;

    const share1 = document.querySelector("#porcentaje-miembro1");
    const share2 = document.querySelector("#porcentaje-miembro2");
    if (share1) share1.textContent = `${summary.percentages[0]}% del fondo`;
    if (share2) share2.textContent = `${summary.percentages[1]}% del fondo`;

    const splitBadge = document.querySelector("#balance-split-badge");
    const substatus1 = document.querySelector("#estado-miembro1");
    const substatus2 = document.querySelector("#estado-miembro2");

    if (splitBadge) {
      if (summary.contributionStatus === "none") {
        splitBadge.textContent = "Aportes al día";
        splitBadge.className = "badge badge-neutral";
        if (substatus1) substatus1.textContent = "Sin aportes";
        if (substatus2) substatus2.textContent = "Sin aportes";
      } else if (summary.contributionStatus === "balanced") {
        splitBadge.textContent = "⚖️ Aportes 50% / 50% en balance";
        splitBadge.className = "badge badge-balanced";
        if (substatus1) substatus1.textContent = "Equilibrado";
        if (substatus2) substatus2.textContent = "Equilibrado";
      } else if (summary.contributionStatus === "first-ahead") {
        splitBadge.textContent = `↗ ${state.wallet.nombre_miembro1} aportó ${formatCurrency(summary.contributionDifference)} más`;
        splitBadge.className = "badge badge-lead";
        if (substatus1) substatus1.textContent = `Aporte mayor (+${formatCurrency(summary.contributionDifference)})`;
        if (substatus2) substatus2.textContent = `Por equilibrar: ${formatCurrency(summary.contributionDifference)}`;
      } else {
        splitBadge.textContent = `↗ ${state.wallet.nombre_miembro2} aportó ${formatCurrency(summary.contributionDifference)} más`;
        splitBadge.className = "badge badge-lead";
        if (substatus1) substatus1.textContent = `Por equilibrar: ${formatCurrency(summary.contributionDifference)}`;
        if (substatus2) substatus2.textContent = `Aporte mayor (+${formatCurrency(summary.contributionDifference)})`;
      }
    }

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
    renderSavingsOverview(state);
    document.querySelector("#income-list").innerHTML = renderIncomes(state);
    document.querySelector("#expense-list").innerHTML = renderExpenses(state);

    document.querySelector("#goals-empty").hidden = state.goals.length > 0;
    document.querySelector("#income-empty").hidden = state.incomes.length > 0;
    document.querySelector("#expense-empty").hidden = state.expenses.length > 0;
    document.querySelector("#invite-panel").hidden = getDemoMode() || state.members.length >= 2;
  }

  document.querySelector("[data-goal-selector]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-select-goal]");
    if (!button) return;
    selectedGoalId = button.dataset.selectGoal;
    renderApp();
  });

  return { renderApp };
}
