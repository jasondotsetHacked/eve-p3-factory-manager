import { defaultRecipes } from "../data/recipes.js";
import { sampleTemplate } from "../data/sample-template.js";
import {
  debugTemplate,
  detectRouteGroups,
  generateTemplate,
  parseTemplateJson,
  summarizeTemplate
} from "./template-engine.js";
import {
  evaluateRecipe,
  fetchJitaPrices,
  MARKET,
  uniqueMarketTypeIds
} from "./economics.js";

const storageKey = "evePiP3FactoryManagerV2";
const appVersion = "0.5.0";
const elements = {
  planetList: document.querySelector("#planetList"),
  addPlanetButton: document.querySelector("#addPlanetButton"),
  copyBuyListButton: document.querySelector("#copyBuyListButton"),
  copySellListButton: document.querySelector("#copySellListButton"),
  plannerStatus: document.querySelector("#plannerStatus"),
  planetCount: document.querySelector("#planetCount"),
  totalInvestment: document.querySelector("#totalInvestment"),
  totalRevenue: document.querySelector("#totalRevenue"),
  totalProfit: document.querySelector("#totalProfit"),
  totalRoi: document.querySelector("#totalRoi"),
  recipeGrid: document.querySelector("#recipeGrid"),
  sortSelect: document.querySelector("#sortSelect"),
  selectedRecipeName: document.querySelector("#selectedRecipeName"),
  selectedRecipeInputs: document.querySelector("#selectedRecipeInputs"),
  cycleCost: document.querySelector("#cycleCost"),
  cycleRevenue: document.querySelector("#cycleRevenue"),
  cycleProfit: document.querySelector("#cycleProfit"),
  cycleRoi: document.querySelector("#cycleRoi"),
  cycleCount: document.querySelector("#cycleCount"),
  cycleCountNumber: document.querySelector("#cycleCountNumber"),
  inputPriceSide: document.querySelector("#inputPriceSide"),
  outputPriceSide: document.querySelector("#outputPriceSide"),
  marketStatus: document.querySelector("#marketStatus"),
  priceLines: document.querySelector("#priceLines"),
  outputTemplate: document.querySelector("#outputTemplate"),
  sourceTemplate: document.querySelector("#sourceTemplate"),
  templateStatus: document.querySelector("#templateStatus"),
  refreshPricesButton: document.querySelector("#refreshPricesButton"),
  generateButton: document.querySelector("#generateButton"),
  resetTemplateButton: document.querySelector("#resetTemplateButton"),
  useCustomTemplateButton: document.querySelector("#useCustomTemplateButton"),
  copyButton: document.querySelector("#copyButton")
};

const savedState = loadState();
let template = sampleTemplate;
let routeGroups = detectRouteGroups(template);
let selectedRecipeId = savedState.selectedRecipeId ?? "robotics";
let prices = savedState.prices ?? {};
let planets = normalizePlanets(savedState.planets);

elements.sourceTemplate.value = JSON.stringify(sampleTemplate);
elements.inputPriceSide.value = savedState.inputSide ?? "sell";
elements.outputPriceSide.value = savedState.outputSide ?? "buy";
setCycleCount(savedState.cycles ?? 24);

bindEvents();
console.info(`[P3 Factory Manager] v${appVersion} loaded`);
console.info("[P3 Factory Manager] Template source detected", routeGroups);
render();
generateSelectedTemplate();

