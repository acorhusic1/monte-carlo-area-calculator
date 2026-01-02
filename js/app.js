// ==============================
// GLOBALNE VARIJABLE
// ==============================
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const btnCloseShape = document.getElementById("btnCloseShape");
const btnRunMC = document.getElementById("btnRunMC");
const btnClear = document.getElementById("btnClear");
const btnDownloadCSV = document.getElementById("btnDownloadCSV"); // NOVO
const mcPointsInput = document.getElementById("mcPoints");

const exactAreaSpan = document.getElementById("exactArea");
const mcAreaSpan = document.getElementById("mcArea");
const absErrorSpan = document.getElementById("absError");
const relErrorSpan = document.getElementById("relError");
const logDiv = document.getElementById("log");

let drawing = false;
let vertices = [];        // niz tačaka {x, y}
let shapeClosed = false;  // da li je poligon zatvoren
let mcRunning = false;
const BBOX_PADDING = 0;

// Niz za čuvanje rezultata eksperimenata
let simulationResults = [];

// ==============================
// POMOĆNE FUNKCIJE ZA LOG
// ==============================
function log(msg) {
  const p = document.createElement("p");
  p.textContent = msg;
  logDiv.appendChild(p);
  logDiv.scrollTop = logDiv.scrollHeight;
}

function resetResults() {
  exactAreaSpan.textContent = "-";
  mcAreaSpan.textContent = "-";
  absErrorSpan.textContent = "-";
  relErrorSpan.textContent = "-";
}

function formatNumber(value, fractionDigits = 2) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

// ==============================
// CRTANJE
// ==============================
function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // pozadina
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPolygonPath(targetCtx, points, closePath = true) {
  if (!points.length) return false;
  targetCtx.beginPath();
  targetCtx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    targetCtx.lineTo(points[i].x, points[i].y);
  }
  if (closePath) {
    targetCtx.closePath();
  }
  return true;
}

function redrawShape() {
  clearCanvas();
  if (vertices.length === 0) return;

  ctx.strokeStyle = "#f97316"; // narandžasta linija
  ctx.lineWidth = 2;
  const shouldClose = shapeClosed && vertices.length > 2;
  if (drawPolygonPath(ctx, vertices, shouldClose)) {
    ctx.stroke();
  }
}

// ==============================
// EVENT HANDLERI ZA MIŠ
// ==============================
canvas.addEventListener("mousedown", (e) => {
  if (shapeClosed || mcRunning) return; 

  drawing = true;
  vertices = [];
  shapeClosed = false;
  resetResults();
  btnRunMC.disabled = true;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  vertices.push({ x, y });
  clearCanvas();
  ctx.beginPath();
  ctx.moveTo(x, y);
  btnCloseShape.disabled = false;
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing || shapeClosed) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  vertices.push({ x, y });
  ctx.lineTo(x, y);
  ctx.strokeStyle = "#f97316";
  ctx.lineWidth = 2;
  ctx.stroke();
});

function finalizeShapeClosure() {
  if (shapeClosed || vertices.length < 3) return false;
  shapeClosed = true;
  drawing = false;
  btnCloseShape.disabled = true;
  btnRunMC.disabled = false;
  redrawShape();

  const exactArea = polygonArea(vertices);
  exactAreaSpan.textContent = exactArea.toFixed(2);
  log(`Oblik zatvoren. Tačna površina (shoelace): ${exactArea.toFixed(4)}`);
  return true;
}

canvas.addEventListener("mouseup", () => {
  if (!drawing || shapeClosed) return;
  drawing = false;
  finalizeShapeClosure();
});

canvas.addEventListener("mouseleave", () => {
  if (!drawing || shapeClosed) return;
  drawing = false;
  finalizeShapeClosure();
});

// ==============================
// POLIGON – POVRŠINA (SHOELACE)
// ==============================
function polygonArea(vertices) {
  const n = vertices.length;
  if (n < 3) return 0;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  return Math.abs(sum) / 2;
}

// ==============================
// POINT-IN-POLYGON (RAY CASTING)
// ==============================
function pointInPolygon(p, vertices) {
  let inside = false;
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;

    const intersect =
      ((yi > p.y) !== (yj > p.y)) &&
      (p.x < (xj - xi) * (p.y - yi) / ((yj - yi) || 1e-12) + xi);

    if (intersect) inside = !inside;
  }
  return inside;
}

// ==============================
// BOUNDING BOX
// ==============================
function computeBoundingBox(vertices) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of vertices) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

