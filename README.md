# EVE PI P3 Factory Manager

A small browser tool for comparing EVE Online planetary interaction P3 factory schematics against live Jita market orders, then generating a matching factory template from a known-good two-input P3 factory shell.

The app is static HTML, CSS, and JavaScript. There is no build step, backend service, account login, or API key.

## What It Does

- Lists the P3 factory recipes included in `src/data/recipes.js`.
- Fetches public market orders from CCP ESI for The Forge and filters them to Jita 4-4.
- Calculates input cost, output revenue, profit, and ROI for a selected number of cycles per Advanced Industry Facility.
- Lets you choose whether to value inputs at lowest sell or highest buy, and outputs at highest buy or lowest sell.
- Uses visible Jita order depth to calculate weighted average prices for the required input and output quantities.
- Shows buy-order demand coverage for P3 outputs so profitable sell-side pricing can be checked against actual buyer volume.
- Tracks multiple planets with separate schematics, factory module counts, and cycles per facility.
- Aggregates total input investment, output revenue, profit, and ROI across all configured planets.
- Copies Janice-friendly buy and sell appraisal lists from the full planet plan.
- Keeps larger planet plans manageable with collapsible, scrollable planet rows.
- Rewrites the bundled Robotics factory template into the selected P3 schematic by replacing factory schematic IDs and route type IDs.
- Copies the generated template JSON so it can be pasted into an EVE PI template workflow that accepts this format.

## Running Locally

Because the app uses JavaScript modules, serve the folder over local HTTP instead of opening `app.html` directly.

From the project folder:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/app.html
```

Any simple static server should work.

## Basic Use

1. Open the app in a browser.
2. Click **Refresh Jita Prices** to load current public ESI market data.
3. Set **Cycles per facility** to the run length you want to price.
4. Pick input and output price sides in the **Jita pricing** panel.
5. Add or edit planets in **Plan planets and factory modules**.
6. Set each planet's schematic, Advanced Industry Facility count, and cycles per facility.
7. Click **Copy Buy List** to copy all required P2 inputs for Janice.
8. Click **Copy Sell List** to copy all expected P3 outputs for Janice.
9. Choose a P3 schematic from the list when you want to generate an individual template.
10. Click **Generate Selected Template** if needed.
11. Click **Copy Template** and paste the generated JSON where you use PI templates.

The bundled template is a Robotics factory shell. The app detects the Robotics input and output route groups, then swaps them to the selected P3 recipe while preserving the factory layout, links, and routing paths.

## Market Depth Pricing

Each Advanced Industry Facility cycle consumes 10 units of each P2 input and produces 3 units of P3 output. The cycle slider is cycles per facility and supports up to 720 cycles, equal to 30 days at one hour per cycle. For the bundled template, the app multiplies that by the 16 Advanced Industry Facilities in the layout before pricing the selected schematic.

For example, 24 cycles per facility on the bundled 16-facility shell prices 3,840 units of each P2 input and 1,152 units of P3 output:

```text
16 facilities * 24 cycles * 10 P2 input units = 3,840 units of each P2 input
16 facilities * 24 cycles * 3 P3 output units = 1,152 units of P3 output
```

If the top order cannot fill the whole amount, the app includes the next best orders and shows the weighted average price. If there is not enough visible order depth, that schematic is treated as unavailable for the selected run size.

Output demand is also shown separately from output valuation. If you value output at lowest sell order, the profit number reflects listed sell prices, but the sell-through note still checks Jita buy-order depth for the output quantity. That helps identify products that look profitable on paper but may not have enough immediate buyer volume.

The planet planner applies the same depth logic to each planet's total factory cycles:

```text
planet total facility cycles = factory modules * cycles per facility
```

Total investment is the summed cost of buying every required P2 input for every configured planet. Total revenue is the market value of the resulting P3 outputs using the selected output side.

## Janice Lists

The planner can copy two appraisal lists:

- **Copy Buy List**: all P2 inputs required by the configured planets.
- **Copy Sell List**: all P3 outputs expected from the configured planets.

Each line is formatted as:

```text
Item Name	Quantity
```

Quantities are aggregated across planets before copying.

## Custom Template Shells

Only use custom shells that you trust and have tested in-game. The app expects a two-input P3 factory layout with recognizable input and output route quantities. If the pasted template uses a different structure, route detection can fail or produce a template that should be checked before use.

## Project Layout

```text
app.html
src/styles.css
src/data/recipes.js
src/data/sample-template.js
src/js/economics.js
src/js/main.js
src/js/template-engine.js
```

## Limitations

- Pricing is a snapshot of visible ESI orders at refresh time.
- Taxes, broker fees, hauling costs, and factory import/export taxes are not included.
- Recipe and type ID coverage is hard-coded to the bundled P3 list.
- If ESI is unavailable or rate-limited, price refreshes can fail.
