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

export async function fetchJitaPrices(typeIds, onProgress = () => {}) {
  const prices = {};

  for (let index = 0; index < typeIds.length; index += 1) {
    const typeId = typeIds[index];
    prices[typeId] = await fetchJitaPrice(typeId);
    onProgress(index + 1, typeIds.length);
  }

  return prices;
}

export function evaluateRecipe(recipe, prices, settings) {
  const inputAPrice = priceFor(prices[recipe.inputATypeId], settings.inputSide);
  const inputBPrice = priceFor(prices[recipe.inputBTypeId], settings.inputSide);
  const outputPrice = priceFor(prices[recipe.outputTypeId], settings.outputSide);

  if (![inputAPrice, inputBPrice, outputPrice].every((value) => Number.isFinite(value) && value > 0)) {
    return {
      inputAPrice,
      inputBPrice,
      outputPrice,
      cost: null,
      revenue: null,
      profit: null,
      roi: null
    };
  }

  const cost = (10 * inputAPrice) + (10 * inputBPrice);
  const revenue = 3 * outputPrice;
  const profit = revenue - cost;

  return {
    inputAPrice,
    inputBPrice,
    outputPrice,
    cost,
    revenue,
    profit,
    roi: cost > 0 ? profit / cost : null
  };
}

function priceFor(price, side) {
  if (!price) return null;
  return side === "buy" ? price.highestBuy : price.lowestSell;
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
    fetchedAt: new Date().toISOString()
  };
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
