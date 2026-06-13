const filters = {
  Region: document.getElementById("filterRegion"),
  Marca: document.getElementById("filterMarca"),
  Tipo_Vehiculo: document.getElementById("filterTipo"),
  Vendedor: document.getElementById("filterVendedor"),
  Modelo_Año: document.getElementById("filterModelo"),
};

const timeGrain = document.getElementById("timeGrain");
const chartHits = new Map();
let activeTimeKey = "Todos";
let hoveredTimeKey = null;

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("es-CO");

const chartColors = {
  ink: "#0d1833",
  navy: "#13264f",
  blue: "#1f66d1",
  blue2: "#2f78df",
  cyan: "#19a7bd",
  pale: "#eef5ff",
  grid: "#e3eaf4",
  muted: "#667386",
  label: "#334155",
  white: "#ffffff",
};

const tonalPalette = ["#0d1833", "#173b7a", "#1f66d1", "#5e95e6", "#a8c7f6"];

function compactValue(value, prefix = "$") {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const format = (num) => {
    const rounded = Math.round(num * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  };

  if (abs >= 1_000_000_000) return `${sign}${prefix}${format(abs / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${sign}${prefix}${format(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${prefix}${format(abs / 1_000)}K`;
  return `${sign}${prefix}${number.format(abs)}`;
}

function uniqueValues(key) {
  return [...new Set(SALES_DATA.map((row) => row[key]))].sort((a, b) => String(a).localeCompare(String(b)));
}

function setFilter(key, value) {
  const select = filters[key];
  if (!select) return;
  select.value = select.value === String(value) ? "Todos" : String(value);
  updateDashboard();
}

function setTimeFilter(value) {
  activeTimeKey = activeTimeKey === value ? "Todos" : value;
  updateDashboard();
}

function populateFilters() {
  Object.entries(filters).forEach(([key, select]) => {
    select.innerHTML = `<option value="Todos">Todos</option>`;
    uniqueValues(key).forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    select.addEventListener("change", updateDashboard);
  });

  timeGrain.addEventListener("change", () => {
    activeTimeKey = "Todos";
    hoveredTimeKey = null;
    updateDashboard();
  });
}

function dateParts(row) {
  const date = new Date(`${row.Fecha_Venta}T00:00:00`);
  const year = String(date.getFullYear());
  const month = `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const day = `${month}-${String(date.getDate()).padStart(2, "0")}`;
  return { year, month, day };
}

function timeKey(row, grain = timeGrain.value) {
  return dateParts(row)[grain];
}

function filteredRows() {
  return SALES_DATA.filter((row) => {
    const filterMatch = Object.entries(filters).every(
      ([key, select]) => select.value === "Todos" || String(row[key]) === select.value
    );
    const timeMatch = activeTimeKey === "Todos" || timeKey(row) === activeTimeKey;
    return filterMatch && timeMatch;
  });
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function groupBy(rows, key, valueKey = "Total_Venta") {
  return rows.reduce((acc, row) => {
    const label = row[key];
    acc[label] = (acc[label] || 0) + Number(row[valueKey] || 0);
    return acc;
  }, {});
}

function groupByTime(rows) {
  const grain = timeGrain.value;
  const grouped = {};
  rows.forEach((row) => {
    const label = timeKey(row, grain);
    grouped[label] = (grouped[label] || 0) + Number(row.Total_Venta || 0);
  });
  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));
}

function topEntries(grouped, limit = 8) {
  return Object.entries(grouped)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  chartHits.set(canvas.id, []);
  return { ctx, width: rect.width, height: rect.height };
}

function registerHit(canvas, hit) {
  chartHits.get(canvas.id).push(hit);
}

function barGradient(ctx, x, y, width, height, active = false) {
  const gradient = ctx.createLinearGradient(x, y + height, x, y);
  gradient.addColorStop(0, active ? chartColors.ink : chartColors.navy);
  gradient.addColorStop(1, active ? chartColors.cyan : chartColors.blue);
  return gradient;
}

function drawAxes(ctx, width, height, padding) {
  ctx.strokeStyle = chartColors.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();
}

function drawTotalLabel(ctx, value, x, y, align = "center", compact = true) {
  ctx.fillStyle = chartColors.ink;
  ctx.font = "900 12px Segoe UI";
  ctx.textAlign = align;
  ctx.fillText(compactValue(value), x, y);
  ctx.fillStyle = chartColors.muted;
  ctx.font = "800 10px Segoe UI";
  ctx.fillText("Total venta", x, y + 13);
}

function drawTooltip(ctx, point) {
  const text = `${point.label}  ${compactValue(point.value)}`;
  ctx.font = "900 12px Segoe UI";
  const width = ctx.measureText(text).width + 22;
  const x = Math.min(Math.max(point.x - width / 2, 10), ctx.canvas.width - width - 10);
  const y = Math.max(point.y - 42, 10);

  ctx.fillStyle = "rgba(13, 24, 51, 0.94)";
  ctx.beginPath();
  ctx.roundRect(x, y, width, 30, 7);
  ctx.fill();
  ctx.fillStyle = chartColors.white;
  ctx.textAlign = "left";
  ctx.fillText(text, x + 11, y + 20);
}

function drawLineChart(canvas, data) {
  const { ctx, width, height } = setupCanvas(canvas);
  const isDay = timeGrain.value === "day";
  const padding = { top: 34, right: 96, bottom: isDay ? 38 : 76, left: 76 };
  const max = Math.max(...data.map((item) => item.value), 1);

  ctx.clearRect(0, 0, width, height);
  drawAxes(ctx, width, height, padding);

  const points = data.map((item, index) => {
    const x = padding.left + (index / Math.max(data.length - 1, 1)) * (width - padding.left - padding.right);
    const y = height - padding.bottom - (item.value / max) * (height - padding.top - padding.bottom);
    return { ...item, x, y };
  });

  const fillGradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  fillGradient.addColorStop(0, "rgba(31, 102, 209, 0.18)");
  fillGradient.addColorStop(1, "rgba(31, 102, 209, 0)");

  if (points.length) {
    ctx.beginPath();
    points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
    ctx.lineTo(points[0].x, height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = fillGradient;
    ctx.fill();
  }

  ctx.beginPath();
  points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.strokeStyle = chartColors.blue;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.stroke();

  points.forEach((point, index) => {
    const isActive = point.label === activeTimeKey;
    const isHovered = point.label === hoveredTimeKey;
    ctx.fillStyle = isActive || isHovered ? chartColors.cyan : chartColors.ink;
    ctx.beginPath();
    ctx.arc(point.x, point.y, isActive || isHovered ? 6 : 3.5, 0, Math.PI * 2);
    ctx.fill();

    registerHit(canvas, {
      x: point.x - 14,
      y: point.y - 14,
      width: 28,
      height: 28,
      label: point.label,
      action: () => setTimeFilter(point.label),
    });

    if (!isDay && (timeGrain.value === "year" || index % Math.ceil(points.length / 9) === 0 || index === points.length - 1 || isActive)) {
      drawTotalLabel(ctx, point.value, point.x, Math.max(point.y - 32, 18));
    }
  });

  ctx.fillStyle = chartColors.muted;
  ctx.font = "800 11px Segoe UI";
  ctx.textAlign = "center";
  if (!isDay) {
    points.forEach((point, index) => {
      const shouldShow = timeGrain.value === "year" || index % Math.ceil(points.length / 12) === 0 || index === points.length - 1 || point.label === activeTimeKey;
      if (shouldShow) {
        ctx.save();
        const isLast = index === points.length - 1;
        ctx.translate(isLast ? point.x - 18 : point.x, height - 36);
        ctx.rotate(timeGrain.value === "month" ? -Math.PI / 6 : 0);
        ctx.fillText(point.label, 0, 0);
        ctx.restore();
      }
    });
  }

  const hoverPoint = points.find((point) => point.label === hoveredTimeKey);
  if (isDay && hoverPoint) drawTooltip(ctx, hoverPoint);
}

function drawVerticalBars(canvas, data, activeValue) {
  const { ctx, width, height } = setupCanvas(canvas);
  const padding = { top: 38, right: 30, bottom: 76, left: 66 };
  const max = Math.max(...data.map((item) => item.value), 1);
  const areaWidth = width - padding.left - padding.right;
  const step = areaWidth / Math.max(data.length, 1);
  const barWidth = Math.max(step * 0.54, 14);

  ctx.clearRect(0, 0, width, height);
  drawAxes(ctx, width, height, padding);

  data.forEach((item, index) => {
    const x = padding.left + index * step + (step - barWidth) / 2;
    const barHeight = (item.value / max) * (height - padding.top - padding.bottom);
    const y = height - padding.bottom - barHeight;
    const isActive = String(activeValue) === String(item.label);
    ctx.fillStyle = barGradient(ctx, x, y, barWidth, barHeight, isActive);
    ctx.fillRect(x, y, barWidth, barHeight);
    drawTotalLabel(ctx, item.value, x + barWidth / 2, Math.max(y - 28, 16));

    registerHit(canvas, {
      x,
      y,
      width: barWidth,
      height: barHeight + padding.bottom,
      action: () => setFilter("Marca", item.label),
    });

    ctx.save();
    ctx.translate(x + barWidth / 2, height - 42);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = chartColors.label;
    ctx.font = "800 11px Segoe UI";
    ctx.textAlign = "right";
    ctx.fillText(item.label, 0, 0);
    ctx.restore();
  });
}

function drawHorizontalBars(canvas, data, activeValue) {
  const { ctx, width, height } = setupCanvas(canvas);
  const padding = { top: 24, right: 90, bottom: 24, left: 120 };
  const max = Math.max(...data.map((item) => item.value), 1);
  const rowHeight = (height - padding.top - padding.bottom) / Math.max(data.length, 1);

  ctx.clearRect(0, 0, width, height);

  data.forEach((item, index) => {
    const barHeight = Math.max(rowHeight - 14, 13);
    const y = padding.top + index * rowHeight + 7;
    const barWidth = (item.value / max) * (width - padding.left - padding.right);
    const isActive = String(activeValue) === String(item.label);
    ctx.fillStyle = chartColors.pale;
    ctx.fillRect(padding.left, y, width - padding.left - padding.right, barHeight);
    ctx.fillStyle = barGradient(ctx, padding.left, y, barWidth, barHeight, isActive);
    ctx.fillRect(padding.left, y, barWidth, barHeight);

    registerHit(canvas, {
      x: padding.left,
      y,
      width: width - padding.left - padding.right,
      height: barHeight,
      action: () => setFilter("Vendedor", item.label),
    });

    ctx.fillStyle = chartColors.ink;
    ctx.font = "800 12px Segoe UI";
    ctx.textAlign = "left";
    ctx.fillText(String(item.label).slice(0, 16), 8, y + barHeight / 2 + 4);
    drawTotalLabel(ctx, item.value, padding.left + barWidth + 10, y + 3, "left");
  });
}

function drawPie(canvas, data, activeValue) {
  const { ctx, width, height } = setupCanvas(canvas);
  const total = data.reduce((acc, item) => acc + item.value, 0) || 1;
  const radius = Math.min(width, height) * 0.29;
  const cx = width * 0.38;
  const cy = height * 0.5;
  let start = -Math.PI / 2;

  ctx.clearRect(0, 0, width, height);
  data.forEach((item, index) => {
    const angle = (item.value / total) * Math.PI * 2;
    const isActive = String(activeValue) === String(item.label);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, isActive ? radius + 6 : radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = isActive ? chartColors.cyan : tonalPalette[index % tonalPalette.length];
    ctx.fill();
    ctx.strokeStyle = chartColors.white;
    ctx.lineWidth = 2;
    ctx.stroke();

    const mid = start + angle / 2;
    registerHit(canvas, {
      x: cx + Math.cos(mid) * radius * 0.55 - radius * 0.45,
      y: cy + Math.sin(mid) * radius * 0.55 - radius * 0.45,
      width: radius * 0.9,
      height: radius * 0.9,
      action: () => setFilter("Region", item.label),
    });

    start += angle;
  });

  ctx.font = "800 12px Segoe UI";
  ctx.textAlign = "left";
  data.forEach((item, index) => {
    const x = width * 0.68;
    const y = 38 + index * 34;
    ctx.fillStyle = tonalPalette[index % tonalPalette.length];
    ctx.fillRect(x, y - 10, 12, 12);
    ctx.fillStyle = chartColors.ink;
    ctx.fillText(`${item.label} ${Math.round((item.value / total) * 100)}%`, x + 18, y);
    ctx.fillStyle = chartColors.muted;
    ctx.font = "800 10px Segoe UI";
    ctx.fillText(`Total venta ${compactValue(item.value)}`, x + 18, y + 14);
    ctx.font = "800 12px Segoe UI";
  });
}

function updateKpis(rows) {
  const sales = sum(rows, "Total_Venta");
  const units = sum(rows, "Cantidad_Vendida");
  document.getElementById("kpiSales").textContent = compactValue(sales);
  document.getElementById("kpiUnits").textContent = number.format(units);
  document.getElementById("kpiTicket").textContent = compactValue(sales / Math.max(rows.length, 1));
  document.getElementById("kpiOrders").textContent = number.format(rows.length);
}

function updateTable(rows) {
  const grouped = {};
  rows.forEach((row) => {
    const key = `${row.Region}|${row.Marca}|${row.Tipo_Vehiculo}`;
    if (!grouped[key]) {
      grouped[key] = { region: row.Region, marca: row.Marca, tipo: row.Tipo_Vehiculo, sales: 0, units: 0, orders: 0 };
    }
    grouped[key].sales += Number(row.Total_Venta || 0);
    grouped[key].units += Number(row.Cantidad_Vendida || 0);
    grouped[key].orders += 1;
  });

  const body = document.getElementById("summaryBody");
  body.innerHTML = "";
  Object.values(grouped)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 12)
    .forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.region}</td>
        <td>${row.marca}</td>
        <td>${row.tipo}</td>
        <td>${currency.format(row.sales)}</td>
        <td>${number.format(row.units)}</td>
        <td>${currency.format(row.sales / Math.max(row.orders, 1))}</td>
      `;
      body.appendChild(tr);
    });
}

