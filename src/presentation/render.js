import {
  getDashboardSummary,
  getGoalProgressSegments,
  getGoalSummary,
  getSavingsContributionSummary,
  getWalletSummary,
} from "../application/wallet-service.js?v=3";
import { getMonthlyQuotaProjection } from "../application/monthly-quota.js?v=1";

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

export function createRenderer({
  getState,
  getDemoMode,
  formatCurrency,
  escapeHtml,
  dashboardView,
  onSelectPrimary = () => {},
}) {
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
      <article class="goal-card${complete ? " goal-complete-card" : ""}" data-edit-goal="${escapeHtml(goal.id)}" tabindex="0" aria-label="Editar meta ${escapeHtml(goal.title)}">
        <div class="goal-topline">
          <div class="goal-title-wrap">
            <span class="goal-symbol" aria-hidden="true">${complete ? "🎉" : "🎯"}</span>
            <div class="goal-heading-group">
              <h3 class="goal-title">${escapeHtml(goal.title)}</h3>
              ${targetDate ? `<p class="goal-deadline${isOverdue ? " overdue" : ""}">${isOverdue ? "⚠️ Vencida el" : "Objetivo para"} ${escapeHtml(targetDate)}</p>` : ""}
            </div>
          </div>
          ${complete ? '<span class="goal-complete">¡Alcanzada!</span>' : `<span class="goal-progress-badge">${progress}%</span>`}
          <span class="goal-edit-indicator" aria-hidden="true">✎</span>
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
          <button class="button button-light button-small goal-delete-button" type="button" data-action="eliminar-meta" data-goal-id="${escapeHtml(goal.id)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Eliminar
          </button>
        </div>
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

    let activeGoal = state.goals.find((goal) => goal.id === state.primaryGoalId)
      || state.goals.find((goal) => goal.id === selectedGoalId);
    if (!activeGoal) {
      activeGoal = state.goals.find((goal) =>
        Number(goal.current_amount) < Number(goal.target_amount)) || state.goals[0];
    }
    selectedGoalId = activeGoal.id;
    state.primaryGoalId = activeGoal.id;

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
    const heroCard = document.querySelector(".savings-hero-card");
    heroCard.dataset.editGoal = activeGoal.id;
    heroCard.tabIndex = 0;
    heroCard.setAttribute("role", "button");
    heroCard.setAttribute("aria-label", `Editar meta principal ${activeGoal.title}`);
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
    const monthlyQuota = state.monthlyQuota?.monthlyQuota;
    const hasMonthlyQuota = Boolean(monthlyQuota && monthlyQuota.juan + monthlyQuota.isa > 0);
    const monthlyMaximum = Math.max(monthlyMemberOne?.amount || 0, monthlyMemberTwo?.amount || 0);
    const monthlyMemberRows = [
      { member: monthlyMemberOne, quota: monthlyQuota?.juan || 0, key: "one" },
      { member: monthlyMemberTwo, quota: monthlyQuota?.isa || 0, key: "two" },
    ];
    for (const { member, quota, key } of monthlyMemberRows) {
      const amount = member?.amount || 0;
      const progress = hasMonthlyQuota
        ? quota > 0 ? Math.min(100, amount / quota * 100) : 0
        : monthlyMaximum ? amount / monthlyMaximum * 100 : 0;
      document.querySelector(`[data-monthly-member-amount="${key}"]`).textContent =
        hasMonthlyQuota
          ? `${formatCurrency(amount)} de ${formatCurrency(quota)}`
          : formatCurrency(amount);
      const progressBar = document.querySelector(`[data-monthly-member-bar="${key}"]`);
      progressBar.style.width = `${progress}%`;
      progressBar.parentElement.setAttribute("role", "progressbar");
      progressBar.parentElement.setAttribute("aria-label", hasMonthlyQuota
        ? `Aportes de ${key === "one" ? memberOneName : memberTwoName}: ${formatCurrency(amount)} de ${formatCurrency(quota)}`
        : `Aportes del mes de ${key === "one" ? memberOneName : memberTwoName}`);
      progressBar.parentElement.setAttribute("aria-valuemin", "0");
      progressBar.parentElement.setAttribute("aria-valuemax", "100");
      progressBar.parentElement.setAttribute("aria-valuenow", String(Math.round(progress)));
    }

    const quotaStatus = document.querySelector("[data-monthly-quota-status]");
    quotaStatus.querySelector("[data-open-monthly-quota]").hidden = hasMonthlyQuota;
    document.querySelector("[data-open-monthly-quota].monthly-quota-edit").hidden = !hasMonthlyQuota;
    const projectionElement = document.querySelector("[data-monthly-quota-projection]");
    projectionElement.hidden = !hasMonthlyQuota;
    if (hasMonthlyQuota) {
      const projection = getMonthlyQuotaProjection(activeGoal, monthlyQuota);
      const monthlyTotal = monthlyQuota.juan + monthlyQuota.isa;
      projectionElement.textContent = projection.complete
        ? "¡Meta principal completada!"
        : `Al ritmo de ${formatCurrency(monthlyTotal)}/mes, completan ${activeGoal.title} en ${
          new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(projection.date)
        }.`;
    } else {
      projectionElement.textContent = "";
    }

    const otherGoals = state.goals.filter((goal) => goal.id !== activeGoal.id);
    const goalSelector = document.querySelector("[data-goal-selector]");
    goalSelector.innerHTML = otherGoals.map((goal) => {
      const { progress } = getGoalSummary(goal, getTodayDateInput());
      const cover = goal.cover_image_url
        ? `<img src="${escapeHtml(goal.cover_image_url)}" alt="" loading="lazy">`
        : '<span aria-hidden="true">🎯</span>';
      return `<article class="goal-selector-card${otherGoals.length === 1 ? " is-single" : ""}" data-edit-goal="${escapeHtml(goal.id)}" tabindex="0" aria-label="Editar meta ${escapeHtml(goal.title)}">
        <div class="goal-selector-cover">${cover}</div>
        <div class="goal-selector-content">
          <div class="goal-selector-topline">
            <h3>${escapeHtml(goal.title)}</h3>
            <span class="goal-selector-actions">
              <button class="goal-selector-icon-button" type="button" data-select-goal="${escapeHtml(goal.id)}" title="Fijar como meta principal" aria-label="Fijar ${escapeHtml(goal.title)} como meta principal">☆</button>
              <span class="goal-edit-indicator" aria-hidden="true">✎</span>
            </span>
          </div>
          <div class="goal-selector-progress-line"><strong>${progress}%</strong><small>${formatCurrency(Number(goal.current_amount))} de ${formatCurrency(Number(goal.target_amount))}</small></div>
          <div class="goal-selector-track" role="progressbar" aria-label="Progreso de ${escapeHtml(goal.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
            <span style="width:${progress}%"></span>
          </div>
        </div>
      </article>`;
    }).join("");
    goalSelector.closest(".secondary-goals").hidden = otherGoals.length === 0;
  }

  function renderGoalTransferOptions(state) {
    const select = document.querySelector("[data-transfer-goal]");
    const form = document.querySelector("#form-transfer-goal");
    const button = document.querySelector("[data-dashboard-transfer]");
    const activeGoals = state.goals.filter((goal) =>
      Number(goal.current_amount) < Number(goal.target_amount));
    const previousGoalId = select.value;
    select.innerHTML = activeGoals.length
      ? activeGoals.map((goal) =>
        `<option value="${escapeHtml(goal.id)}">${escapeHtml(goal.title)}</option>`).join("")
      : '<option value="">No hay metas activas</option>';
    select.value = activeGoals.some((goal) => goal.id === previousGoalId)
      ? previousGoalId
      : activeGoals[0]?.id || "";
    form.dataset.metaId = select.value;
    select.disabled = activeGoals.length === 0;
    const summary = getDashboardSummary(state);
    button.disabled = activeGoals.length === 0
      || summary.monthlyAvailableBalance <= 0
      || summary.walletAvailableBalance <= 0;
  }

  function renderIncomes(state) {
    const records = state.incomes.map((income) => {
      const author = getMemberName(state, income.author_id);
      const formattedDate = dateFormatter.format(new Date(income.created_at));
      return {
        createdAt: income.created_at,
        markup: `
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
    `,
      };
    });
    const goalContributions = (state.goalContributions || []).map((contribution) => {
      const author = getMemberName(state, contribution.contributor_id);
      const goal = state.goals.find((item) => item.id === contribution.goal_id);
      const formattedDate = dateFormatter.format(new Date(contribution.created_at));
      return {
        createdAt: contribution.created_at,
        markup: `
      <article class="transaction-card income-card income-row goal-transfer-card" data-id="${escapeHtml(contribution.id)}" data-movement-type="transferencia_meta">
        <div class="transaction-icon income-icon-bg"><span class="income-arrow" aria-hidden="true">↗</span></div>
        <div class="transaction-details">
          <div class="transaction-top">
            <h4 class="transaction-name">Transferencia a ${escapeHtml(goal?.title || "meta")}</h4>
            <span class="transaction-category-chip cat-income">Meta</span>
          </div>
          <div class="transaction-sub">
            <span class="transaction-author"><span class="author-avatar-dot income-dot"></span>Aportado por <strong>${escapeHtml(author)}</strong></span>
            <span class="meta-separator" aria-hidden="true">·</span>
            <time class="transaction-time">${escapeHtml(formattedDate)}</time>
          </div>
        </div>
        <div class="transaction-amount-col"><span class="goal-transfer-amount">− ${formatCurrency(Number(contribution.amount))}</span></div>
      </article>
    `,
      };
    });
    return [...records, ...goalContributions]
      .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
      .map((record) => record.markup)
      .join("");
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

    document.querySelector("#total-ingresos").textContent = formatCurrency(summary.incomeTotal);
    document.querySelector("#total-gastos").textContent = formatCurrency(summary.expenseTotal);
    document.querySelector("#total-ahorrado").textContent = formatCurrency(summary.savedTotal);
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
    const incomeAndContributionCount = state.incomes.length + (state.goalContributions || []).length;
    document.querySelector("#income-count").textContent =
      `${incomeAndContributionCount} ${incomeAndContributionCount === 1 ? "movimiento" : "movimientos"}`;
    document.querySelector("#expense-count").textContent = `${state.expenses.length} ${state.expenses.length === 1 ? "gasto" : "gastos"}`;

    document.querySelector("#goals-list").innerHTML = renderGoals(state);
    renderSavingsOverview(state);
    renderGoalTransferOptions(state);
    document.querySelector("#income-list").innerHTML = renderIncomes(state);
    document.querySelector("#expense-list").innerHTML = renderExpenses(state);

    document.querySelector("#goals-empty").hidden = state.goals.length > 0;
    document.querySelector("#income-empty").hidden = incomeAndContributionCount > 0;
    document.querySelector("#expense-empty").hidden = state.expenses.length > 0;
    document.querySelector("#invite-panel").hidden = getDemoMode() || state.members.length >= 2;
  }

  document.querySelector("[data-goal-selector]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-select-goal]");
    if (!button) return;
    event.stopPropagation();
    selectedGoalId = button.dataset.selectGoal;
    onSelectPrimary(selectedGoalId);
    renderApp();
  });

  return { renderApp };
}
