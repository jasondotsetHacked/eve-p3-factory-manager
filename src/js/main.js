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
const appVersion = "0.3.1";
const elements = {
  recipeGrid: document.querySelector("#recipeGrid"),
  sortSelect: document.querySelector("#sortSelect"),
  selectedRecipeName: document.querySelector("#selectedRecipeName"),
  selectedRecipeInputs: document.querySelector("#selectedRecipeInputs"),
  cycleCost: document.querySelector("#cycleCost"),
  cycleRevenue: document.querySelector("#cycleRevenue"),
  cycleProfit: document.querySelector("#cycleProfit"),
  cycleRoi: document.querySelector("#cycleRoi"),
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

elements.sourceTemplate.value = JSON.stringify(sampleTemplate);
elements.inputPriceSide.value = savedState.inputSide ?? "sell";
elements.outputPriceSide.value = savedState.outputSide ?? "buy";

bindEvents();
console.info(`[P3 Factory Manager] v${appVersion} loaded`);
console.info("[P3 Factory Manager] Template source detected", routeGroups);
render();
generateSelectedTemplate();

function bindEvents() {
  elements.sortSelect.addEventListener("change", render);
  elements.inputPriceSide.addEventListener("change", () => {
    persistState();
    render();
  });
  elements.outputPriceSide.addEventListener("change", () => {
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
  elements.selectedRecipeName.textContent = recipe.name;
  elements.selectedRecipeInputs.textContent = `${recipe.inputAName} + ${recipe.inputBName}`;
  elements.cycleCost.textContent = formatIsk(economics.cost);
  elements.cycleRevenue.textContent = formatIsk(economics.revenue);
  elements.cycleProfit.textContent = formatIsk(economics.profit);
  elements.cycleProfit.className = valueClass(economics.profit);
  elements.cycleRoi.textContent = formatPercent(economics.roi);
  elements.cycleRoi.className = valueClass(economics.roi);

  elements.priceLines.innerHTML = [
    {
      name: recipe.inputAName,
      role: "10 units input",
      price: economics.inputAPrice
    },
    {
      name: recipe.inputBName,
      role: "10 units input",
      price: economics.inputBPrice
    },
    {
      name: recipe.name,
      role: "3 units output",
      price: economics.outputPrice
    }
  ].map((line) => `
    <div class="price-line">
      <div>
        <strong>${escapeHtml(line.name)}</strong>
        <span>${line.role}</span>
      </div>
      <strong>${formatIsk(line.price)}</strong>
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
    outputSide: elements.outputPriceSide.value
  };
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function persistState() {
  localStorage.setItem(storageKey, JSON.stringify({
    selectedRecipeId,
    inputSide: elements.inputPriceSide.value,
    outputSide: elements.outputPriceSide.value,
    prices
  }));
}

function recipeById(id) {
  return defaultRecipes.find((recipe) => recipe.id === id) ?? defaultRecipes.find((recipe) => recipe.id === "robotics") ?? defaultRecipes[0];
}

function templateSummaryText(prefix) {
  const summary = summarizeTemplate(template);
  return `${prefix} ${summary.factories} factories, ${summary.routes} routes, ${summary.links} links.`;
}

function setStatus(element, type, text) {
  element.className = `status ${type}`;
  element.textContent = text;
}

function priceNote(economics) {
  if (economics.profit === null) {
    return "Refresh prices to rank this schematic.";
  }
  return `Cost ${formatIsk(economics.cost)} · Revenue ${formatIsk(economics.revenue)}`;
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
