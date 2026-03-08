const STORAGE_KEY = "shiftTrackerData";

const RATES = {
  kamaz: { label: "КамАЗ", base: 4000, dump: 1500 },
  maz: { label: "МАЗ", base: 4200, dump: 1700 },
  noorder: { label: "Нерабочий день", base: 1000, dump: 0 },
};

const OVERTIME_BASE_HOURS = 7;
const OVERTIME_RATE = 500;
const NO_ORDER_PAY = 1000;

const elements = {
  periodLabel: document.getElementById("periodLabel"),
  totalIncome: document.getElementById("totalIncome"),
  totalExpenses: document.getElementById("totalExpenses"),
  netIncome: document.getElementById("netIncome"),
  shiftForm: document.getElementById("shiftForm"),
  shiftDate: document.getElementById("shiftDate"),
  shiftType: document.getElementById("shiftType"),
  shiftNoOrder: document.getElementById("shiftNoOrder"),
  shiftStart: document.getElementById("shiftStart"),
  shiftEnd: document.getElementById("shiftEnd"),
  shiftDumps: document.getElementById("shiftDumps"),
  expenseForm: document.getElementById("expenseForm"),
  expenseDate: document.getElementById("expenseDate"),
  expenseName: document.getElementById("expenseName"),
  expenseAmount: document.getElementById("expenseAmount"),
  shiftsList: document.getElementById("shiftsList"),
  expensesList: document.getElementById("expensesList"),
  periodsList: document.getElementById("periodsList"),
  closePeriodBtn: document.getElementById("closePeriodBtn"),
};

const currency = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

function formatRub(value) {
  return currency.format(value || 0);
}

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function datePartsFromIso(value) {
  if (!value || typeof value !== "string") return null;
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  if ([year, month, day].some((item) => Number.isNaN(item))) return null;
  return { year, month, day };
}

function halfMonthLabelFromParts(parts) {
  if (!parts) return "—";
  const { year, month, day } = parts;
  const startDay = day <= 15 ? 1 : 16;
  const endDay = day <= 15 ? 15 : new Date(year, month, 0).getDate();
  return `${pad2(startDay)}–${pad2(endDay)}.${pad2(month)}.${year}`;
}

function periodBaseDate(period) {
  const dates = [
    ...period.shifts.map((shift) => shift.date),
    ...period.expenses.map((expense) => expense.date),
  ].filter(Boolean);
  if (dates.length > 0) {
    return dates.sort()[0];
  }
  return period.createdAt || null;
}