function updateDashboard() {
  const rows = filteredRows();
  updateKpis(rows);
  drawLineChart(document.getElementById("lineChart"), groupByTime(rows));
  drawVerticalBars(document.getElementById("brandChart"), topEntries(groupBy(rows, "Marca"), 8), filters.Marca.value);
  drawHorizontalBars(document.getElementById("sellerChart"), topEntries(groupBy(rows, "Vendedor"), 8), filters.Vendedor.value);
  drawPie(document.getElementById("pieChart"), topEntries(groupBy(rows, "Region"), 5), filters.Region.value);
  updateTable(rows);
}

function attachChartEvents() {
  document.querySelectorAll("canvas").forEach((canvas) => {
    canvas.addEventListener("click", (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = (chartHits.get(canvas.id) || []).find(
        (area) => x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height
      );
      if (hit) hit.action();
    });

    canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hits = chartHits.get(canvas.id) || [];
      const hit = hits.find((area) => x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height);
      canvas.style.cursor = hit ? "pointer" : "default";

      if (canvas.id === "lineChart" && timeGrain.value === "day") {
        const nextHover = hit?.label || null;
        if (nextHover !== hoveredTimeKey) {
          hoveredTimeKey = nextHover;
          drawLineChart(canvas, groupByTime(filteredRows()));
        }
      }
    });

    canvas.addEventListener("mouseleave", () => {
      if (canvas.id === "lineChart" && hoveredTimeKey) {
        hoveredTimeKey = null;
        drawLineChart(canvas, groupByTime(filteredRows()));
      }
    });
  });
}

populateFilters();
attachChartEvents();
updateDashboard();
window.addEventListener("resize", updateDashboard);
