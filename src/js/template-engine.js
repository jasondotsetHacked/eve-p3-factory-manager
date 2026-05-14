const FACTORY_TYPE_ID = 2470;

export function parseTemplateJson(json) {
  const value = JSON.parse(json);
  if (!value || !Array.isArray(value.P) || !Array.isArray(value.R) || !Array.isArray(value.L)) {
    throw new Error("Template must contain P, R, and L arrays.");
  }
  return value;
}

export function detectRouteGroups(template) {
  const factorySchematics = template.P
    .filter((pin) => pin.T === FACTORY_TYPE_ID && Number.isFinite(pin.S))
    .map((pin) => pin.S);
  const factorySchematicId = mostCommon(factorySchematics);

  if (factorySchematicId === null) {
    throw new Error("Could not find factory schematic IDs in this template.");
  }

  const outputTypeId = mostCommon(
    template.R
      .filter((route) => route.Q === 3)
      .map((route) => route.T)
  );

  if (outputTypeId === null) {
    throw new Error("Could not detect the P3 output route type.");
  }

  const inputRouteTypes = Object.entries(countBy(
    template.R.filter((route) => route.Q === 10 && route.T !== outputTypeId),
    "T"
  ))
    .map(([typeId, count]) => ({ typeId: Number(typeId), count }))
    .sort((a, b) => b.count - a.count || a.typeId - b.typeId)
    .slice(0, 2);

  if (inputRouteTypes.length !== 2) {
    throw new Error("Could not detect two P2 input route types.");
  }

  return {
    factorySchematicId,
    inputATypeId: inputRouteTypes[0].typeId,
    inputBTypeId: inputRouteTypes[1].typeId,
    outputTypeId
  };
}

export function generateTemplate(template, routeGroups, recipe) {
  const copy = structuredClone(template);

  copy.P = copy.P.map((pin) => {
    if (pin.T === FACTORY_TYPE_ID && pin.S === routeGroups.factorySchematicId) {
      return { ...pin, S: recipe.outputTypeId };
    }
    return pin;
  });

  copy.R = copy.R.map((route) => {
    if (route.T === routeGroups.inputATypeId) {
      return { ...route, T: recipe.inputATypeId };
    }
    if (route.T === routeGroups.inputBTypeId) {
      return { ...route, T: recipe.inputBTypeId };
    }
    if (route.T === routeGroups.outputTypeId) {
      return { ...route, T: recipe.outputTypeId };
    }
    return route;
  });

  copy.Cmt = `${recipe.name} factory template ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`;
  return serializeEveTemplate(copy);
}

export function debugTemplate(template, routeGroups, recipe) {
  const factoryPins = template.P.filter((pin) => pin.T === FACTORY_TYPE_ID);
  const routeCounts = countBy(template.R, "T");

  return {
    recipe: {
      name: recipe.name,
      outputTypeId: recipe.outputTypeId,
      schematicId: recipe.schematicId,
      inputATypeId: recipe.inputATypeId,
      inputBTypeId: recipe.inputBTypeId
    },
    detectedSource: routeGroups,
    counts: {
      factories: factoryPins.length,
      pins: template.P.length,
      links: template.L.length,
      routes: template.R.length
    },
    factorySValues: [...new Set(factoryPins.map((pin) => pin.S))],
    routeTypeCounts: routeCounts
  };
}

function serializeEveTemplate(value, key = "") {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeEveTemplate(entry)).join(", ")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value).map(([entryKey, entryValue]) => (
      `${JSON.stringify(entryKey)}: ${serializeEveTemplate(entryValue, entryKey)}`
    )).join(", ")}}`;
  }
  if (typeof value === "number") {
    if (key === "Diam" && Number.isInteger(value)) {
      return `${value}.0`;
    }
    return String(value);
  }
  return JSON.stringify(value);
}

export function summarizeTemplate(template) {
  return {
    factories: template.P.filter((pin) => pin.T === FACTORY_TYPE_ID).length,
    routes: template.R.length,
    links: template.L.length
  };
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] ?? "null";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function mostCommon(values) {
  if (!values.length) return null;
  const counts = countBy(values.map((value) => ({ value })), "value");
  return Number(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0][0]
  );
}