function toggleNoOrder(isNoOrder) {
  elements.shiftType.disabled = isNoOrder;
  elements.shiftStart.disabled = isNoOrder;
  elements.shiftEnd.disabled = isNoOrder;
  elements.shiftDumps.disabled = isNoOrder;

  if (isNoOrder) {
    elements.shiftStart.required = false;
    elements.shiftEnd.required = false;
    elements.shiftDumps.value = 0;
  } else {
    elements.shiftStart.required = true;
    elements.shiftEnd.required = true;
  }
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseTimeToMinutes(timeValue) {
  if (!timeValue || typeof timeValue !== "string") return null;
  const [hours, minutes] = timeValue.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function calculateHoursFromTimes(startTime, endTime) {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) return null;
  const dayMinutes = 24 * 60;
  const diff = endMinutes >= startMinutes
    ? endMinutes - startMinutes
    : endMinutes + dayMinutes - startMinutes;
  return diff / 60;
}

function getShiftHours(shift) {
  if (isNoOrderShift(shift)) return 0;
  if (typeof shift.hours === "number") return shift.hours;
  if (shift.startTime && shift.endTime) {
    const computed = calculateHoursFromTimes(shift.startTime, shift.endTime);
    return computed ?? 0;
  }
  return 0;
}

function formatHours(hours) {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function roundHours(hours) {
  return Math.round(hours * 10) / 10;
}

function isNoOrderShift(shift) {
  return shift?.noOrder === true || shift?.type === "noorder";
}

function shiftTimeLabel(shift) {
  if (isNoOrderShift(shift)) {
    return "без заказа";
  }
  if (shift.startTime && shift.endTime) {
    return `${shift.startTime}–${shift.endTime}`;
  }
  return "время не указано";
}

function createEmptyPeriod() {
  return {
    id: generateId(),
    createdAt: new Date().toISOString(),
    shifts: [],
    expenses: [],
  };
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      current: createEmptyPeriod(),
      periods: [],
    };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.current) {
      parsed.current = createEmptyPeriod();
    }
    parsed.current.shifts ??= [];
    parsed.current.expenses ??= [];
    parsed.periods ??= [];
    return parsed;
  } catch (error) {
    console.warn("Не удалось прочитать данные, создаем заново", error);
    return {
      current: createEmptyPeriod(),
      periods: [],
    };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function calculateShift(shift) {
  if (isNoOrderShift(shift)) {
    return {
      basePay: NO_ORDER_PAY,
      dumpPay: 0,
      overtimeHours: 0,
      overtimePay: 0,
      total: NO_ORDER_PAY,
    };
  }

  const rates = RATES[shift.type];
  const hours = Number(getShiftHours(shift)) || 0;
  const dumps = Number(shift.dumps) || 0;

  const overtimeHours = hours > OVERTIME_BASE_HOURS
    ? Math.floor(hours - OVERTIME_BASE_HOURS)
    : 0;
  const overtimePay = overtimeHours * OVERTIME_RATE;
  const dumpPay = dumps * rates.dump;
  const basePay = rates.base;
  const total = basePay + dumpPay + overtimePay;

  return {
    basePay,
    dumpPay,
    overtimeHours,
    overtimePay,
    total,
  };
}

function calculateTotals(shifts, expenses) {
  const income = shifts.reduce((sum, shift) => sum + calculateShift(shift).total, 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  return {
    income,
    expenses: totalExpenses,
    net: income + totalExpenses,
  };
}

function dateLabel(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU");
}

function periodRangeLabel(period) {
  const baseDate = periodBaseDate(period);
  if (!baseDate) return "—";
  return halfMonthLabelFromParts(datePartsFromIso(baseDate));
}

function renderSummary(data) {
  const totals = calculateTotals(data.current.shifts, data.current.expenses);
  elements.totalIncome.textContent = formatRub(totals.income);
  elements.totalExpenses.textContent = formatRub(totals.expenses);
  elements.netIncome.textContent = formatRub(totals.net);

  elements.periodLabel.textContent = periodRangeLabel(data.current);
}

function renderShifts(data) {
  elements.shiftsList.innerHTML = "";

  if (data.current.shifts.length === 0) {
    elements.shiftsList.innerHTML = `<p class="muted">Смен пока нет. Добавьте первую смену выше.</p>`;
    return;
  }

  data.current.shifts.forEach((shift) => {
    const calculation = calculateShift(shift);
    const hours = getShiftHours(shift);
    const item = document.createElement("div");
    item.className = "item";

    item.innerHTML = `
      <div class="item-row">
        <div>
          <h3>${dateLabel(shift.date)} · ${RATES[shift.type].label}</h3>
          <p class="muted">${shiftTimeLabel(shift)} · ${formatHours(hours)} ч, сливы: ${shift.dumps}</p>
        </div>
        <span class="badge">Итого: ${formatRub(calculation.total)}</span>
      </div>
      <div class="item-row">
        <p class="muted">База: ${formatRub(calculation.basePay)}</p>
        <p class="muted">Сливы: ${formatRub(calculation.dumpPay)}</p>
        <p class="muted">Переработка: ${calculation.overtimeHours} ч = ${formatRub(calculation.overtimePay)}</p>
      </div>
      <button class="btn btn-danger" data-action="delete-shift" data-id="${shift.id}">Удалить смену</button>
    `;

    elements.shiftsList.appendChild(item);
  });
}

function renderExpenses(data) {
  elements.expensesList.innerHTML = "";

  if (data.current.expenses.length === 0) {
    elements.expensesList.innerHTML = `<p class="muted">Подотчётных трат пока нет.</p>`;
    return;
  }

  data.current.expenses.forEach((expense) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="item-row">
        <div>
          <h3>${expense.name}</h3>
          <p class="muted">${dateLabel(expense.date)}</p>
        </div>
        <span class="badge">${formatRub(expense.amount)}</span>
      </div>
      <button class="btn btn-danger" data-action="delete-expense" data-id="${expense.id}">Удалить расход</button>
    `;
    elements.expensesList.appendChild(item);
  });
}

function renderPeriods(data) {
  elements.periodsList.innerHTML = "";

  if (data.periods.length === 0) {
    elements.periodsList.innerHTML = `<p class="muted">Закрытых периодов еще нет.</p>`;
    return;
  }

  data.periods
    .slice()
    .reverse()
    .forEach((period) => {
      const totals = calculateTotals(period.shifts, period.expenses);
      const container = document.createElement("div");
      container.className = "period";
      container.innerHTML = `
        <div class="period-header">
          <div>
            <h3>${periodRangeLabel(period)}</h3>
            <p class="muted">Закрыт: ${dateLabel(period.closedAt)}</p>
          </div>
          <span class="badge">Итог к выплате: ${formatRub(totals.net)}</span>
        </div>
        <div class="period-grid">
          <div>
            <p class="muted">Доход</p>
            <p class="value">${formatRub(totals.income)}</p>
          </div>
          <div>
            <p class="muted">Подотчётные траты</p>
            <p class="value">${formatRub(totals.expenses)}</p>
          </div>
          <div>
            <p class="muted">Смен</p>
            <p class="value">${period.shifts.length}</p>
          </div>
          <div>
            <p class="muted">Расходов</p>
            <p class="value">${period.expenses.length}</p>
          </div>
        </div>
        <div class="period-actions">
          <button class="btn btn-secondary" data-action="export-period" data-id="${period.id}">Скачать отчёт (Excel)</button>
          <button class="btn btn-danger" data-action="delete-period" data-id="${period.id}">Удалить период</button>
        </div>
      `;
      elements.periodsList.appendChild(container);
    });
}

function renderAll(data) {
  renderSummary(data);
  renderShifts(data);
  renderExpenses(data);
  renderPeriods(data);
}

function addShift(data) {
  const date = elements.shiftDate.value;
  const noOrder = elements.shiftNoOrder.checked;
  const type = noOrder ? "noorder" : elements.shiftType.value;
  const startTime = elements.shiftStart.value;
  const endTime = elements.shiftEnd.value;
  const dumps = noOrder ? 0 : Number(elements.shiftDumps.value);

  if (!date || !type) {
    alert("Проверьте дату и тип машины.");
    return;
  }

  let hours = 0;
  let safeStart = startTime;
  let safeEnd = endTime;

  if (!noOrder) {
    hours = calculateHoursFromTimes(startTime, endTime);
    if (hours === null) {
      alert("Проверьте время начала и окончания смены.");
      return;
    }
    if (Number.isNaN(dumps) || dumps < 0) {
      alert("Количество сливов не может быть отрицательным.");
      return;
    }
  } else {
    safeStart = "";
    safeEnd = "";
  }

  data.current.shifts.push({
    id: generateId(),
    date,
    type,
    startTime: safeStart,
    endTime: safeEnd,
    hours,
    dumps,
    noOrder,
  });
}

function addExpense(data) {
  const date = elements.expenseDate.value;
  const name = elements.expenseName.value.trim();
  const amount = Number(elements.expenseAmount.value);

  if (!date || !name) {
    alert("Заполните дату и название расхода.");
    return;
  }
  if (Number.isNaN(amount) || amount <= 0) {
    alert("Сумма должна быть больше нуля.");
    return;
  }

  data.current.expenses.push({
    id: generateId(),
    date,
    name,
    amount,
  });
}

function deleteItem(data, type, id) {
  if (type === "shift") {
    data.current.shifts = data.current.shifts.filter((shift) => shift.id !== id);
  }
  if (type === "expense") {
    data.current.expenses = data.current.expenses.filter((expense) => expense.id !== id);
  }
}

function closePeriod(data) {
  if (data.current.shifts.length === 0 && data.current.expenses.length === 0) {
    alert("Нельзя закрыть пустой период. Добавьте хотя бы одну смену или расход.");
    return false;
  }

  const periodToClose = {
    ...data.current,
    closedAt: new Date().toISOString(),
  };

  data.periods.push(periodToClose);
  data.current = createEmptyPeriod();
  return true;
}

function exportPeriodToExcel(period) {
  if (typeof XLSX === "undefined") {
    alert("Библиотека экспорта не загружена. Проверьте подключение к интернету.");
    return;
  }

  const formatDateForExport = (iso) => {
    if (!iso) return "";
    const parts = datePartsFromIso(iso);
    if (!parts) return iso;
    return `${pad2(parts.day)}.${pad2(parts.month)}.${parts.year}`;
  };

  const shiftsHeader = [
    "Дата",
    "Тип машины",
    "Отработанные часы",
    "Часы переработки",
    "Сумма за смену",
    "Сумма за сливы",
    "Сумма за переработку",
    "Итог за день",
  ];

  const shiftsRows = period.shifts.map((shift) => {
    const calculation = calculateShift(shift);
    const hours = roundHours(getShiftHours(shift));
    return [
      formatDateForExport(shift.date),
      RATES[shift.type].label,
      hours,
      calculation.overtimeHours,
      calculation.basePay,
      calculation.dumpPay,
      calculation.overtimePay,
      calculation.total,
    ];
  });

  const expensesHeader = [
    "Дата",
    "Название",
    "Сумма",
    "Пометка",
  ];

  const expensesRows = period.expenses.map((expense) => [
    formatDateForExport(expense.date),
    expense.name,
    Number(expense.amount || 0),
    "к возмещению",
  ]);

  const totals = calculateTotals(period.shifts, period.expenses);
  const summaryRows = [
    ["Период", periodRangeLabel(period)],
    ["Общий доход", totals.income],
    ["Сумма подотчётных трат", totals.expenses],
    ["ИТОГО К ВЫПЛАТЕ", totals.net],
  ];

  const workbook = XLSX.utils.book_new();
  const shiftsSheet = XLSX.utils.aoa_to_sheet([shiftsHeader, ...shiftsRows]);
  const expensesSheet = XLSX.utils.aoa_to_sheet([expensesHeader, ...expensesRows]);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);

  shiftsSheet["!cols"] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
  ];
  shiftsSheet["!autofilter"] = { ref: "A1:H1" };

  expensesSheet["!cols"] = [
    { wch: 12 },
    { wch: 32 },
    { wch: 14 },
    { wch: 18 },
  ];
  expensesSheet["!autofilter"] = { ref: "A1:D1" };

  summarySheet["!cols"] = [
    { wch: 28 },
    { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(workbook, shiftsSheet, "Смены");
  XLSX.utils.book_append_sheet(workbook, expensesSheet, "Подотчёт");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Итог");

  const safeLabel = periodRangeLabel(period).replace(/[^\d.]/g, "_");
  const filename = `Отчет_${safeLabel || period.id}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

function init() {
  const data = loadData();

  elements.shiftDate.value = todayISO();
  elements.expenseDate.value = todayISO();
  toggleNoOrder(elements.shiftNoOrder.checked);

  elements.shiftForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addShift(data);
    saveData(data);
    renderAll(data);
    elements.shiftForm.reset();
    elements.shiftDate.value = todayISO();
    elements.shiftType.value = "kamaz";
    elements.shiftDumps.value = 0;
    elements.shiftNoOrder.checked = false;
    toggleNoOrder(false);
  });

  elements.expenseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addExpense(data);
    saveData(data);
    renderAll(data);
    elements.expenseForm.reset();
    elements.expenseDate.value = todayISO();
  });

  elements.shiftsList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='delete-shift']");
    if (!button) return;
    const id = button.dataset.id;
    if (confirm("Удалить смену?")) {
      deleteItem(data, "shift", id);
      saveData(data);
      renderAll(data);
    }
  });

  elements.expensesList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='delete-expense']");
    if (!button) return;
    const id = button.dataset.id;
    if (confirm("Удалить расход?")) {
      deleteItem(data, "expense", id);
      saveData(data);
      renderAll(data);
    }
  });

  elements.closePeriodBtn.addEventListener("click", () => {
    if (!confirm("Закрыть период? Итоги сохранятся, текущий период начнется заново.")) {
      return;
    }
    const closed = closePeriod(data);
    if (closed) {
      saveData(data);
      renderAll(data);
    }
  });

  elements.shiftNoOrder.addEventListener("change", (event) => {
    toggleNoOrder(event.target.checked);
  });

  elements.periodsList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='export-period']");
    if (button) {
      const periodId = button.dataset.id;
      const period = data.periods.find((item) => item.id === periodId);
      if (!period) return;
      exportPeriodToExcel(period);
      return;
    }

    const deleteButton = event.target.closest("button[data-action='delete-period']");
    if (!deleteButton) return;
    const periodId = deleteButton.dataset.id;
    const period = data.periods.find((item) => item.id === periodId);
    if (!period) return;
    if (!confirm(`Удалить период ${periodRangeLabel(period)}? Данные будут потеряны.`)) {
      return;
    }
    data.periods = data.periods.filter((item) => item.id !== periodId);
    saveData(data);
    renderAll(data);
  });

  renderAll(data);
}

init();