function bindEvents() {
  elements.sortSelect.addEventListener("change", render);
  elements.addPlanetButton.addEventListener("click", () => {
    planets.push(defaultPlanet(`Planet ${planets.length + 1}`));
    persistState();
    render();
  });
  elements.copyBuyListButton.addEventListener("click", withErrorHandling(() => copyPlannerList("buy")));
  elements.copySellListButton.addEventListener("click", withErrorHandling(() => copyPlannerList("sell")));
  elements.planetList.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-planet]");
    if (!removeButton) return;
    const planetId = removeButton.closest("[data-planet-id]")?.dataset.planetId;
    planets = planets.filter((planet) => planet.id !== planetId);
    if (!planets.length) {
      planets.push(defaultPlanet("Planet 1"));
    }
    persistState();
    render();
  });
  elements.planetList.addEventListener("input", (event) => {
    updatePlanetFromControl(event.target);
    persistState();
  });
  elements.planetList.addEventListener("change", (event) => {
    updatePlanetFromControl(event.target);
    persistState();
    render();
  });
  elements.inputPriceSide.addEventListener("change", () => {
    persistState();
    render();
  });
  elements.outputPriceSide.addEventListener("change", () => {
    persistState();
    render();
  });
  elements.cycleCount.addEventListener("input", () => {
    setCycleCount(elements.cycleCount.value);
    persistState();
    render();
  });
  elements.cycleCountNumber.addEventListener("input", () => {
    setCycleCount(elements.cycleCountNumber.value);
    persistState();
    render();
  });
  elements.refreshPricesButton.addEventListener("click", withErrorHandling(refreshPrices));
  elements.generateButton.addEventListener("click", withErrorHandling(generateSelectedTemplate));
  elements.copyButton.addEventListener("click", withErrorHandling(copyOutput));
  elements.resetTemplateButton.addEventListener("click", () => {
    template = sampleTemplate;
    routeGroups = detectRouteGroups(template);
    elements.sourceTemplate.value = JSON.stringify(sampleTemplate);
    setStatus(elements.templateStatus, "good", templateSummaryText("Using the bundled Robotics factory template."));
    generateSelectedTemplate();
  });
  elements.useCustomTemplateButton.addEventListener("click", withErrorHandling(() => {
    template = parseTemplateJson(elements.sourceTemplate.value);
    routeGroups = detectRouteGroups(template);
    console.info("[P3 Factory Manager] Custom template loaded", {
      routeGroups,
      summary: summarizeTemplate(template)
    });
    setStatus(elements.templateStatus, "good", templateSummaryText("Custom shell loaded."));
    generateSelectedTemplate();
  }));
}

async function refreshPrices() {
  const typeIds = uniqueMarketTypeIds(defaultRecipes);
  elements.refreshPricesButton.disabled = true;
  setStatus(elements.marketStatus, "warn", `Fetching ${typeIds.length} market types from ${MARKET.stationName}...`);

  prices = await fetchJitaPrices(typeIds, (done, total) => {
    setStatus(elements.marketStatus, "warn", `Fetched ${done} of ${total} market types from Jita.`);
  });

  elements.refreshPricesButton.disabled = false;
  persistState();
  const fetchedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  setStatus(elements.marketStatus, "good", `Jita prices refreshed at ${fetchedAt}.`);
  render();
}

function render() {
  const selectedRecipe = recipeById(selectedRecipeId);
  const settings = currentSettings();
  const scoredRecipes = defaultRecipes
    .map((recipe) => ({ recipe, economics: evaluateRecipe(recipe, prices, settings) }))
    .sort(compareRecipes(elements.sortSelect.value));

  elements.recipeGrid.innerHTML = "";
  for (const item of scoredRecipes) {
    elements.recipeGrid.append(renderRecipeCard(item.recipe, item.economics));
  }

  renderSelectedRecipe(selectedRecipe, evaluateRecipe(selectedRecipe, prices, settings));
  renderPlanetPlanner(settings);
}

function renderRecipeCard(recipe, economics) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `recipe-card${recipe.id === selectedRecipeId ? " selected" : ""}`;
  button.addEventListener("click", () => {
    selectedRecipeId = recipe.id;
    persistState();
    render();
    generateSelectedTemplate();
  });

  button.innerHTML = `
    <div>
      <div class="recipe-name">${escapeHtml(recipe.name)}</div>
      <div class="recipe-inputs">${escapeHtml(recipe.inputAName)} + ${escapeHtml(recipe.inputBName)}</div>
    </div>
    <div class="recipe-economics">
      <div>
        <span class="label">Profit</span>
        <strong class="${valueClass(economics.profit)}">${formatIsk(economics.profit)}</strong>
      </div>
      <div>
        <span class="label">ROI</span>
        <strong class="${valueClass(economics.roi)}">${formatPercent(economics.roi)}</strong>
      </div>
    </div>
    <div class="recipe-price-note">${priceNote(economics)}</div>
  `;

  return button;
}

function renderSelectedRecipe(recipe, economics) {
  const facilities = activeFactoryCount();
  const cyclesPerFacility = currentCycleCount();
  elements.selectedRecipeName.textContent = recipe.name;
  elements.selectedRecipeInputs.textContent = `${recipe.inputAName} + ${recipe.inputBName} for ${formatNumber(facilities)} facilities x ${formatNumber(cyclesPerFacility)} cycles`;
  elements.cycleCost.textContent = formatIsk(economics.cost);
  elements.cycleRevenue.textContent = formatIsk(economics.revenue);
  elements.cycleProfit.textContent = formatIsk(economics.profit);
  elements.cycleProfit.className = valueClass(economics.profit);
  elements.cycleRoi.textContent = formatPercent(economics.roi);
  elements.cycleRoi.className = valueClass(economics.roi);

  elements.priceLines.innerHTML = [
    {
      name: recipe.inputAName,
      role: `${formatNumber(economics.inputQuantity)} units input`,
      depth: economics.inputA
    },
    {
      name: recipe.inputBName,
      role: `${formatNumber(economics.inputQuantity)} units input`,
      depth: economics.inputB
    },
    {
      name: recipe.name,
      role: `${formatNumber(economics.outputQuantity)} units output`,
      depth: economics.output,
      extraNote: sellThroughNote(economics)
    }
  ].map((line) => `
    <div class="price-line">
      <div>
        <strong>${escapeHtml(line.name)}</strong>
        <span>${line.role}</span>
        <span>${depthNote(line.depth)}</span>
        ${line.extraNote ? `<span class="${sellThroughClass(economics)}">${line.extraNote}</span>` : ""}
      </div>
      <strong>${formatIsk(line.depth.averagePrice)}</strong>
    </div>
  `).join("");
}

