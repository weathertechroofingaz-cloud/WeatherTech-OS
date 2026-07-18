# Codex Browser Regression Suite

WeatherTech OS has a browser regression suite for workflows that require the signed-in Codex in-app Browser session.

Print the runner command:

```bash
npm run test:browser:codex
```

Then run the printed JavaScript command from a Codex session where the in-app Browser is open, signed in, and pointed at the local app.

When the in-app Browser automation is slow, run the same suite in shards:

```js
// Smoke, themes, and layout
var weatherTechRegression = await import("file:///Users/spotty/Documents/New%20project/tests/codex-browser/weathertech-os-regression.mjs?run=" + Date.now());
var result = await weatherTechRegression.runWeatherTechOsRegression({ browser, nodeRepl, groups: ["dashboard", "themes", "layout"] });
nodeRepl.write(weatherTechRegression.formatRegressionReport(result));

// Leads and estimates
var weatherTechRegression = await import("file:///Users/spotty/Documents/New%20project/tests/codex-browser/weathertech-os-regression.mjs?run=" + Date.now());
var result = await weatherTechRegression.runWeatherTechOsRegression({ browser, nodeRepl, groups: ["crm"] });
nodeRepl.write(weatherTechRegression.formatRegressionReport(result));

// Jobs, scheduling, production checklist, notes, and materials
var weatherTechRegression = await import("file:///Users/spotty/Documents/New%20project/tests/codex-browser/weathertech-os-regression.mjs?run=" + Date.now());
var result = await weatherTechRegression.runWeatherTechOsRegression({ browser, nodeRepl, groups: ["job-builder", "job-production"] });
nodeRepl.write(weatherTechRegression.formatRegressionReport(result));
```

The suite creates isolated `TEST WTOS REGRESSION` records, verifies the live UI workflows, and deletes those records after the run when cleanup is safe.
