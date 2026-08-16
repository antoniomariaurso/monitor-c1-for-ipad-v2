/* Monitor CAE per iPad: nessun server, nessuna dipendenza esterna. */

const STORAGE_KEY = "monitor-cae-ipad-v1";
const PIE_COLORS = ["#277da1", "#f4a261", "#8ab17d", "#9b5de5", "#e76f51", "#457b9d", "#e9c46a", "#2a9d8f"];

// Soglie della guida ufficiale Cambridge (practice tests C1 Advanced, ed. 2023).
// Non esiste una formula pubblica che converta ogni singolo raw score del live exam.
const CAMBRIDGE_COMPONENTS = [
  { key: "Reading", ids: ["P1-1", "P1-5", "P1-6", "P1-7", "P1-8"], max: 50, anchors: [[43, 200], [32, 180], [23, 160], [17, 142]] },
  { key: "Use of English", ids: ["P1-2", "P1-3", "P1-4"], max: 28, anchors: [[23, 200], [16, 180], [11, 160], [8, 142]] },
  { key: "Writing", ids: ["P2-1", "P2-2"], max: 40, anchors: [[34, 200], [24, 180], [16, 160], [10, 142]] },
  { key: "Listening", ids: ["P3-1", "P3-2", "P3-3", "P3-4"], max: 30, anchors: [[26, 200], [18, 180], [13, 160], [11, 142]] },
  { key: "Speaking", ids: [], max: 75, anchors: [[66, 200], [45, 180], [30, 160], [17, 142]] },
];

const EXAM = {
  "Paper 1 – Reading and Use of English": {
    duration: "90 minuti",
    parts: [
      ["P1-1", 1, "Multiple-choice cloze", 8, 8],
      ["P1-2", 2, "Open cloze", 8, 8],
      ["P1-3", 3, "Word formation", 8, 8],
      ["P1-4", 4, "Key word transformations", 6, 12],
      ["P1-5", 5, "Multiple choice (reading)", 6, 12],
      ["P1-6", 6, "Cross-text multiple matching", 4, 8],
      ["P1-7", 7, "Gapped text", 6, 12],
      ["P1-8", 8, "Multiple matching", 10, 10],
    ],
  },
  "Paper 2 – Writing": {
    duration: "90 minuti",
    parts: [
      ["P2-1", 1, "Essay (obbligatorio)", null, 20],
      ["P2-2", 2, "Task a scelta (lettera/email, report, recensione o proposta)", null, 20],
    ],
  },
  "Paper 3 – Listening": {
    duration: "circa 40 minuti",
    parts: [
      ["P3-1", 1, "Multiple choice", 6, 6],
      ["P3-2", 2, "Sentence completion", 8, 8],
      ["P3-3", 3, "Multiple choice", 6, 6],
      ["P3-4", 4, "Multiple matching", 10, 10],
    ],
  },
  "Paper 4 – Speaking": {
    duration: "4 parti",
    parts: [
      ["P4-1", 1, "Interview", null, 25],
      ["P4-2", 2, "Long turn", null, 25],
      ["P4-3", 3, "Collaborative task", null, 25],
      ["P4-4", 4, "Discussion", null, 25],
    ],
  },
};

const papers = Object.keys(EXAM);
const byId = new Map();
const allParts = [];
papers.forEach((paper) => EXAM[paper].parts.forEach((part) => {
  const info = { id: part[0], number: part[1], name: part[2], questions: part[3], max: part[4], paper, label: `Parte ${part[1]} — ${part[2]}` };
  byId.set(info.id, info);
  allParts.push(info);
}));

let pieBasis = "historical";
let toastTimer;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const localDate = () => new Date().toISOString().slice(0, 10);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const number = (value) => Number(value);
const fmtNumber = (value) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(number(value));
const fmtPercent = (value) => `${number(value).toFixed(1).replace(".", ",")}%`;
const fmtDate = (value) => new Intl.DateTimeFormat("it-IT").format(new Date(`${value}T12:00:00`));
const escapeHTML = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

function readResults() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveResults(results) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
}

function notify(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3500);
}

