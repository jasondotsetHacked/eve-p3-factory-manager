export const MARKET = {
  regionId: 10000002,
  stationId: 60003760,
  stationName: "Jita IV - Moon 4 - Caldari Navy Assembly Plant"
};

export function uniqueMarketTypeIds(recipes) {
  return [...new Set(recipes.flatMap((recipe) => [
    recipe.outputTypeId,
    recipe.inputATypeId,
    recipe.inputBTypeId
  ]))].sort((a, b) => a - b);
}

export function uniqueOutputTypeIds(recipes) {
  return [...new Set(recipes.map((recipe) => recipe.outputTypeId))].sort((a, b) => a - b);
}

export async function fetchJitaPrices(typeIds, onProgress = () => {}) {
  const prices = {};

  for (let index = 0; index < typeIds.length; index += 1) {
    const typeId = typeIds[index];
    prices[typeId] = await fetchJitaPrice(typeId);
    onProgress(index + 1, typeIds.length);
  }

  return prices;
}

export async function fetchMarketHistory(typeIds, onProgress = () => {}) {
  const history = {};

  for (let index = 0; index < typeIds.length; index += 1) {
    const typeId = typeIds[index];
    history[typeId] = summarizeMarketHistory(await fetchMarketHistoryForType(typeId));
    onProgress(index + 1, typeIds.length);
  }

  return history;
}

export function evaluateRecipe(recipe, prices, settings) {
  const cycles = clampCycleCount(settings.cycles);
  const inputQuantity = cycles * 10;
  const outputQuantity = cycles * 3;
  const inputA = depthPrice(prices[recipe.inputATypeId], settings.inputSide, inputQuantity, settings.inputAUnitPrice);
  const inputB = depthPrice(prices[recipe.inputBTypeId], settings.inputSide, inputQuantity, settings.inputBUnitPrice);
  const output = depthPrice(prices[recipe.outputTypeId], settings.outputSide, outputQuantity, settings.outputUnitPrice);
  const outputDemand = depthPrice(prices[recipe.outputTypeId], "buy", outputQuantity);
  const allDepthFilled = [inputA, inputB, output].every((result) => result.isComplete);

  if (!allDepthFilled) {
    return {
      cycles,
      inputQuantity,
      outputQuantity,
      inputA,
      inputB,
      output,
      outputDemand,
      inputAPrice: inputA.averagePrice,
      inputBPrice: inputB.averagePrice,
      outputPrice: output.averagePrice,
      cost: null,
      revenue: null,
      profit: null,
      roi: null
    };
  }

  const cost = inputA.totalValue + inputB.totalValue;
  const revenue = output.totalValue;
  const profit = revenue - cost;

  return {
    cycles,
    inputQuantity,
    outputQuantity,
    inputA,
    inputB,
    output,
    outputDemand,
    inputAPrice: inputA.averagePrice,
    inputBPrice: inputB.averagePrice,
    outputPrice: output.averagePrice,
    cost,
    revenue,
    profit,
    roi: cost > 0 ? profit / cost : null
  };
}

async function fetchJitaPrice(typeId) {
  const orders = await fetchAllOrders(typeId);
  const jitaOrders = orders.filter((order) => order.location_id === MARKET.stationId);
  const buyOrders = jitaOrders.filter((order) => order.is_buy_order);
  const sellOrders = jitaOrders.filter((order) => !order.is_buy_order);

  return {
    typeId,
    highestBuy: maxPrice(buyOrders),
    lowestSell: minPrice(sellOrders),
    buyVolume: sumVolume(buyOrders),
    sellVolume: sumVolume(sellOrders),
    buyOrders: compressOrders(buyOrders).sort((a, b) => b.price - a.price),
    sellOrders: compressOrders(sellOrders).sort((a, b) => a.price - b.price),
    fetchedAt: new Date().toISOString()
  };
}