function generateSelectedTemplate() {
  const recipe = recipeById(selectedRecipeId);
  elements.outputTemplate.value = generateTemplate(template, routeGroups, recipe);
  const generated = parseTemplateJson(elements.outputTemplate.value);
  console.info("[P3 Factory Manager] Generated template debug", debugTemplate(generated, routeGroups, recipe));
  console.info("[P3 Factory Manager] Generated template JSON", elements.outputTemplate.value);
  setStatus(elements.templateStatus, "good", templateSummaryText(`Generated ${recipe.name} from the active shell.`));
}

async function copyOutput() {
  if (!elements.outputTemplate.value.trim()) {
    generateSelectedTemplate();
  }
  await navigator.clipboard.writeText(elements.outputTemplate.value);
  console.info("[P3 Factory Manager] Copied template to clipboard", {
    bytes: new Blob([elements.outputTemplate.value]).size,
    chars: elements.outputTemplate.value.length,
    startsWith: elements.outputTemplate.value.slice(0, 80),
    endsWith: elements.outputTemplate.value.slice(-80)
  });
  setStatus(elements.templateStatus, "good", "Template JSON copied to clipboard.");
}

function compareRecipes(sortBy) {
  return (left, right) => {
    if (sortBy === "name") {
      return left.recipe.name.localeCompare(right.recipe.name);
    }

    const key = sortBy === "roi" ? "roi" : "profit";
    const leftValue = left.economics[key] ?? Number.NEGATIVE_INFINITY;
    const rightValue = right.economics[key] ?? Number.NEGATIVE_INFINITY;
    return rightValue - leftValue || left.recipe.name.localeCompare(right.recipe.name);
  };
}

function currentSettings() {
  return {
    inputSide: elements.inputPriceSide.value,
    outputSide: elements.outputPriceSide.value,
    cycles: activeFactoryCount() * currentCycleCount()
  };
}

function renderPlanetPlanner(settings) {
  const planetRows = planets.map((planet) => planetSummary(planet, settings));
  const completeRows = planetRows.filter((row) => row.economics.profit !== null);
  const totals = completeRows.reduce((sum, row) => ({
    cost: sum.cost + row.economics.cost,
    revenue: sum.revenue + row.economics.revenue,
    profit: sum.profit + row.economics.profit
  }), { cost: 0, revenue: 0, profit: 0 });

  const hasIncompleteRows = completeRows.length !== planetRows.length;
  elements.totalInvestment.textContent = hasIncompleteRows ? "-" : formatIsk(totals.cost);
  elements.totalRevenue.textContent = hasIncompleteRows ? "-" : formatIsk(totals.revenue);
  elements.totalProfit.textContent = hasIncompleteRows ? "-" : formatIsk(totals.profit);
  elements.totalProfit.className = hasIncompleteRows ? "" : valueClass(totals.profit);
  elements.totalRoi.textContent = hasIncompleteRows || totals.cost <= 0 ? "-" : formatPercent(totals.profit / totals.cost);
  elements.totalRoi.className = hasIncompleteRows ? "" : valueClass(totals.profit / totals.cost);
  elements.planetCount.textContent = `${planetRows.length} ${planetRows.length === 1 ? "planet" : "planets"}`;

  elements.planetList.innerHTML = planetRows.map((row) => renderPlanetRow(row, hasIncompleteRows)).join("");
}

function planetSummary(planet, settings) {
  const recipe = recipeById(planet.recipeId);
  const factories = clampInteger(planet.factories, 1, 100);
  const cyclesPerFactory = clampInteger(planet.cycles, 1, 10000);
  const totalCycles = planetTotalCycles(planet);
  const economics = evaluateRecipe(recipe, prices, { ...settings, cycles: totalCycles });
  return {
    planet,
    recipe,
    factories,
    cyclesPerFactory,
    totalCycles,
    economics
  };
}

