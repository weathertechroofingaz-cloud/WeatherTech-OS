import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const crmApp = await readFile(
  new URL("../components/CrmApp.tsx", import.meta.url),
  "utf8",
);
const start = crmApp.indexOf("  const handleSaveEstimate = async (");
const end = crmApp.indexOf("  const handleApproveEstimate = async (");

assert.ok(start >= 0 && end > start, "Estimate save handler must remain present");

const handler = crmApp.slice(start, end);
const saveIndex = handler.indexOf("await createEstimate(client, input, lineItems)");
const reloadIndex = handler.indexOf("await onReload();");
const selectIndex = handler.indexOf("setSelectedEstimateId(savedEstimate.id)");
const focusIndex = handler.indexOf(
  'onViewChange("estimates", { type: "estimate", id: savedEstimate.id })',
);
const noticeIndex = handler.indexOf("onNotice(");

assert.ok(saveIndex >= 0, "Estimate creation must remain awaited");
assert.ok(
  reloadIndex > saveIndex,
  "The saved estimate must be reloaded into the CRM snapshot after persistence",
);
assert.ok(
  selectIndex > reloadIndex && focusIndex > selectIndex,
  "Estimate selection and route focus must occur only after snapshot reload",
);
assert.ok(
  noticeIndex > focusIndex,
  "The success notice must follow refreshed estimate focus",
);
assert.equal(
  handler.match(/await onReload\(\);/g)?.length,
  1,
  "Estimate save must perform exactly one snapshot reload",
);

console.log("Estimate save reload-before-focus contract passed.");