async function fetchMarketHistoryForType(typeId) {
  const url = new URL(`https://esi.evetech.net/latest/markets/${MARKET.regionId}/history/`);
  url.searchParams.set("datasource", "tranquility");
  url.searchParams.set("type_id", String(typeId));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESI market history request failed for type ${typeId} (${response.status}).`);
  }

  return response.json();
}

function summarizeMarketHistory(rows) {
  const recentRows = Array.isArray(rows) ? rows.slice(-30) : [];
  const totalVolume = recentRows.reduce((total, row) => total + (Number(row.volume) || 0), 0);
  return {
    averageDailyVolume: recentRows.length ? totalVolume / recentRows.length : null,
    days: recentRows.length,
    fetchedAt: new Date().toISOString()
  };
}

function depthPrice(price, side, quantity, overrideUnitPrice = null) {
  const emptyResult = {
    averagePrice: null,
    totalValue: null,
    requestedQuantity: quantity,
    filledQuantity: 0,
    availableQuantity: 0,
    bestPrice: null,
    worstPrice: null,
    isComplete: false,
    isOverride: false,
    isSplit: false
  };

  if (Number.isFinite(overrideUnitPrice) && overrideUnitPrice >= 0) {
    return {
      averagePrice: overrideUnitPrice,
      totalValue: overrideUnitPrice * quantity,
      requestedQuantity: quantity,
      filledQuantity: quantity,
      availableQuantity: quantity,
      bestPrice: overrideUnitPrice,
      worstPrice: overrideUnitPrice,
      isComplete: true,
      isOverride: true,
      isSplit: false
    };
  }

  if (!price || !Number.isFinite(quantity) || quantity <= 0) {
    return emptyResult;
  }

  if (side === "split") {
    return splitDepthPrice(price, quantity, emptyResult);
  }

  return orderDepthPrice(price, side, quantity, emptyResult);
}

function splitDepthPrice(price, quantity, emptyResult) {
  const buyDepth = orderDepthPrice(price, "buy", quantity, emptyResult);
  const sellDepth = orderDepthPrice(price, "sell", quantity, emptyResult);
  const isComplete = buyDepth.isComplete && sellDepth.isComplete;
  const averagePrice = isComplete ? (buyDepth.averagePrice + sellDepth.averagePrice) / 2 : null;

  return {
    averagePrice,
    totalValue: isComplete ? averagePrice * quantity : null,
    requestedQuantity: quantity,
    filledQuantity: Math.min(buyDepth.filledQuantity, sellDepth.filledQuantity),
    availableQuantity: Math.min(buyDepth.availableQuantity, sellDepth.availableQuantity),
    bestPrice: Number.isFinite(buyDepth.bestPrice) && Number.isFinite(sellDepth.bestPrice)
      ? (buyDepth.bestPrice + sellDepth.bestPrice) / 2
      : null,
    worstPrice: Number.isFinite(buyDepth.worstPrice) && Number.isFinite(sellDepth.worstPrice)
      ? (buyDepth.worstPrice + sellDepth.worstPrice) / 2
      : null,
    isComplete,
    isOverride: false,
    isSplit: true
  };
}

function orderDepthPrice(price, side, quantity, emptyResult) {
  const orders = side === "buy" ? price.buyOrders : price.sellOrders;
  if (!Array.isArray(orders) || !orders.length) {
    return {
      ...emptyResult,
      availableQuantity: side === "buy" ? price.buyVolume ?? 0 : price.sellVolume ?? 0,
      bestPrice: side === "buy" ? price.highestBuy ?? null : price.lowestSell ?? null
    };
  }

  let remaining = quantity;
  let totalValue = 0;
  let filledQuantity = 0;
  let worstPrice = null;

  for (const order of orders) {
    if (remaining <= 0) break;
    const fillQuantity = Math.min(order.volume, remaining);
    totalValue += fillQuantity * order.price;
    filledQuantity += fillQuantity;
    remaining -= fillQuantity;
    worstPrice = order.price;
  }

  const availableQuantity = orders.reduce((total, order) => total + order.volume, 0);
  const isComplete = filledQuantity >= quantity;

  return {
    averagePrice: isComplete ? totalValue / quantity : null,
    totalValue: isComplete ? totalValue : null,
    requestedQuantity: quantity,
    filledQuantity,
    availableQuantity,
    bestPrice: orders[0]?.price ?? null,
    worstPrice,
    isComplete,
    isOverride: false,
    isSplit: false
  };
}

function compressOrders(orders) {
  const byPrice = new Map();
  for (const order of orders) {
    byPrice.set(order.price, (byPrice.get(order.price) ?? 0) + order.volume_remain);
  }
  return [...byPrice.entries()].map(([price, volume]) => ({ price, volume }));
}

function clampCycleCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), 1000000);
}

async function fetchAllOrders(typeId) {
  const first = await fetchOrdersPage(typeId, 1);
  const pageCount = Number(first.response.headers.get("x-pages") ?? "1");
  const remainingPages = Array.from({ length: Math.max(pageCount - 1, 0) }, (_, index) => index + 2);
  const rest = await Promise.all(remainingPages.map((page) => fetchOrdersPage(typeId, page)));
  return [first, ...rest].flatMap((page) => page.data);
}

async function fetchOrdersPage(typeId, page) {
  const url = new URL(`https://esi.evetech.net/latest/markets/${MARKET.regionId}/orders/`);
  url.searchParams.set("datasource", "tranquility");
  url.searchParams.set("order_type", "all");
  url.searchParams.set("type_id", String(typeId));
  url.searchParams.set("page", String(page));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESI market request failed for type ${typeId} (${response.status}).`);
  }

  return { response, data: await response.json() };
}

function maxPrice(orders) {
  if (!orders.length) return null;
  return Math.max(...orders.map((order) => order.price));
}

function minPrice(orders) {
  if (!orders.length) return null;
  return Math.min(...orders.map((order) => order.price));
}

function sumVolume(orders) {
  return orders.reduce((total, order) => total + order.volume_remain, 0);
}
