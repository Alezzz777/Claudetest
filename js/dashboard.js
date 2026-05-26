document.addEventListener('DOMContentLoaded', () => {
  fetch('data/production-data.json')
    .then(res => res.json())
    .then(data => render(data))
    .catch(err => {
      document.querySelector('.dashboard').innerHTML =
        `<p style="color:var(--red);padding:40px;text-align:center;">
          Ошибка загрузки данных: ${err.message}</p>`;
    });
});

function render(data) {
  renderHeader(data.meta, data.safety);
  renderKPIs(data);
  renderHourlyChart(data.production.hourly);
  renderProductsChart(data.production.products);
  renderDefectTrendChart(data.quality.daily_trend, data.quality.target_defect_rate_percent);
  renderDefectTypesChart(data.quality.defect_types);
  renderEquipment(data.equipment);
  renderPersonnel(data.personnel);
  renderKaizen(data.kaizen);
  renderSafetyFooter(data.safety);
  startClock();
}

// --- Header ---
function renderHeader(meta, safety) {
  document.getElementById('facilityName').textContent = meta.facility;
  document.getElementById('shiftInfo').textContent = meta.shift;
  document.getElementById('currentDate').textContent = formatDate(meta.date);
  document.getElementById('safetyDays').textContent = safety.days_without_incident;
  document.getElementById('updatedAt').textContent = formatDateTime(meta.updated_at);
}

// --- KPIs ---
function renderKPIs(data) {
  const { production: p, quality: q, equipment: e, personnel: pr } = data;

  const prodPct = Math.round((p.actual / p.plan) * 100);
  document.getElementById('prodActual').textContent = p.actual.toLocaleString('ru');
  document.getElementById('prodPlan').textContent = p.plan.toLocaleString('ru') + ' ' + p.unit;
  document.getElementById('prodPercent').textContent = prodPct + '%';
  const prodBar = document.getElementById('prodProgress');
  prodBar.style.width = Math.min(prodPct, 100) + '%';
  prodBar.style.background = statusColor(prodPct, 95, 85);
  setCardStatus('kpiProduction', prodPct, 95, 85);

  document.getElementById('fpyValue').textContent = q.fpy_percent + '%';
  document.getElementById('defectRate').textContent = q.defect_rate_percent + '%';
  document.getElementById('defectTarget').textContent = q.target_defect_rate_percent + '%';
  const fpyScore = q.fpy_percent >= q.target_fpy_percent ? 100 : q.fpy_percent >= q.target_fpy_percent - 1 ? 90 : 80;
  setCardStatus('kpiQuality', fpyScore, 95, 85);

  document.getElementById('oeeValue').textContent = e.oee_percent + '%';
  document.getElementById('oeeTarget').textContent = e.target_oee_percent + '%';
  document.getElementById('downtimeTotal').textContent = e.total_downtime_minutes + ' мин';
  const oeeScore = (e.oee_percent / e.target_oee_percent) * 100;
  setCardStatus('kpiOEE', oeeScore, 95, 85);

  document.getElementById('attendanceValue').textContent = pr.attendance_percent + '%';
  document.getElementById('presentCount').textContent = pr.present;
  document.getElementById('totalStaff').textContent = pr.total_staff;
  const attScore = (pr.attendance_percent / pr.target_attendance_percent) * 100;
  setCardStatus('kpiAttendance', attScore, 95, 85);
}

function setCardStatus(id, pct, greenThreshold, yellowThreshold) {
  const el = document.getElementById(id);
  el.classList.remove('kpi-card--green', 'kpi-card--yellow', 'kpi-card--red');
  if (pct >= greenThreshold) el.classList.add('kpi-card--green');
  else if (pct >= yellowThreshold) el.classList.add('kpi-card--yellow');
  else el.classList.add('kpi-card--red');
}

function statusColor(pct, greenT, yellowT) {
  if (pct >= greenT) return 'var(--green)';
  if (pct >= yellowT) return 'var(--yellow)';
  return 'var(--red)';
}

