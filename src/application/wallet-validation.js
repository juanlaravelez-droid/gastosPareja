import { isValidDateInput } from "../domain/finance.js";

export function validateIncome({ authorId, amount, members }) {
  if (!members.some((member) => member.user_id === authorId)) {
    return "Selecciona una de las dos personas de la billetera.";
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return "El monto del ingreso debe ser mayor que cero.";
  }
  return null;
}

export function validateExpense({ description, amount, availableBalance }) {
  if (description.length < 2) {
    return "La descripción debe tener al menos 2 caracteres.";
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return "El monto del gasto debe ser mayor que cero.";
  }
  if (availableBalance !== undefined && amount > availableBalance) {
    return "Saldo disponible insuficiente para registrar este gasto.";
  }
  return null;
}

export function validateGoal({ title, targetAmount, targetDate, currentAmount = 0 }) {
  if (title.length < 3) {
    return "El nombre de la meta debe tener al menos 3 caracteres.";
  }
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    return "El monto objetivo debe ser mayor que cero.";
  }
  if (targetAmount < currentAmount) {
    return "El monto objetivo no puede ser menor a lo que ya han ahorrado.";
  }
  if (targetDate && !isValidDateInput(targetDate)) {
    return "Selecciona una fecha objetivo válida.";
  }
  return null;
}

export function validateGoalContribution({ amount, goal, availableBalance }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "El aporte debe ser un monto mayor que cero.";
  }
  if (!goal) {
    return "No se encontró la meta seleccionada.";
  }
  if (amount > availableBalance) {
    return "Saldo disponible insuficiente para realizar este aporte.";
  }
  if (Number(goal.current_amount) + amount > Number(goal.target_amount)) {
    return "El aporte supera el monto que falta para completar esta meta.";
  }
  return null;
}