// ==============================
// MONTE CARLO
// ==============================
function runMonteCarlo(numPoints) {
  if (!shapeClosed || vertices.length < 3) {
    alert("Prvo nacrtaj oblik.");
    return;
  }
  if (mcRunning) return;

  const bbox = computeBoundingBox(vertices);
  const minX = Math.max(0, bbox.minX - BBOX_PADDING);
  const maxX = Math.min(canvas.width, bbox.maxX + BBOX_PADDING);
  const minY = Math.max(0, bbox.minY - BBOX_PADDING);
  const maxY = Math.min(canvas.height, bbox.maxY + BBOX_PADDING);
  const width = maxX - minX;
  const height = maxY - minY;
  if (width === 0 || height === 0) {
    alert("Oblik mora imati površinu različitu od nule.");
    return;
  }

  mcRunning = true;
  btnRunMC.disabled = true;
  btnClear.disabled = true;
  btnDownloadCSV.disabled = true; // Onemogući skidanje dok traje simulacija

  const boxArea = width * height;
  const exactArea = polygonArea(vertices);
  exactAreaSpan.textContent = exactArea.toFixed(2);

  let insideCount = 0;
  let processedPoints = 0;

  // Početak mjerenja vremena
  const startTime = performance.now();

  redrawShape();

  const pointsPerFrame = Math.max(1, Math.round(numPoints / 120));

  function finalizeMonteCarlo() {
    // Kraj mjerenja vremena
    const endTime = performance.now();
    const duration = endTime - startTime;

    const mcArea = boxArea * (insideCount / numPoints);
    const absError = Math.abs(mcArea - exactArea);
    const relError = exactArea > 0 ? absError / exactArea : 0;
    const relErrorPercent = relError * 100;

    mcAreaSpan.textContent = mcArea.toFixed(2);
    absErrorSpan.textContent = formatNumber(absError, 2);
    relErrorSpan.textContent = relErrorPercent.toFixed(3) + " %";

    log(
      `Monte Carlo (N=${numPoints}): ` +
        `Vrijeme=${duration.toFixed(2)}ms, ` +
        `Greška=${relErrorPercent.toFixed(3)}%`
    );

    // Čuvanje rezultata u niz
    simulationResults.push({
        N: numPoints,
        Time_ms: duration.toFixed(4),
        ExactArea: exactArea.toFixed(4),
        MCArea: mcArea.toFixed(4),
        AbsError: absError.toFixed(4),
        RelError_Percent: relErrorPercent.toFixed(4)
    });
    console.log("Rezultat dodan u dataset.", simulationResults);

    mcRunning = false;
    btnRunMC.disabled = false;
    btnClear.disabled = false;
    btnDownloadCSV.disabled = false;
  }

  function step() {
    const targetCount = Math.min(processedPoints + pointsPerFrame, numPoints);
    for (; processedPoints < targetCount; processedPoints++) {
      const x = minX + Math.random() * width;
      const y = minY + Math.random() * height;
      const p = { x, y };

      const inside = pointInPolygon(p, vertices);
      if (inside) insideCount++;

      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = inside ? "#22c55e" : "#ef4444";
      ctx.fill();
    }

    if (processedPoints < numPoints) {
      requestAnimationFrame(step);
    } else {
      finalizeMonteCarlo();
    }
  }

  requestAnimationFrame(step);
}

// ==============================
// EXPORT CSV FUNKCIJA (NOVO)
// ==============================
function downloadCSV() {
    if (simulationResults.length === 0) {
        alert("Nema rezultata za preuzimanje. Pokreni simulaciju bar jednom.");
        return;
    }

    // Zaglavlje CSV-a
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "N,Time_ms,ExactArea,MCArea,AbsError,RelError_Percent\n";

    // Redovi podataka
    simulationResults.forEach(row => {
        csvContent += `${row.N},${row.Time_ms},${row.ExactArea},${row.MCArea},${row.AbsError},${row.RelError_Percent}\n`;
    });

    // Kreiranje linka za download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "monte_carlo_results.csv");
    document.body.appendChild(link); // Potrebno za Firefox
    link.click();
    document.body.removeChild(link);
}

// ==============================
// DUGMAD
// ==============================
btnCloseShape.addEventListener("click", () => {
  if (vertices.length < 3) {
    alert("Premalo tačaka da se formira oblik.");
    return;
  }
  finalizeShapeClosure();
});

btnRunMC.addEventListener("click", () => {
  const N = parseInt(mcPointsInput.value, 10);
  if (!Number.isFinite(N) || N <= 0) {
    alert("Unesi validan broj Monte Carlo tačaka.");
    return;
  }
  resetResults();
  runMonteCarlo(N);
});

// Listener za CSV dugme
btnDownloadCSV.addEventListener("click", downloadCSV);

btnClear.addEventListener("click", () => {
  if (mcRunning) {
    alert("Sačekaj da Monte Carlo simulacija završi pre resetovanja.");
    return;
  }

  vertices = [];
  shapeClosed = false;
  drawing = false;
  
  clearCanvas();
  resetResults();

  btnCloseShape.disabled = true;
  btnRunMC.disabled = true;

  log("Canvas i rezultati resetovani.");
});

// inicijalno očistimo canvas
clearCanvas();