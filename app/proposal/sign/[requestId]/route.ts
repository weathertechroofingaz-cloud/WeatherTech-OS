import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  PROPOSAL_SIGNING_FRAGMENT_KEY,
  getProposalSigningCsrfCookieName,
  isProposalSigningPublicId,
} from "../../../../lib/proposal-signing/constants";
import { PROPOSAL_SIGNING_RESPONSE_HEADERS } from "../../../../lib/proposal-signing/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ requestId: string }> };

function serializeForInlineScript(value: string) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function signingPageHtml(requestId: string, nonce: string) {
  const serializedRequestId = serializeForInlineScript(requestId);
  const serializedFragmentKey = serializeForInlineScript(PROPOSAL_SIGNING_FRAGMENT_KEY);
  const serializedCsrfCookieName = serializeForInlineScript(
    getProposalSigningCsrfCookieName(requestId),
  );
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="referrer" content="no-referrer">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex">
  <title>Secure proposal review</title>
  <style nonce="${nonce}">
    :root{--brand:#0f172a;--accent:#0284c7;color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}body{margin:0;background:#f1f5f9;color:#0f172a;line-height:1.5}button,input,textarea{font:inherit}button{cursor:pointer}.shell{min-height:100vh;padding:24px 14px 48px}.wrap{width:min(880px,100%);margin:0 auto}.mast{border-radius:18px;background:var(--brand);color:white;padding:24px;box-shadow:0 10px 30px rgba(15,23,42,.16)}.eyebrow{margin:0 0 5px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#bae6fd}.mast h1{margin:0;font-size:clamp(24px,5vw,36px);line-height:1.15}.mast p{margin:9px 0 0;color:#e2e8f0}.card{margin-top:16px;border:1px solid #cbd5e1;border-radius:16px;background:white;padding:20px;box-shadow:0 4px 18px rgba(15,23,42,.07)}.hidden{display:none!important}.status{border-left:4px solid #0284c7}.status.error{border-left-color:#dc2626;background:#fff7f7}.status.success{border-left-color:#059669;background:#f0fdf4}.status h2,.card h2,.card h3{margin:0}.muted{color:#475569}.small{font-size:13px}.grid{display:grid;gap:12px}.facts{grid-template-columns:repeat(2,minmax(0,1fr))}.fact{border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc}.fact span{display:block;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}.fact strong{display:block;margin-top:4px}.total{margin-top:16px;border-radius:14px;background:var(--brand);color:white;padding:18px}.total span{display:block;color:#e2e8f0;font-size:13px;font-weight:700;text-transform:uppercase}.total strong{display:block;margin-top:3px;font-size:30px}.row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:1px solid #e2e8f0}.row:last-child{border-bottom:0}.row strong{text-align:right}.section{margin-top:14px;border:1px solid #e2e8f0;border-radius:12px;padding:14px}.section p{white-space:pre-wrap;margin:8px 0 0}.terms{max-height:320px;overflow:auto;white-space:pre-wrap;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;padding:16px}.field{display:grid;gap:6px}.field label,.label{font-weight:750}.field input,.field textarea{width:100%;border:1px solid #94a3b8;border-radius:10px;padding:12px;background:white;color:#0f172a}.field input:focus,.field textarea:focus{outline:3px solid #bae6fd;border-color:#0284c7}.check{display:flex;align-items:flex-start;gap:10px;border:1px solid #cbd5e1;border-radius:11px;padding:12px}.check input{width:20px;height:20px;margin-top:2px;flex:0 0 auto}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.btn{border:0;border-radius:10px;padding:12px 17px;font-weight:800}.primary{background:#0284c7;color:white}.primary:hover{background:#0369a1}.secondary{border:1px solid #94a3b8;background:white;color:#0f172a}.danger{border:1px solid #fca5a5;background:#fff;color:#b91c1c}.btn:disabled{cursor:not-allowed;opacity:.55}.link{display:inline-flex;align-items:center;justify-content:center;border-radius:10px;background:#0f172a;color:white;text-decoration:none;padding:12px 17px;font-weight:800}.hash{overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#64748b}.divider{height:1px;background:#e2e8f0;margin:18px 0}.notice{border-radius:11px;background:#eff6ff;color:#1e3a8a;padding:12px}.receipt{border:1px solid #86efac;background:#f0fdf4}.footer{text-align:center;margin:22px 0;color:#64748b;font-size:12px}@media(max-width:640px){.shell{padding:12px 10px 32px}.mast,.card{border-radius:13px;padding:16px}.facts{grid-template-columns:1fr}.actions{display:grid}.btn,.link{width:100%}.row{display:grid;gap:4px}.row strong{text-align:left}}
  </style>
</head>
<body>
  <main class="shell">
    <div class="wrap">
      <header class="mast" id="mast">
        <p class="eyebrow">Secure electronic acceptance</p>
        <h1 id="company-title">Proposal review</h1>
        <p>Review the exact finalized proposal before electronically signing.</p>
      </header>

      <section class="card status" id="status" role="status" aria-live="polite">
        <h2 id="status-title">Opening secure proposal</h2>
        <p class="muted" id="status-message">Checking this browser for an active signing session.</p>
        <div class="actions hidden" id="continue-actions">
          <button class="btn primary" id="continue-button" type="button">Continue securely</button>
        </div>
      </section>

      <div class="hidden" id="proposal-content">
        <section class="card">
          <div class="grid facts">
            <div class="fact"><span>Proposal</span><strong id="proposal-number"></strong></div>
            <div class="fact"><span>Finalized revision</span><strong id="revision-number"></strong></div>
            <div class="fact"><span>Prepared for</span><strong id="customer-name"></strong></div>
            <div class="fact"><span>Property</span><strong id="property-address"></strong></div>
            <div class="fact"><span>Signing deadline</span><strong id="request-expires"></strong></div>
          </div>
          <div class="total"><span>Accepted proposal total</span><strong id="accepted-total"></strong></div>
          <div class="actions">
            <a class="link" id="proposal-document" target="_blank" rel="noopener noreferrer nofollow">View exact finalized PDF</a>
          </div>
          <p class="hash">Document SHA-256: <span id="document-sha"></span></p>
        </section>

        <section class="card">
          <h2>Finalized work and pricing</h2>
          <p class="muted">These selections are frozen in the finalized revision you received and cannot be changed while signing.</p>
          <div id="line-items"></div>
          <div class="divider"></div>
          <h3>Finalized options and selection status</h3>
          <div id="accepted-options"></div>
          <div class="divider"></div>
          <div class="row"><span>Base subtotal</span><strong id="base-subtotal"></strong></div>
          <div class="row"><span>Discount</span><strong id="discount-total"></strong></div>
          <div class="row"><span>Tax</span><strong id="tax-total"></strong></div>
          <div class="row"><span>Fees</span><strong id="fee-total"></strong></div>
          <div class="row"><span>Base proposal</span><strong id="base-total"></strong></div>
          <div class="row"><span>Selected upgrades</span><strong id="upgrade-total"></strong></div>
          <div class="row"><span>Deposit type</span><strong id="deposit-type"></strong></div>
          <div class="row"><span>Frozen deposit value</span><strong id="deposit-value"></strong></div>
          <div class="row"><span>Required deposit after signature</span><strong id="deposit-total"></strong></div>
          <div class="row"><span>Remaining balance</span><strong id="remaining-total"></strong></div>
        </section>

        <section class="card">
          <h2>Proposal details</h2>
          <div id="proposal-sections"></div>
        </section>

        <section class="card">
          <h2>Terms and electronic records</h2>
          <h3 class="small">Proposal terms</h3>
          <div class="terms" id="proposal-terms"></div>
          <h3 class="small">Electronic records disclosure</h3>
          <div class="terms" id="electronic-disclosure"></div>
        </section>

        <section class="card" id="signing-card">
          <h2>Electronic signature</h2>
          <p class="notice">Signing as <strong id="signer-identity"></strong>. This invitation was delivered to <strong id="signer-email"></strong>. Confirm the exact name below, type it again as your signature, and make each acknowledgement.</p>
          <form class="grid" id="signing-form" novalidate>
            <div class="field">
              <label for="signer-name">Signer legal name</label>
              <input id="signer-name" name="signerName" autocomplete="name" maxlength="160" required>
            </div>
            <div class="field">
              <label for="signature-text">Type the same legal name as your electronic signature</label>
              <input id="signature-text" name="signatureText" autocomplete="off" maxlength="160" required>
            </div>
            <label class="check"><input id="terms-accepted" type="checkbox" required><span>I have reviewed and agree to the exact finalized proposal terms and accepted total shown above.</span></label>
            <label class="check"><input id="electronic-consent" type="checkbox" required><span>I consent to use electronic records and electronic signatures for this proposal and confirm I can access, download, print or save, and retain the exact proposal and signed receipt.</span></label>
            <label class="check"><input id="signature-intent" type="checkbox" required><span>I intend the typed legal name above to be my electronic signature and understand it is legally binding.</span></label>
            <div class="actions">
              <button class="btn primary" id="sign-button" type="submit">Sign and accept proposal</button>
            </div>
          </form>
          <details class="divider" id="decline-panel">
            <summary>Decline this proposal</summary>
            <div class="field">
              <label for="decline-reason">Reason (optional)</label>
              <textarea id="decline-reason" rows="3" maxlength="300" placeholder="Optional reason"></textarea>
            </div>
            <label class="check"><input id="decline-confirm" type="checkbox"><span>I understand this will decline this exact proposal revision.</span></label>
            <div class="actions"><button class="btn danger" id="decline-button" type="button">Confirm decline</button></div>
          </details>
        </section>

        <section class="card receipt hidden" id="completion-card">
          <h2 id="completion-title">Proposal response recorded</h2>
          <p id="completion-message"></p>
          <div class="actions hidden" id="receipt-actions">
            <a class="link" id="receipt-link" target="_blank" rel="noopener noreferrer nofollow">Download signed receipt</a>
          </div>
        </section>
      </div>
      <p class="footer">Private signing session · No public proposal or document URL is stored</p>
      <noscript><section class="card status error"><h2>JavaScript is required</h2><p>Open this secure link in a browser with JavaScript enabled, or contact the company that sent the proposal.</p></section></noscript>
    </div>
  </main>
  <script nonce="${nonce}">
  (() => {
    "use strict";
    const requestId = ${serializedRequestId};
    const fragmentKey = ${serializedFragmentKey};
    const csrfCookieName = ${serializedCsrfCookieName};
    const apiBase = "/api/proposals/signing/" + encodeURIComponent(requestId);
    let pendingToken = null;
    let pendingExchangeKey = null;
    let currentSession = null;
    let acceptOperationKey = crypto.randomUUID();
    let declineOperationKey = crypto.randomUUID();

    const byId = (id) => document.getElementById(id);
    const setText = (id, value) => { byId(id).textContent = value == null ? "" : String(value); };
    const show = (id, visible = true) => byId(id).classList.toggle("hidden", !visible);
    const clear = (element) => { while (element.firstChild) element.removeChild(element.firstChild); };
    const money = (value) => new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" }).format(Number(value) || 0);
    const apiUrl = (suffix) => apiBase + "/" + suffix;

    function signedMoney(value) {
      const numeric = Number(value) || 0;
      return Math.abs(numeric) < .005 ? money(0) : (numeric > 0 ? "+" : "-") + money(Math.abs(numeric));
    }

    function roundRationalHalfAwayFromZero(numerator, denominator) {
      const sign = numerator < 0n ? -1n : 1n;
      const magnitude = numerator < 0n ? -numerator : numerator;
      return sign * ((magnitude * 2n + denominator) / (denominator * 2n));
    }

    function optionTotal(option) {
      const priceThousandths = BigInt(Math.round(Number(option.price) * 1000));
      const priceCents = roundRationalHalfAwayFromZero(priceThousandths, 10n);
      const quantityMilli = BigInt(Math.round(Math.max(Number(option.quantity), 0) * 1000));
      return Number(roundRationalHalfAwayFromZero(priceCents * quantityMilli, 1000n)) / 100;
    }
    function optionNetAdjustment(option, baseTotal) {
      const total = optionTotal(option);
      if (option.priceEffectType === "replace_base_amount") return total - Number(option.baseReplacementAmount);
      if (option.priceEffectType === "full_alternate_total") return total - Number(baseTotal);
      return total;
    }

    function optionPricingEffect(option) {
      if (option.priceEffectType === "replace_base_amount") return "Replace base amount - substitutes this option total for the frozen replacement amount shown below";
      if (option.priceEffectType === "full_alternate_total") return "Full alternate total - substitutes this option total for the full base proposal";
      return "Additive - adds this option total to the proposal";
    }

    function generateExchangeKey() {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      return btoa(String.fromCharCode(...bytes))
        .replace(/[+]/g, "-")
        .replace(/[/]/g, "_")
        .replace(/=+$/g, "");
    }

    function clearPendingExchange() {
      pendingToken = null;
      pendingExchangeKey = null;
    }

    function setStatus(title, message, tone) {
      setText("status-title", title);
      setText("status-message", message);
      const status = byId("status");
      status.classList.toggle("error", tone === "error");
      status.classList.toggle("success", tone === "success");
    }

    function readCookie(name) {
      const prefix = name + "=";
      const match = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
      return match ? decodeURIComponent(match.slice(prefix.length)) : null;
    }

    async function jsonRequest(path, options = {}) {
      const response = await fetch(apiUrl(path), {
        credentials: "same-origin",
        cache: "no-store",
        ...options,
        headers: { Accept:"application/json", ...(options.headers || {}) },
      });
      const payload = await response.json().catch(() => ({ ok:false, message:"The secure service returned an unreadable response." }));
      if (!response.ok || payload.ok !== true) throw new Error(payload.message || "The secure signing request failed.");
      return payload;
    }

    function addRow(container, label, value) {
      const row = document.createElement("div"); row.className = "row";
      const left = document.createElement("span"); left.textContent = label;
      const right = document.createElement("strong"); right.textContent = value;
      row.append(left, right); container.append(row);
    }

    function renderSession(session) {
      currentSession = session;
      const proposal = session.proposal;
      document.title = proposal.companyName + " - " + proposal.proposalNumber;
      const color = /^#[0-9a-f]{6}$/i.test(proposal.brandPrimaryColor || "") ? proposal.brandPrimaryColor : "#0f172a";
      document.documentElement.style.setProperty("--brand", color);
      setText("company-title", proposal.companyName);
      setText("proposal-number", proposal.proposalNumber + " · " + proposal.title);
      setText("revision-number", "Revision " + proposal.revisionNumber + " · finalized " + proposal.issueDate);
      setText("customer-name", proposal.customerName);
      setText("property-address", proposal.propertyAddress || "Property address on proposal");
      const requestDeadline = new Date(session.requestExpiresAt);
      setText(
        "request-expires",
        Number.isNaN(requestDeadline.getTime())
          ? session.requestExpiresAt
          : requestDeadline.toLocaleString() + " (" + session.requestExpiresAt + ")",
      );
      setText("accepted-total", money(proposal.acceptedTotal));
      setText("base-subtotal", money(proposal.baseSubtotal));
      setText("discount-total", money(proposal.discountTotal));
      setText("tax-total", money(proposal.taxTotal));
      setText("fee-total", money(proposal.feeTotal));
      setText("base-total", money(proposal.baseTotal));
      setText("upgrade-total", money(proposal.selectedUpgradesTotal));
      setText("deposit-type", proposal.depositType === "percent" ? "Percent (percent)" : proposal.depositType === "fixed" ? "Fixed amount (fixed)" : proposal.depositType === "none" ? "None (none)" : proposal.depositType);
      setText("deposit-value", proposal.depositType === "percent" ? proposal.depositValue + "%" : proposal.depositType === "fixed" ? money(proposal.depositValue) : proposal.depositType === "none" ? proposal.depositValue + " (not applicable)" : String(proposal.depositValue));
      setText("deposit-total", proposal.depositRequired ? money(proposal.requiredDepositAmount) : "No deposit required");
      setText("remaining-total", money(proposal.remainingBalance));
      setText("document-sha", session.document.sha256);
      byId("proposal-document").href = apiUrl("document");
      setText("proposal-terms", proposal.terms);
      setText("electronic-disclosure", proposal.electronicRecordsDisclosure);
      setText("signer-identity", session.signer.name);
      setText("signer-email", session.signer.emailMasked);
      byId("signer-name").value = session.signer.name;

      const lineItems = byId("line-items"); clear(lineItems);
      proposal.lineItems.slice().sort((a,b) => a.sortOrder - b.sortOrder).forEach((item) => {
        const article = document.createElement("article"); article.className = "section";
        const title = document.createElement("h3"); title.textContent = item.name;
        article.append(title);
        addRow(article, "Quantity / unit", item.quantity + " " + item.unit);
        addRow(article, "Line total", money(item.total));
        addRow(article, "Description", item.description || "Not specified");
        lineItems.append(article);
      });
      if (!proposal.lineItems.length) addRow(lineItems, "Finalized base scope", money(proposal.baseTotal));

      const options = byId("accepted-options"); clear(options);
      const selectedFullAlternate = proposal.options.find((option) =>
        option.selected && option.priceEffectType === "full_alternate_total"
      );
      proposal.options.slice().sort((a,b) => a.sortOrder - b.sortOrder).forEach((option) => {
        const selected = option.selected;
        const netAdjustment = optionNetAdjustment(option, proposal.baseTotal);
        const applied = selected && (!selectedFullAlternate || option === selectedFullAlternate || option.priceEffectType === "additive");
        const article = document.createElement("article"); article.className = "section";
        const title = document.createElement("h3"); title.textContent = option.name;
        article.append(title);
        addRow(article, "Selection", selected ? "Accepted" : "Not selected");
        addRow(article, "Quantity / unit", option.quantity + " " + option.unit);
        addRow(article, "Unit price", money(option.price));
        addRow(article, "Option total", money(optionTotal(option)));
        addRow(article, "Pricing effect", optionPricingEffect(option));
        addRow(article, "Frozen price-effect type", option.priceEffectType);
        addRow(article, "Frozen base amount replaced", money(option.baseReplacementAmount));
        addRow(article, "Net adjustment if selected", signedMoney(netAdjustment));
        addRow(article, "Applied to accepted total", applied ? signedMoney(netAdjustment) : selected ? money(0) + " (superseded by full alternate)" : money(0) + " (not selected)");
        addRow(article, "Description", option.description || "Not specified");
        addRow(article, "Scope details", option.scopeDetails || "Not specified");
        addRow(article, "Warranty effect", option.warrantyEffect || "Not specified");
        addRow(article, "Customer notes", option.customerNotes || "Not specified");
        options.append(article);
      });
      if (!proposal.options.length) addRow(options, "Base proposal only", "No optional upgrades");

      const sections = byId("proposal-sections"); clear(sections);
      proposal.sections.slice().sort((a,b) => a.sortOrder - b.sortOrder).forEach((item) => {
        const section = document.createElement("article"); section.className = "section";
        const title = document.createElement("h3"); title.textContent = item.title;
        const body = document.createElement("p"); body.textContent = item.body;
        section.append(title, body); sections.append(section);
      });

      show("proposal-content");
      show("continue-actions", false);
      if (session.status === "active") {
        show("signing-card"); show("completion-card", false);
        setStatus("Secure proposal ready", "Review the finalized PDF, pricing, scope, and terms before signing.", "success");
      } else if (session.status === "signed") {
        show("signing-card", false); show("completion-card"); show("receipt-actions", true);
        byId("receipt-link").href = apiUrl("receipt");
        setText("completion-title", "Proposal signed");
        setText("completion-message", "Your electronic acceptance is recorded. Save the signed receipt for your records.");
        setStatus("Electronic signature complete", "This finalized proposal revision has already been signed.", "success");
      } else {
        show("signing-card", false); show("completion-card"); show("receipt-actions", false);
        setText("completion-title", "Proposal declined");
        setText("completion-message", "Your response is recorded. Contact the company if you would like a revised proposal.");
        setStatus("Proposal declined", "This finalized proposal revision is no longer awaiting a signature.", "success");
      }
    }

    async function loadSession() {
      try { renderSession(await jsonRequest("session")); }
      catch (error) { setStatus("Signing link unavailable", error instanceof Error ? error.message : "Open the original email link again.", "error"); }
    }

    byId("continue-button").addEventListener("click", async () => {
      const token = pendingToken;
      const exchangeKey = pendingExchangeKey;
      const button = byId("continue-button");
      if (!token || !exchangeKey) { setStatus("Signing link unavailable", "Open the original email link again.", "error"); return; }
      show("continue-actions", false);
      button.disabled = true;
      try {
        renderSession(await jsonRequest("session"));
        clearPendingExchange();
        return;
      } catch {}
      setStatus("Starting secure session", "Verifying this one-time invitation.");
      try {
        await jsonRequest("exchange", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({token,exchangeKey}) });
        renderSession(await jsonRequest("session"));
        clearPendingExchange();
      } catch (error) {
        button.disabled = false;
        button.textContent = "Retry securely";
        show("continue-actions");
        setStatus("Secure session not confirmed", (error instanceof Error ? error.message : "The invitation could not be verified.") + " Retry with this same open link.", "error");
      }
    });

    byId("signing-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!currentSession || currentSession.status !== "active") return;
      const signerName = byId("signer-name").value.trim().replace(/\\s+/g," ");
      const signatureText = byId("signature-text").value.trim().replace(/\\s+/g," ");
      if (signerName.length < 2 || signerName !== signatureText || !byId("terms-accepted").checked || !byId("electronic-consent").checked || !byId("signature-intent").checked) {
        setStatus("Complete every signing step", "Type the same legal name twice and make all three acknowledgements.", "error"); return;
      }
      const csrf = readCookie(csrfCookieName);
      if (!csrf) { setStatus("Secure session unavailable", "Open the original email link again to restart securely.", "error"); return; }
      const button = byId("sign-button"); button.disabled = true; button.textContent = "Recording signature…";
      try {
        const result = await jsonRequest("accept", { method:"POST", headers:{"Content-Type":"application/json","X-WTOS-CSRF":csrf}, body:JSON.stringify({idempotencyKey:acceptOperationKey,signerName,signatureText,termsAccepted:true,electronicRecordsConsented:true,signatureIntentAcknowledged:true}) });
        setStatus("Electronic signature complete", "Your signature and exact accepted total were recorded.", "success");
        show("signing-card", false); show("completion-card"); show("receipt-actions", true);
        byId("receipt-link").href = apiUrl("receipt");
        setText("completion-title", "Proposal signed");
        setText("completion-message", result.receiptReady ? "Your signed receipt is ready to download." : "Your signature is recorded. The secure receipt will be prepared when you download it.");
      } catch (error) {
        setStatus("Signature outcome not confirmed", (error instanceof Error ? error.message : "The signing response was interrupted.") + " Your signature may already be recorded. Retry with this same open page or refresh to confirm the current status.", "error");
        button.disabled = false; button.textContent = "Sign and accept proposal";
      }
    });

    byId("decline-button").addEventListener("click", async () => {
      if (!byId("decline-confirm").checked) { setStatus("Confirm the decline", "Check the decline confirmation before continuing.", "error"); return; }
      const csrf = readCookie(csrfCookieName);
      if (!csrf) { setStatus("Secure session unavailable", "Open the original email link again to restart securely.", "error"); return; }
      const reason = byId("decline-reason").value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"_").slice(0,80) || "customer_declined";
      const button = byId("decline-button"); button.disabled = true;
      try {
        await jsonRequest("decline", { method:"POST", headers:{"Content-Type":"application/json","X-WTOS-CSRF":csrf}, body:JSON.stringify({idempotencyKey:declineOperationKey,reasonCode:reason,confirmDecline:true}) });
        setStatus("Proposal declined", "Your response has been recorded.", "success");
        show("signing-card", false); show("completion-card"); show("receipt-actions", false);
        setText("completion-title", "Proposal declined"); setText("completion-message", "Contact the company if you would like a revised proposal.");
      } catch (error) {
        setStatus("Decline outcome not confirmed", (error instanceof Error ? error.message : "The decline response was interrupted.") + " Your response may already be recorded. Retry with this same open page or refresh to confirm the current status.", "error"); button.disabled = false;
      }
    });

    const fragment = new URLSearchParams(location.hash.slice(1));
    const fragmentToken = fragment.get(fragmentKey);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    if (/^[A-Za-z0-9_-]{43}$/.test(fragmentToken || "")) {
      pendingToken = fragmentToken;
      pendingExchangeKey = generateExchangeKey();
      setStatus("Ready to verify invitation", "Select Continue securely to exchange this one-time email invitation for a private browser session.");
      show("continue-actions");
    } else {
      loadSession();
    }
  })();
  </script>
</body>
</html>`;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { requestId: rawRequestId } = await context.params;
  const requestId = rawRequestId.toLowerCase();
  if (!isProposalSigningPublicId(requestId)) {
    return new NextResponse("Signing link not found.", {
      status: 404,
      headers: {
        ...PROPOSAL_SIGNING_RESPONSE_HEADERS,
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
      },
    });
  }

  const nonce = randomBytes(18).toString("base64url");
  return new NextResponse(signingPageHtml(requestId, nonce), {
    status: 200,
    headers: {
      ...PROPOSAL_SIGNING_RESPONSE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        `style-src 'nonce-${nonce}'`,
        "connect-src 'self'",
        "img-src 'self' data:",
        "frame-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
      ].join("; "),
    },
  });
}