function validRecord(record) {
  const score = number(record.score);
  const maxScore = number(record.maxScore);
  return Boolean(record.date && record.paper && record.partId && byId.has(record.partId))
    && Number.isFinite(score) && Number.isFinite(maxScore) && score >= 0 && maxScore > 0 && score <= maxScore;
}

function normalizeRecord(record) {
  const part = byId.get(record.partId);
  const score = number(record.score);
  const maxScore = number(record.maxScore);
  return {
    id: record.id || uid(),
    sessionId: record.sessionId || uid(),
    date: record.date,
    paper: part.paper,
    partId: part.id,
    partName: part.label,
    score,
    maxScore,
    percentage: Math.round((score / maxScore) * 10000) / 100,
    notes: String(record.notes || "").trim(),
    isFullExam: Boolean(record.isFullExam),
    passThreshold: record.passThreshold === undefined || record.passThreshold === null ? null : number(record.passThreshold),
    cambridgeSpeakingRaw: record.cambridgeSpeakingRaw === undefined || record.cambridgeSpeakingRaw === null ? null : number(record.cambridgeSpeakingRaw),
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function fillPaperSelect(select, selected = papers[0]) {
  select.innerHTML = papers.map((paper) => `<option value="${escapeHTML(paper)}">${escapeHTML(paper)}</option>`).join("");
  select.value = papers.includes(selected) ? selected : papers[0];
}

function partsFor(paper) {
  return EXAM[paper].parts.map((part) => byId.get(part[0]));
}

function renderEntryParts() {
  const paper = $("#entry-paper").value;
  const mode = $("#entry-mode").value;
  const container = $("#part-controls");
  const isFullExam = mode === "exam";
  const parts = isFullExam ? allParts : partsFor(paper);
  const about = isFullExam ? "circa 4 ore" : EXAM[paper].duration;
  $("#entry-paper-field").hidden = isFullExam;
  hideExamOutcome();

  if (mode === "single") {
    container.innerHTML = `
      <p class="part-help">Durata di riferimento: ${escapeHTML(about)}. I punteggi massimi di Writing e Speaking sono modificabili.</p>
      <label>Parte<select id="entry-part"></select></label>
      <div class="form-grid">
        <label>Punteggio ottenuto<input id="entry-score" type="number" min="0" step="0.5" required /></label>
        <label>Punteggio massimo<input id="entry-max-score" type="number" min="0.5" step="0.5" required /></label>
      </div>`;
    const partSelect = $("#entry-part");
    partSelect.innerHTML = parts.map((part) => `<option value="${part.id}">${escapeHTML(part.label)}</option>`).join("");
    const updateMax = () => {
      const part = byId.get(partSelect.value);
      $("#entry-max-score").value = part.max;
      const extra = part.questions ? `${part.questions} domande.` : "Valutazione soggettiva: modifica liberamente entrambi i punteggi.";
      $(".part-help").textContent = `Durata di riferimento: ${about}. ${extra}`;
    };
    partSelect.addEventListener("change", updateMax);
    updateMax();
    return;
  }

  container.innerHTML = `
    <p class="part-help">Durata di riferimento: ${escapeHTML(about)}. ${isFullExam ? "Per ricevere l'esito, inserisci tutte le 18 parti." : "Lascia vuoto un punteggio se non vuoi salvare quella parte."}</p>
    ${isFullExam ? `<div class="exam-settings"><label>Punteggio Speaking per la guida Cambridge (0–75)<input id="cambridge-speaking-score" type="number" min="0" max="75" step="0.5" required /></label><span class="part-help">Per una conversione coerente con la guida, inserisci qui il punteggio Cambridge Speaking complessivo su 75. Le quattro righe Speaking qui sotto restano utili per il tuo monitoraggio, ma non sono la scala ufficiale di valutazione.</span></div>` : ""}
    <div class="paper-table-wrap"><table class="paper-input-table">
      <thead><tr>${isFullExam ? "<th>Paper</th>" : ""}<th>Parte</th><th>Ottenuto</th><th>Massimo</th></tr></thead>
      <tbody>${parts.map((part) => `<tr data-part-id="${part.id}">
        ${isFullExam ? `<td>${escapeHTML(part.paper.replace(/^Paper \d+ – /, ""))}</td>` : ""}
        <td>${escapeHTML(part.label)}</td>
        <td><input class="full-score" type="number" min="0" step="0.5" inputmode="decimal" aria-label="Punteggio ottenuto ${escapeHTML(part.label)}" /></td>
        <td><input class="full-max" type="number" min="0.5" step="0.5" value="${part.max}" inputmode="decimal" aria-label="Punteggio massimo ${escapeHTML(part.label)}" /></td>
      </tr>`).join("")}</tbody>
    </table></div>`;
}

function saveEntry(event) {
  event.preventDefault();
  const mode = $("#entry-mode").value;
  const date = $("#entry-date").value;
  const paper = $("#entry-paper").value;
  const notes = $("#entry-notes").value;
  const sessionId = uid();
  const isFullExam = mode === "exam";
  const candidates = [];

  if (mode === "single") {
    candidates.push({
      date,
      paper,
      partId: $("#entry-part").value,
      score: $("#entry-score").value,
      maxScore: $("#entry-max-score").value,
      notes,
      sessionId,
    });
  } else {
    $$("#part-controls tbody tr").forEach((row) => {
      const score = row.querySelector(".full-score").value;
      if (score !== "") {
        const part = byId.get(row.dataset.partId);
        candidates.push({
          date,
          paper: isFullExam ? part.paper : paper,
          partId: row.dataset.partId,
          score,
          maxScore: row.querySelector(".full-max").value,
          notes,
          sessionId,
        });
      }
    });
  }

  if (!candidates.length) {
    notify("Inserisci almeno un punteggio ottenuto.", true);
    return;
  }
  if (isFullExam && candidates.length !== allParts.length) {
    notify("Per calcolare l'esito dell'esame intero devi inserire il punteggio di tutte le 18 parti.", true);
    return;
  }
  if (!candidates.every(validRecord)) {
    notify("Controlla che ogni punteggio sia tra zero e il suo massimo.", true);
    return;
  }

  const cambridgeSpeakingRaw = isFullExam ? number($("#cambridge-speaking-score").value) : null;
  if (isFullExam && (!Number.isFinite(cambridgeSpeakingRaw) || cambridgeSpeakingRaw < 0 || cambridgeSpeakingRaw > 75)) {
    notify("Per la Scala Cambridge inserisci il punteggio Speaking ufficiale, da 0 a 75.", true);
    return;
  }
  const savedRecords = candidates.map((candidate) => normalizeRecord({ ...candidate, isFullExam, cambridgeSpeakingRaw }));
  const results = readResults();
  saveResults([...results, ...savedRecords]);
  $("#entry-notes").value = "";
  renderEntryParts();
  renderDashboard(true);
  if (isFullExam) {
    showExamOutcome(savedRecords, cambridgeSpeakingRaw);
  }
  notify(`${candidates.length} risultati salvati su questo iPad.`);
}

function hideExamOutcome() {
  const outcome = $("#exam-outcome");
  outcome.hidden = true;
  outcome.className = "exam-outcome";
  outcome.innerHTML = "";
}

function scoreRangeFromOfficialAnchors(rawScore, anchors) {
  for (const [rawMinimum, scaleMinimum] of anchors) {
    if (rawScore >= rawMinimum) {
      const scaleMaximum = scaleMinimum === 200 ? 210 : scaleMinimum + 19;
      const level = scaleMinimum >= 200 ? "C2" : scaleMinimum >= 180 ? "C1" : scaleMinimum >= 160 ? "B2" : "nessun livello certificato";
      return { lower: scaleMinimum, upper: scaleMaximum, level };
    }
  }
  return { lower: 0, upper: 141, level: "sotto il minimo riportato" };
}

function calculateCambridgeGuide(records, speakingRaw) {
  const components = CAMBRIDGE_COMPONENTS.map((definition) => {
    const matching = definition.ids.length ? records.filter((record) => definition.ids.includes(record.partId)) : [];
    const rawScore = definition.key === "Speaking"
      ? speakingRaw
      : matching.reduce((total, record) => total + number(record.score), 0);
    const rawMax = definition.key === "Speaking"
      ? 75
      : matching.reduce((total, record) => total + number(record.maxScore), 0);
    return {
      ...definition,
      rawScore,
      rawMax,
      validMaximum: Math.abs(rawMax - definition.max) < 0.01,
      range: scoreRangeFromOfficialAnchors(rawScore, definition.anchors),
    };
  });
  const valid = components.every((component) => component.validMaximum);
  const lower = Math.round(components.reduce((total, component) => total + component.range.lower, 0) / components.length);
  const upper = Math.round(components.reduce((total, component) => total + component.range.upper, 0) / components.length);
  return { components, valid, lower, upper };
}

function showExamOutcome(records, speakingRaw) {
  const guide = calculateCambridgeGuide(records, speakingRaw);
  const outcome = $("#exam-outcome");
  outcome.hidden = false;
  if (!guide.valid) {
    outcome.className = "exam-outcome is-borderline";
    outcome.innerHTML = `<h3>Conversione Cambridge non disponibile</h3><p>Per applicare la guida ufficiale, i massimi inseriti devono essere: Reading 50, Use of English 28, Writing 40, Listening 30 e Speaking 75.</p><small>Non ho trasformato i punteggi perché un massimo diverso renderebbe la conversione fuorviante.</small>`;
    return;
  }
  const passed = guide.lower >= 180;
  const failed = guide.upper < 180;
  const state = passed ? "is-passed" : failed ? "is-failed" : "is-borderline";
  const title = passed ? "Fascia C1 raggiunta nella simulazione" : failed ? "Fascia C1 non ancora raggiunta" : "Vicino alla soglia C1";
  const resultText = passed
    ? "Con queste soglie ufficiali, la simulazione ricade sicuramente nella fascia C1 o superiore."
    : failed
      ? "Con queste soglie ufficiali, la simulazione resta sotto la fascia C1."
      : "I dati pubblici non permettono di stabilire con certezza l'esito: sei nella fascia di confine.";
  const details = guide.components.map((component) => `<li><strong>${component.key}</strong>: ${fmtNumber(component.rawScore)}/${component.max} → Scala ${component.range.lower}–${component.range.upper} (${component.range.level})</li>`).join("");
  outcome.className = `exam-outcome ${state}`;
  outcome.innerHTML = `<h3>${title}</h3><p>${resultText} Intervallo complessivo indicativo: <strong>Scala Cambridge ${guide.lower}–${guide.upper}</strong>.</p><ul>${details}</ul><small>Basato sulla guida ufficiale Cambridge per practice test ufficiali. Cambridge specifica che le tabelle sono diagnostiche e non predicono un punteggio preciso dell'esame reale.</small>`;
}

function currentFilters() {
  const checkedPapers = $$("#paper-filter-list input:checked").map((input) => input.value);
  return {
    start: $("#filter-start").value,
    end: $("#filter-end").value,
    papers: checkedPapers,
    low: Math.min(number($("#threshold-low").value), number($("#threshold-high").value)),
    high: Math.max(number($("#threshold-low").value), number($("#threshold-high").value)),
  };
}

function filteredResults() {
  const filters = currentFilters();
  return readResults().filter((record) => (!filters.start || record.date >= filters.start)
    && (!filters.end || record.date <= filters.end)
    && filters.papers.includes(record.paper));
}

function weightedParts(records) {
  const grouped = new Map();
  records.forEach((record) => {
    const current = grouped.get(record.partId) || { score: 0, maxScore: 0 };
    current.score += number(record.score);
    current.maxScore += number(record.maxScore);
    grouped.set(record.partId, current);
  });
  return allParts.map((part, order) => {
    const values = grouped.get(part.id);
    return { ...part, order, score: values?.score, maxScore: values?.maxScore, percentage: values ? (100 * values.score / values.maxScore) : null };
  });
}

function setDashboardFilterOptions(preserve = false) {
  const records = readResults();
  const previous = preserve ? currentFilters() : { papers, start: "", end: "" };
  const dates = records.map((record) => record.date).sort();
  const start = $("#filter-start");
  const end = $("#filter-end");
  const minDate = dates[0] || "";
  const maxDate = dates.at(-1) || "";
  start.min = end.min = minDate;
  start.max = end.max = maxDate;
  start.value = previous.start || minDate;
  end.value = previous.end || maxDate;
  $("#paper-filter-list").innerHTML = papers.map((paper) => `<label><input type="checkbox" value="${escapeHTML(paper)}" ${previous.papers.includes(paper) ? "checked" : ""} />${escapeHTML(paper.replace(/^Paper \d+ – /, ""))}</label>`).join("");
  $$("#paper-filter-list input").forEach((input) => input.addEventListener("change", () => renderDashboard()));
}

function resultClass(value, low, high) {
  if (value < low) return "score-low";
  if (value <= high) return "score-mid";
  return "score-high";
}

function renderSummary(records) {
  const totalMax = records.reduce((total, record) => total + number(record.maxScore), 0);
  const totalScore = records.reduce((total, record) => total + number(record.score), 0);
  const sessions = new Set(records.map((record) => record.sessionId || record.id)).size;
  $("#metric-sessions").textContent = sessions;
  $("#metric-average").textContent = totalMax ? fmtPercent(100 * totalScore / totalMax) : "—";
  $("#metric-last-date").textContent = records.length ? fmtDate(records.map((record) => record.date).sort().at(-1)) : "—";
}

function renderWeaknesses(records) {
  const weakest = weightedParts(records).filter((part) => part.percentage !== null).sort((a, b) => a.percentage - b.percentage).slice(0, 5);
  $("#weakness-message").textContent = weakest.length
    ? `Le aree su cui concentrarti di più sono: ${weakest.map((part) => `${part.label} (${fmtPercent(part.percentage)})`).join("; ")}.`
    : "Inserisci qualche risultato per ricevere un'analisi automatica delle carenze.";
}

function polar(cx, cy, radius, angle) {
  const radian = (angle - 90) * Math.PI / 180;
  return [cx + radius * Math.cos(radian), cy + radius * Math.sin(radian)];
}

function arcPath(cx, cy, radius, start, end) {
  const [x1, y1] = polar(cx, cy, radius, end);
  const [x2, y2] = polar(cx, cy, radius, start);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 0 ${x2} ${y2} Z`;
}

function renderPie(records) {
  const paper = $("#pie-paper").value;
  let input = records.filter((record) => record.paper === paper);
  if (pieBasis === "latest" && input.length) {
    const latest = input.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1).sessionId;
    input = input.filter((record) => record.sessionId === latest);
  }
  const parts = weightedParts(input).filter((part) => part.paper === paper && part.percentage !== null);
  const target = $("#pie-chart");
  if (!parts.length) {
    target.className = "pie-chart chart-empty";
    target.textContent = "Nessun dato per questo paper con i filtri selezionati.";
    return;
  }
  const total = parts.reduce((sum, part) => sum + part.percentage, 0);
  let angle = 0;
  const paths = parts.map((part, index) => {
    const next = angle + (part.percentage / total) * 360;
    const path = arcPath(130, 130, 102, angle, next);
    angle = next;
    return `<path d="${path}" fill="${PIE_COLORS[index % PIE_COLORS.length]}"><title>${escapeHTML(part.label)}: ${fmtPercent(part.percentage)}</title></path>`;
  }).join("");
  target.className = "pie-chart";
  target.innerHTML = `<svg viewBox="0 0 260 260" role="img" aria-label="Grafico a torta delle parti"><circle cx="130" cy="130" r="56" fill="white"/><text x="130" y="124" text-anchor="middle" class="svg-label">${pieBasis === "latest" ? "Ultima" : "Media"}</text><text x="130" y="143" text-anchor="middle" class="svg-label">simulazione</text>${paths}</svg>
    <div class="pie-legend">${parts.map((part, index) => `<div class="pie-legend-item"><span class="legend-name"><i class="legend-dot" style="background:${PIE_COLORS[index % PIE_COLORS.length]}"></i><span>${escapeHTML(part.label)}</span></span><strong>${fmtPercent(part.percentage)}</strong></div>`).join("")}</div>`;
}

function renderBars(records) {
  const parts = weightedParts(records).sort((a, b) => (a.percentage ?? -1) - (b.percentage ?? -1) || a.order - b.order);
  const target = $("#bar-chart");
  target.className = "bar-chart";
  target.innerHTML = parts.map((part) => {
    const value = part.percentage ?? 0;
    const data = part.percentage === null ? "Nessun dato" : fmtPercent(value);
    return `<div class="bar-row" title="${escapeHTML(part.label)}: ${data}"><span class="bar-label">${escapeHTML(part.paper.replace(/^Paper \d+ – /, ""))}: ${escapeHTML(part.label.replace(/^Parte \d+ — /, ""))}</span><span class="bar-track"><i class="bar-fill ${part.percentage === null ? "no-data" : ""}" style="width:${value}%"></i></span><strong class="bar-value">${data}</strong></div>`;
  }).join("");
}

function groupedTrend(records, kind, target) {
  const selected = records.filter((record) => kind === "paper" ? record.paper === target : record.partId === target);
  const map = new Map();
  selected.forEach((record) => {
    const values = map.get(record.date) || { score: 0, maxScore: 0 };
    values.score += number(record.score);
    values.maxScore += number(record.maxScore);
    map.set(record.date, values);
  });
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, percentage: 100 * values.score / values.maxScore }));
}

function renderTrendTarget(records) {
  const kind = $("#trend-mode").value;
  const target = $("#trend-target");
  const current = target.value;
  const options = kind === "paper"
    ? papers.map((paper) => ({ value: paper, label: paper }))
    : weightedParts(records).filter((part) => part.percentage !== null).map((part) => ({ value: part.id, label: `${part.paper} — ${part.label}` }));
  target.innerHTML = options.map((option) => `<option value="${escapeHTML(option.value)}">${escapeHTML(option.label)}</option>`).join("");
  target.value = options.some((option) => option.value === current) ? current : options[0]?.value || "";
}

function renderLine(records) {
  const kind = $("#trend-mode").value;
  const targetValue = $("#trend-target").value;
  const trend = targetValue ? groupedTrend(records, kind, targetValue) : [];
  const target = $("#line-chart");
  if (!trend.length) {
    target.className = "line-chart chart-empty";
    target.textContent = "Nessun dato per costruire l'andamento.";
    return;
  }
  const width = 640;
  const height = 250;
  const margin = { top: 20, right: 18, bottom: 42, left: 42 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const x = (index) => margin.left + (trend.length === 1 ? plotWidth / 2 : index * plotWidth / (trend.length - 1));
  const y = (value) => margin.top + (100 - value) * plotHeight / 100;
  const grid = [0, 25, 50, 75, 100].map((value) => `<line class="line-grid" x1="${margin.left}" x2="${width - margin.right}" y1="${y(value)}" y2="${y(value)}"/><text class="svg-label" x="4" y="${y(value) + 4}">${value}%</text>`).join("");
  const points = trend.map((item, index) => `${x(index)},${y(item.percentage)}`).join(" ");
  const labels = trend.map((item, index) => (index === 0 || index === trend.length - 1 || trend.length <= 4 ? `<text class="svg-label" text-anchor="middle" x="${x(index)}" y="${height - 15}">${fmtDate(item.date)}</text>` : "")).join("");
  const dots = trend.map((item, index) => `<circle class="line-point" cx="${x(index)}" cy="${y(item.percentage)}" r="4"><title>${fmtDate(item.date)}: ${fmtPercent(item.percentage)}</title></circle>`).join("");
  target.className = "line-chart";
  target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Andamento percentuale"><line class="line-axis" x1="${margin.left}" x2="${width - margin.right}" y1="${height - margin.bottom}" y2="${height - margin.bottom}"/>${grid}<polyline class="line-path" points="${points}"/>${dots}${labels}</svg>`;
}

function renderResultsTable(records) {
  const { low, high } = currentFilters();
  $("#results-table").innerHTML = records.slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt))).map((record) => `<tr>
    <td>${fmtDate(record.date)}</td><td>${escapeHTML(record.paper.replace(/^Paper \d+ – /, ""))}</td><td>${escapeHTML(record.partName)}</td><td>${fmtNumber(record.score)}/${fmtNumber(record.maxScore)}</td><td><span class="percent-cell ${resultClass(record.percentage, low, high)}">${fmtPercent(record.percentage)}</span></td>
  </tr>`).join("") || `<tr><td colspan="5" class="muted">Nessun risultato con questi filtri.</td></tr>`;
}