// --- Chart defaults ---
Chart.defaults.color = '#8899aa';
Chart.defaults.borderColor = '#2a3a4a';
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// --- Hourly Chart ---
function renderHourlyChart(hourly) {
  const ctx = document.getElementById('chartHourly').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: hourly.map(h => h.hour),
      datasets: [
        {
          label: 'План',
          data: hourly.map(h => h.plan),
          backgroundColor: 'rgba(52, 152, 219, 0.3)',
          borderColor: 'rgba(52, 152, 219, 0.7)',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Факт',
          data: hourly.map(h => h.actual),
          backgroundColor: hourly.map(h =>
            h.actual >= h.plan ? 'rgba(46, 204, 113, 0.6)' : 'rgba(231, 76, 60, 0.6)'
          ),
          borderColor: hourly.map(h =>
            h.actual >= h.plan ? 'rgba(46, 204, 113, 0.9)' : 'rgba(231, 76, 60, 0.9)'
          ),
          borderWidth: 1,
          borderRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(42,58,74,0.5)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// --- Products Chart ---
function renderProductsChart(products) {
  const ctx = document.getElementById('chartProducts').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: products.map(p => p.name),
      datasets: [
        {
          label: 'План',
          data: products.map(p => p.plan),
          backgroundColor: 'rgba(52, 152, 219, 0.4)',
          borderRadius: 4,
        },
        {
          label: 'Факт',
          data: products.map(p => p.actual),
          backgroundColor: products.map(p =>
            p.actual >= p.plan * 0.95 ? 'rgba(46, 204, 113, 0.6)' : 'rgba(231, 76, 60, 0.6)'
          ),
          borderRadius: 4,
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { beginAtZero: true, grid: { color: 'rgba(42,58,74,0.5)' } },
        y: { grid: { display: false } }
      }
    }
  });
}

// --- Defect Trend ---
function renderDefectTrendChart(trend, target) {
  const ctx = document.getElementById('chartDefectTrend').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.map(t => t.date.slice(5)),
      datasets: [
        {
          label: 'Уровень брака',
          data: trend.map(t => t.defect_rate),
          borderColor: 'rgba(231, 76, 60, 0.9)',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: trend.map(t =>
            t.defect_rate <= target ? '#2ecc71' : '#e74c3c'
          ),
        },
        {
          label: 'Цель',
          data: trend.map(() => target),
          borderColor: 'rgba(46, 204, 113, 0.6)',
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(42,58,74,0.5)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// --- Defect Types (Pareto) ---
function renderDefectTypesChart(types) {
  const sorted = [...types].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((s, t) => s + t.count, 0);
  let cumulative = 0;
  const cumulativeData = sorted.map(t => {
    cumulative += t.count;
    return Math.round((cumulative / total) * 100);
  });

  const ctx = document.getElementById('chartDefectTypes').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(t => t.type),
      datasets: [
        {
          label: 'Количество',
          data: sorted.map(t => t.count),
          backgroundColor: 'rgba(231, 76, 60, 0.5)',
          borderColor: 'rgba(231, 76, 60, 0.8)',
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          label: 'Кумулятивный %',
          data: cumulativeData,
          type: 'line',
          borderColor: 'rgba(241, 196, 15, 0.9)',
          pointBackgroundColor: '#f1c40f',
          pointRadius: 4,
          fill: false,
          tension: 0.2,
          yAxisID: 'y1',
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { beginAtZero: true, position: 'left', grid: { color: 'rgba(42,58,74,0.5)' } },
        y1: { beginAtZero: true, max: 100, position: 'right', grid: { display: false },
          ticks: { callback: v => v + '%' }
        },
        x: { grid: { display: false },
          ticks: { maxRotation: 45, minRotation: 0, font: { size: 10 } }
        }
      }
    }
  });
}

// --- Equipment ---
function renderEquipment(eq) {
  const grid = document.getElementById('machineGrid');
  grid.innerHTML = eq.machines.map(m => `
    <div class="machine-card machine-card--${m.status}">
      <div class="machine-card__id">${m.id}</div>
      <div class="machine-card__name">${m.name}</div>
      <div class="machine-card__oee">${m.status === 'running' ? m.oee + '%' : statusLabel(m.status)}</div>
    </div>
  `).join('');

  const list = document.getElementById('downtimeList');
  list.innerHTML = eq.downtime_reasons.map(d => `
    <div class="downtime-item">
      <span class="downtime-item__reason">
        <span class="downtime-item__dot downtime-item__dot--${d.type}"></span>
        ${d.reason}
      </span>
      <span class="downtime-item__minutes">${d.minutes} мин</span>
    </div>
  `).join('');

  document.getElementById('oeeAvailability').textContent = eq.availability_percent + '%';
  document.getElementById('oeePerformance').textContent = eq.performance_percent + '%';
  document.getElementById('oeeQualityRate').textContent = eq.quality_rate_percent + '%';
}

function statusLabel(status) {
  const labels = { idle: 'Простой', maintenance: 'ТО/Ремонт', running: 'Работает' };
  return labels[status] || status;
}

// --- Personnel ---
function renderPersonnel(pr) {
  const table = document.getElementById('personnelTable');
  table.innerHTML = pr.by_role.map(r => {
    const pct = Math.round((r.present / r.total) * 100);
    return `
      <div class="personnel-row">
        <span class="personnel-row__role">${r.role}</span>
        <span class="personnel-row__count">${r.present} / ${r.total}</span>
        <div class="personnel-row__bar">
          <div class="personnel-row__bar-fill" style="width:${pct}%;background:${pct === 100 ? 'var(--green)' : 'var(--orange)'}"></div>
        </div>
      </div>
    `;
  }).join('');

  const absenceList = document.getElementById('absenceList');
  absenceList.innerHTML = pr.absence_reasons.map(a => `
    <div class="absence-item">
      <span class="absence-item__count">${a.count}</span>
      <span>${a.reason}</span>
    </div>
  `).join('');

  const ctx = document.getElementById('chartAttendanceTrend').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: pr.weekly_attendance.map(w => w.date.slice(5)),
      datasets: [{
        label: 'Явка %',
        data: pr.weekly_attendance.map(w => w.percent),
        borderColor: 'rgba(52, 152, 219, 0.9)',
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: pr.weekly_attendance.map(w =>
          w.percent >= pr.target_attendance_percent ? '#2ecc71' : '#e67e22'
        ),
      },
      {
        label: 'Цель',
        data: pr.weekly_attendance.map(() => pr.target_attendance_percent),
        borderColor: 'rgba(46, 204, 113, 0.5)',
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { min: 80, max: 105, grid: { color: 'rgba(42,58,74,0.5)' },
          ticks: { callback: v => v + '%' }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

// --- Kaizen ---
function renderKaizen(k) {
  document.getElementById('kaizenTotal').textContent = k.suggestions_this_month;
  document.getElementById('kaizenDone').textContent = k.implemented_this_month;
  document.getElementById('kaizenPending').textContent = k.pending;
}

// --- Safety Footer ---
function renderSafetyFooter(s) {
  document.getElementById('incidentsMonth').textContent = s.incidents_this_month;
  document.getElementById('nearMisses').textContent = s.near_misses_this_month;
}

// --- Utils ---
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateTime(dtStr) {
  const d = new Date(dtStr);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function startClock() {
  function tick() {
    const now = new Date();
    document.getElementById('currentTime').textContent =
      now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  tick();
  setInterval(tick, 1000);
}
