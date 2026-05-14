# EVE PI P3 Factory Manager

A small browser tool for comparing EVE Online planetary interaction P3 factory schematics against live Jita market orders, then generating a matching factory template from a known-good two-input P3 factory shell.

The app is static HTML, CSS, and JavaScript. There is no build step, backend service, account login, or API key.

## What It Does

- Lists the P3 factory recipes included in `src/data/recipes.js`.
- Fetches public market orders from CCP ESI for The Forge and filters them to Jita 4-4.
- Calculates per-cycle input cost, output revenue, profit, and ROI.
- Lets you choose whether to value inputs at lowest sell or highest buy, and outputs at highest buy or lowest sell.
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
3. Pick input and output price sides in the **Jita pricing** panel.
4. Choose a P3 schematic from the list.
5. Click **Generate Selected Template** if needed.
6. Click **Copy Template** and paste the generated JSON where you use PI templates.

The bundled template is a Robotics factory shell. The app detects the Robotics input and output route groups, then swaps them to the selected P3 recipe while preserving the factory layout, links, and routing paths.

## Custom Template Shells

Do not use...

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
- Taxes, broker fees, hauling costs, factory import/export taxes, and market volume depth are not included.
- Recipe and type ID coverage is hard-coded to the bundled P3 list.
- If ESI is unavailable or rate-limited, price refreshes can fail.