function renderManager() {
  const records = readResults().slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
  $("#record-count").textContent = `${records.length} risultati salvati`;
  $("#record-manager").innerHTML = records.map((record) => `<article class="record-row"><div><p><strong>${fmtDate(record.date)}</strong> · ${escapeHTML(record.paper.replace(/^Paper \d+ – /, ""))} · ${escapeHTML(record.partName)}</p><span class="muted">${fmtNumber(record.score)}/${fmtNumber(record.maxScore)} · ${fmtPercent(record.percentage)}${record.notes ? ` · ${escapeHTML(record.notes)}` : ""}</span></div><button class="edit-button" type="button" data-edit-id="${record.id}">Modifica</button></article>`).join("") || `<p class="muted">Non ci sono risultati da gestire.</p>`;
}

function renderDashboard(resetFilters = false) {
  if (resetFilters) setDashboardFilterOptions(true);
  const records = filteredResults();
  renderSummary(records);
  renderWeaknesses(records);
  fillPieOptions();
  renderPie(records);
  renderBars(records);
  renderTrendTarget(records);
  renderLine(records);
  renderResultsTable(records);
  renderManager();
}

function fillPieOptions() {
  const select = $("#pie-paper");
  const current = select.value;
  select.innerHTML = papers.map((paper) => `<option value="${escapeHTML(paper)}">${escapeHTML(paper)}</option>`).join("");
  select.value = papers.includes(current) ? current : papers[0];
}