function renderPlanetRow(row) {
  const { planet, recipe, factories, cyclesPerFactory, totalCycles, economics } = row;
  const status = economics.profit === null
    ? missingDepthText(economics)
    : `${formatNumber(totalCycles)} total factory cycles · ${sellThroughNote(economics)}`;
  const recipeOptions = defaultRecipes.map((option) => (
    `<option value="${escapeHtml(option.id)}"${option.id === recipe.id ? " selected" : ""}>${escapeHtml(option.name)}</option>`
  )).join("");

  return `
    <details class="planet-card" data-planet-id="${escapeHtml(planet.id)}" open>
      <summary class="planet-summary">
        <span>
          <strong>${escapeHtml(planet.name)}</strong>
          <span>${escapeHtml(recipe.name)} · ${formatNumber(factories)} facilities · ${formatNumber(cyclesPerFactory)} cycles</span>
        </span>
        <button class="ghost-button" data-remove-planet type="button"${planets.length <= 1 ? " disabled" : ""}>Remove</button>
      </summary>
      <div class="planet-body">
        <div class="planet-header">
          <input data-planet-name value="${escapeHtml(planet.name)}" aria-label="Planet name" />
        </div>
        <div class="planet-controls">
          <label>
            Schematic
            <select data-planet-recipe>
              ${recipeOptions}
            </select>
          </label>
          <label>
            Factory modules
            <input data-planet-factories type="number" min="1" max="100" step="1" value="${factories}" />
          </label>
          <label>
            Cycles per facility
            <input data-planet-cycles type="number" min="1" max="10000" step="1" value="${cyclesPerFactory}" />
          </label>
        </div>
      </div>
      <div class="planet-metrics">
        <div>
          <span class="label">Investment</span>
          <strong>${formatIsk(economics.cost)}</strong>
        </div>
        <div>
          <span class="label">Revenue</span>
          <strong>${formatIsk(economics.revenue)}</strong>
        </div>
        <div>
          <span class="label">Profit</span>
          <strong class="${valueClass(economics.profit)}">${formatIsk(economics.profit)}</strong>
        </div>
        <div>
          <span class="label">ROI</span>
          <strong class="${valueClass(economics.roi)}">${formatPercent(economics.roi)}</strong>
        </div>
      </div>
      <div class="planet-note">${escapeHtml(recipe.inputAName)} + ${escapeHtml(recipe.inputBName)} · ${status}</div>
    </details>
  `;
}

async function copyPlannerList(kind) {
  const entries = kind === "buy" ? aggregateBuyList() : aggregateSellList();
  const text = formatJaniceList(entries);

  if (!text) {
    setStatus(elements.plannerStatus, "bad", "No planet materials to copy.");
    return;
  }

  await navigator.clipboard.writeText(text);
  setStatus(
    elements.plannerStatus,
    "good",
    `${kind === "buy" ? "Buy" : "Sell"} list copied for ${entries.length} item types.`
  );
}

function aggregateBuyList() {
  const totals = new Map();
  for (const planet of planets) {
    const recipe = recipeById(planet.recipeId);
    const cycles = planetTotalCycles(planet);
    addMaterial(totals, recipe.inputAName, cycles * 10);
    addMaterial(totals, recipe.inputBName, cycles * 10);
  }
  return materialEntries(totals);
}

function aggregateSellList() {
  const totals = new Map();
  for (const planet of planets) {
    const recipe = recipeById(planet.recipeId);
    addMaterial(totals, recipe.name, planetTotalCycles(planet) * 3);
  }
  return materialEntries(totals);
}

function addMaterial(totals, name, quantity) {
  totals.set(name, (totals.get(name) ?? 0) + quantity);
}