function openEditor(id) {
  const record = readResults().find((item) => item.id === id);
  if (!record) return;
  $("#edit-id").value = id;
  $("#edit-date").value = record.date;
  fillPaperSelect($("#edit-paper"), record.paper);
  fillEditParts(record.partId);
  $("#edit-score").value = record.score;
  $("#edit-max-score").value = record.maxScore;
  $("#edit-notes").value = record.notes || "";
  $("#edit-modal").classList.add("is-open");
  $("#edit-modal").setAttribute("aria-hidden", "false");
}

function fillEditParts(selectedId) {
  const select = $("#edit-part");
  const options = partsFor($("#edit-paper").value);
  select.innerHTML = options.map((part) => `<option value="${part.id}">${escapeHTML(part.label)}</option>`).join("");
  select.value = options.some((part) => part.id === selectedId) ? selectedId : options[0].id;
}

function closeEditor() {
  $("#edit-modal").classList.remove("is-open");
  $("#edit-modal").setAttribute("aria-hidden", "true");
}

function updateRecord(event) {
  event.preventDefault();
  const id = $("#edit-id").value;
  const old = readResults().find((record) => record.id === id);
  const candidate = {
    ...old,
    date: $("#edit-date").value,
    paper: $("#edit-paper").value,
    partId: $("#edit-part").value,
    score: $("#edit-score").value,
    maxScore: $("#edit-max-score").value,
    notes: $("#edit-notes").value,
  };
  if (!validRecord(candidate)) {
    notify("Controlla i punteggi prima di aggiornare.", true);
    return;
  }
  saveResults(readResults().map((record) => record.id === id ? normalizeRecord(candidate) : record));
  closeEditor();
  renderDashboard(true);
  notify("Risultato aggiornato.");
}

function deleteRecord() {
  const id = $("#edit-id").value;
  if (!confirm("Eliminare definitivamente questo risultato?")) return;
  saveResults(readResults().filter((record) => record.id !== id));
  closeEditor();
  renderDashboard(true);
  notify("Risultato eliminato.");
}

function download(filename, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const backup = { application: "Monitor CAE iPad", version: 1, exportedAt: new Date().toISOString(), results: readResults() };
  download(`monitor-cae-backup-${localDate()}.json`, JSON.stringify(backup, null, 2), "application/json");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportCsv() {
  const headers = ["id", "session_id", "data", "paper", "parte", "ottenuto", "massimo", "percentuale", "note"];
  const rows = readResults().map((record) => [record.id, record.sessionId, record.date, record.paper, record.partName, record.score, record.maxScore, record.percentage, record.notes]);
  download(`monitor-cae-${localDate()}.csv`, `\ufeff${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}`, "text/csv;charset=utf-8");
}

async function importBackup() {
  const file = $("#import-file").files[0];
  if (!file) {
    notify("Scegli prima un file JSON di backup.", true);
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    const source = Array.isArray(parsed) ? parsed : parsed.results;
    if (!Array.isArray(source)) throw new Error("Formato assente");
    const imported = source.filter(validRecord).map(normalizeRecord);
    if (!imported.length && source.length) throw new Error("Risultati non validi");
    const mode = $("#import-mode").value;
    if (mode === "replace" && !confirm("Sostituire tutti i dati presenti su questo iPad?")) return;
    const current = mode === "merge" ? readResults() : [];
    const ids = new Set(current.map((record) => record.id));
    const uniqueImported = imported.map((record) => ids.has(record.id) ? { ...record, id: uid() } : record);
    saveResults([...current, ...uniqueImported]);
    $("#import-file").value = "";
    setDashboardFilterOptions(true);
    renderDashboard();
    notify(`${uniqueImported.length} risultati importati.`);
  } catch {
    notify("Il file non è un backup Monitor CAE valido.", true);
  }
}

function clearAllData() {
  if (!confirm("Eliminare tutti i risultati salvati su questo iPad? Questa operazione non è annullabile.")) return;
  localStorage.removeItem(STORAGE_KEY);
  setDashboardFilterOptions();
  renderDashboard();
  notify("Tutti i dati locali sono stati eliminati.");
}

function setupNavigation() {
  $$(".nav-button").forEach((button) => button.addEventListener("click", () => {
    const view = button.dataset.view;
    $$(".nav-button").forEach((item) => item.classList.toggle("is-active", item === button));
    $$("[data-view-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.viewPanel === view));
    if (view === "dashboard") renderDashboard();
  }));
}

function setupEvents() {
  $("#entry-mode").addEventListener("change", renderEntryParts);
  $("#entry-paper").addEventListener("change", renderEntryParts);
  $("#entry-form").addEventListener("submit", saveEntry);
  ["#filter-start", "#filter-end", "#threshold-low", "#threshold-high"].forEach((selector) => $(selector).addEventListener("change", () => renderDashboard()));
  $("#pie-paper").addEventListener("change", () => renderPie(filteredResults()));
  $$("[data-pie-basis]").forEach((button) => button.addEventListener("click", () => {
    pieBasis = button.dataset.pieBasis;
    $$("[data-pie-basis]").forEach((item) => item.classList.toggle("is-selected", item === button));
    renderPie(filteredResults());
  }));
  $("#trend-mode").addEventListener("change", () => { renderTrendTarget(filteredResults()); renderLine(filteredResults()); });
  $("#trend-target").addEventListener("change", () => renderLine(filteredResults()));
  $("#record-manager").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-id]");
    if (button) openEditor(button.dataset.editId);
  });
  $$("[data-close-modal]").forEach((button) => button.addEventListener("click", closeEditor));
  $("#edit-paper").addEventListener("change", () => {
    fillEditParts();
    $("#edit-max-score").value = byId.get($("#edit-part").value).max;
  });
  $("#edit-part").addEventListener("change", () => {
    const part = byId.get($("#edit-part").value);
    $("#edit-max-score").value = part.max;
  });
  $("#edit-form").addEventListener("submit", updateRecord);
  $("#delete-record").addEventListener("click", deleteRecord);
  $("#export-json").addEventListener("click", exportJson);
  $("#export-csv").addEventListener("click", exportCsv);
  $("#import-button").addEventListener("click", importBackup);
  $("#clear-data").addEventListener("click", clearAllData);
}

function init() {
  $("#entry-date").value = localDate();
  fillPaperSelect($("#entry-paper"));
  fillPaperSelect($("#edit-paper"));
  setDashboardFilterOptions();
  renderEntryParts();
  renderDashboard();
  setupNavigation();
  setupEvents();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

document.addEventListener("DOMContentLoaded", init);