function materialEntries(totals) {
  return [...totals.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .filter((entry) => entry.quantity > 0)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function formatJaniceList(entries) {
  return entries.map((entry) => `${entry.name}\t${entry.quantity}`).join("\n");
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function persistState() {
  const state = {
    selectedRecipeId,
    inputSide: elements.inputPriceSide.value,
    outputSide: elements.outputPriceSide.value,
    cycles: currentCycleCount(),
    planets,
    prices
  };

  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    console.warn("[P3 Factory Manager] Could not persist market depth; saving settings only.", error);
    localStorage.setItem(storageKey, JSON.stringify({ ...state, prices: {} }));
  }
}

function recipeById(id) {
  return defaultRecipes.find((recipe) => recipe.id === id) ?? defaultRecipes.find((recipe) => recipe.id === "robotics") ?? defaultRecipes[0];
}

function normalizePlanets(value) {
  if (!Array.isArray(value) || !value.length) {
    return [defaultPlanet("Planet 1")];
  }

  return value.map((planet, index) => ({
    id: String(planet.id || createId()),
    name: String(planet.name || `Planet ${index + 1}`),
    recipeId: recipeById(planet.recipeId).id,
    factories: clampInteger(planet.factories, 1, 100),
    cycles: clampInteger(planet.cycles, 1, 10000)
  }));
}

function defaultPlanet(name) {
  return {
    id: createId(),
    name,
    recipeId: selectedRecipeId,
    factories: activeFactoryCount(),
    cycles: currentCycleCount()
  };
}

function updatePlanetFromControl(control) {
  const card = control.closest("[data-planet-id]");
  if (!card) return;
  const planet = planets.find((item) => item.id === card.dataset.planetId);
  if (!planet) return;

  if (control.matches("[data-planet-name]")) {
    planet.name = control.value;
  } else if (control.matches("[data-planet-recipe]")) {
    planet.recipeId = recipeById(control.value).id;
  } else if (control.matches("[data-planet-factories]")) {
    planet.factories = clampInteger(control.value, 1, 100);
  } else if (control.matches("[data-planet-cycles]")) {
    planet.cycles = clampInteger(control.value, 1, 10000);
  }
}

function createId() {
  return `planet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function templateSummaryText(prefix) {
  const summary = summarizeTemplate(template);
  return `${prefix} ${summary.factories} factories, ${summary.routes} routes, ${summary.links} links.`;
}

function activeFactoryCount() {
  return summarizeTemplate(template).factories;
}

function setStatus(element, type, text) {
  element.className = `status ${type}`;
  element.textContent = text;
}

function priceNote(economics) {
  if (economics.profit === null) {
    return missingDepthText(economics);
  }
  return `${formatNumber(economics.cycles)} facility cycles · ${sellThroughNote(economics)}`;
}

function valueClass(value) {
  if (!Number.isFinite(value)) return "";
  return value >= 0 ? "positive" : "negative";
}

function formatIsk(value) {
  if (!Number.isFinite(value)) return "-";
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value)} ISK`;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "-";
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  }).format(value * 100)}%`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function withErrorHandling(action) {
  return async () => {
    try {
      await action();
    } catch (error) {
      elements.refreshPricesButton.disabled = false;
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setStatus(elements.marketStatus, "bad", message);
    }
  };
}

function setCycleCount(value) {
  const cycles = Math.min(Math.max(Number.parseInt(value, 10) || 1, 1), 200);
  elements.cycleCount.value = String(cycles);
  elements.cycleCountNumber.value = String(cycles);
}

function currentCycleCount() {
  return Number.parseInt(elements.cycleCount.value, 10) || 1;
}

function planetTotalCycles(planet) {
  return clampInteger(planet.factories, 1, 100) * clampInteger(planet.cycles, 1, 10000);
}

function clampInteger(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}

function depthNote(depth) {
  if (!depth) return "No market depth loaded.";
  if (!depth.isComplete) {
    return `Only ${formatNumber(depth.filledQuantity)} of ${formatNumber(depth.requestedQuantity)} units visible.`;
  }
  if (depth.bestPrice === depth.worstPrice) {
    return `Filled at ${formatIsk(depth.bestPrice)}.`;
  }
  return `Best ${formatIsk(depth.bestPrice)} · worst ${formatIsk(depth.worstPrice)}.`;
}

function sellThroughNote(economics) {
  const demand = economics.outputDemand;
  if (!demand || demand.requestedQuantity <= 0) return "No output demand loaded.";
  if (!demand.filledQuantity) return `Buy demand 0 of ${formatNumber(demand.requestedQuantity)} units.`;
  if (!demand.isComplete) {
    return `Buy demand ${formatNumber(demand.filledQuantity)} of ${formatNumber(demand.requestedQuantity)} units.`;
  }
  if (demand.bestPrice === demand.worstPrice) {
    return `Buy demand covers output at ${formatIsk(demand.bestPrice)}.`;
  }
  return `Buy demand covers output from ${formatIsk(demand.bestPrice)} to ${formatIsk(demand.worstPrice)}.`;
}

function sellThroughClass(economics) {
  return economics.outputDemand?.isComplete ? "positive" : "negative";
}

function missingDepthText(economics) {
  const missing = [
    economics.inputA,
    economics.inputB,
    economics.output
  ].some((depth) => depth && depth.filledQuantity > 0);

  return missing ? "Not enough visible order depth for this run." : "Refresh prices to rank this schematic.";
}
