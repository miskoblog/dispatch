"use strict";

/* ================= GATE ================= */

const GATE_HASH = "91916791d7c76980b0fc3891dadd28c6c4430e68f5be92e5383beec6a4d31dcb";

async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function initGate() {
  const gate = document.getElementById("gate");
  const form = document.getElementById("gateForm");
  const input = document.getElementById("gatePassword");
  const error = document.getElementById("gateError");
  if (gate.classList.contains("is-unlocked")) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const hash = await sha256Hex(input.value.trim());
    if (hash === GATE_HASH) {
      localStorage.setItem("dispatch_access", "granted");
      gate.classList.add("is-unlocked");
      error.classList.remove("is-visible");
    } else {
      error.classList.add("is-visible");
      input.value = "";
      input.focus();
    }
  });
}

/* ================= THEME ================= */

function initTheme() {
  const toggle = document.getElementById("themeToggle");
  const root = document.documentElement;
  function effectiveTheme() {
    const attr = root.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") return attr;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  toggle.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("dispatch_theme", next);
  });
}

/* ================= TABS ================= */

function initTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => { b.classList.remove("is-active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
      document.getElementById("panel-" + btn.dataset.tab).classList.add("is-active");
      // Re-sync the panel being switched to from the active job — another tool
      // may have updated shared job fields (e.g. ShipCheck's deliverable type
      // feeding RateCard's prefill) since this panel was last rendered.
      syncPanelFromJob(btn.dataset.tab);
    });
  });
}

function syncPanelFromJob(tab) {
  if (tab === "brief") populateBriefForm();
  else if (tab === "ship") populateShipForm();
  else if (tab === "golive") populateGoliveForm();
  else if (tab === "rate") populateRateForm();
}

/* ================= UTIL ================= */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 1800);
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard")).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    showToast("Copied to clipboard");
  } catch (e) {
    showToast("Couldn't copy — select and copy manually");
  }
  document.body.removeChild(ta);
}

/* ================= JOB STORE ================= */
/* One job record is shared across all four tools — this is what makes Dispatch
   read as one operating layer rather than four disconnected tools. */

const JOBS_KEY = "dispatch_jobs";
const ACTIVE_KEY = "dispatch_active_job";

function loadJobs() {
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function saveJobs(allJobs) {
  localStorage.setItem(JOBS_KEY, JSON.stringify(allJobs));
}
function newJobId() {
  return "job_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}
function blankJob() {
  const now = Date.now();
  return {
    id: newJobId(), createdAt: now, updatedAt: now,
    // Brief Forge
    product: "", price: "", audience: "", goal: "leads", strength: "speed",
    angleScores: null, topAngleKey: null, briefText: "",
    // ShipCheck (keyed by deliverable type so switching types remembers each checklist)
    deliverableType: "", shipCheckState: {},
    // GoLive (keyed by platform)
    golivePlatform: "", goLiveState: {},
    // RateCard
    serviceType: "", market: "standard", complexity: "standard", rush: false, rateCardResult: null,
  };
}

let jobs = loadJobs();
let activeJobId = localStorage.getItem(ACTIVE_KEY);

function ensureActiveJob() {
  const ids = Object.keys(jobs);
  if (!activeJobId || !jobs[activeJobId]) {
    if (ids.length > 0) {
      ids.sort((a, b) => jobs[b].updatedAt - jobs[a].updatedAt);
      activeJobId = ids[0];
    } else {
      const job = blankJob();
      jobs[job.id] = job;
      activeJobId = job.id;
      saveJobs(jobs);
    }
    localStorage.setItem(ACTIVE_KEY, activeJobId);
  }
}
function getActiveJob() { return jobs[activeJobId]; }
function touchJob(job) { job.updatedAt = Date.now(); saveJobs(jobs); }

function jobLabel(job) {
  const name = (job.product || "").trim();
  const d = new Date(job.createdAt);
  const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (name ? name.slice(0, 34) : "Untitled job") + " — " + dateStr;
}

function createNewJob() {
  const job = blankJob();
  jobs[job.id] = job;
  activeJobId = job.id;
  saveJobs(jobs);
  localStorage.setItem(ACTIVE_KEY, activeJobId);
  renderAll();
  showToast("New job started");
}

function switchJob(id) {
  if (!jobs[id]) return;
  activeJobId = id;
  localStorage.setItem(ACTIVE_KEY, activeJobId);
  renderAll();
}

function deleteActiveJob() {
  const ids = Object.keys(jobs);
  if (ids.length <= 1) { showToast("Can't delete your only job"); return; }
  delete jobs[activeJobId];
  saveJobs(jobs);
  activeJobId = null;
  ensureActiveJob();
  renderAll();
  showToast("Job deleted");
}

/* ================= SAVED LISTS (Save / Open / Delete — every tool) ================= */
/* Independent of the job-carry-forward system above: this is an explicit,
   named history of past outputs per tool, so a buyer can save a specific
   brief/check/plan/quote and come back to reopen it later, separate from
   whichever job happens to be active. */

const SAVED_KEYS = {
  brief: "dispatch_saved_brief", ship: "dispatch_saved_ship",
  golive: "dispatch_saved_golive", rate: "dispatch_saved_rate",
};

function loadSaved(tool) {
  try {
    const raw = localStorage.getItem(SAVED_KEYS[tool]);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function persistSaved(tool, list) { localStorage.setItem(SAVED_KEYS[tool], JSON.stringify(list)); }
function addSaved(tool, entry) {
  const list = loadSaved(tool);
  entry.id = "sv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  entry.savedAt = Date.now();
  list.unshift(entry);
  persistSaved(tool, list);
  return list;
}
function deleteSaved(tool, id) {
  const list = loadSaved(tool).filter((e) => e.id !== id);
  persistSaved(tool, list);
  return list;
}
function fmtSavedDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Renders a tool's "Saved X" list and wires each row's Open/Delete buttons.
 * metaFn(entry) -> a short summary string shown before the saved date.
 * onOpen(entry) -> restores that saved entry into the active job / form.
 * onDeleted() -> called after a row is deleted, to let the caller re-render.
 */
function renderSavedList(tool, listElId, countElId, metaFn, onOpen, onDeleted) {
  const list = loadSaved(tool);
  const wrap = document.getElementById(listElId);
  const countEl = document.getElementById(countElId);
  if (countEl) countEl.textContent = list.length ? (list.length + " saved") : "";
  if (!list.length) {
    wrap.innerHTML = '<p class="empty-hint">Nothing saved yet — click Save above once you have output worth keeping.</p>';
    return;
  }
  wrap.innerHTML = "";
  list.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "saved-row";

    const info = document.createElement("div");
    info.className = "saved-row-info";
    const title = document.createElement("div");
    title.className = "saved-row-title";
    title.textContent = entry.title;
    const meta = document.createElement("div");
    meta.className = "saved-row-meta";
    meta.textContent = metaFn(entry) + " · " + fmtSavedDate(entry.savedAt);
    info.appendChild(title);
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "saved-row-actions";
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "ghost-btn";
    openBtn.textContent = "Open";
    openBtn.addEventListener("click", () => onOpen(entry));
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "ghost-btn";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      deleteSaved(tool, entry.id);
      onDeleted();
      showToast("Deleted");
    });
    actions.appendChild(openBtn);
    actions.appendChild(delBtn);

    row.appendChild(info);
    row.appendChild(actions);
    wrap.appendChild(row);
  });
}

function renderAllSavedLists() {
  renderBriefSavedList();
  renderShipSavedList();
  renderGoliveSavedList();
  renderRateSavedList();
}

/* ================= JOB BAR (rendered into every tool panel) ================= */

function renderJobbars() {
  const job = getActiveJob();
  document.querySelectorAll(".jobbar").forEach((bar) => {
    bar.innerHTML = "";
    const label = document.createElement("span");
    label.className = "jobbar-label";
    label.textContent = "Job";

    const select = document.createElement("select");
    select.setAttribute("aria-label", "Select job");
    Object.values(jobs).sort((a, b) => b.updatedAt - a.updatedAt).forEach((j) => {
      const opt = document.createElement("option");
      opt.value = j.id;
      opt.textContent = jobLabel(j);
      if (j.id === activeJobId) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => switchJob(select.value));

    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "ghost-btn";
    newBtn.textContent = "+ New Job";
    newBtn.addEventListener("click", createNewJob);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "ghost-btn";
    delBtn.textContent = "Delete";
    delBtn.title = "Delete this job";
    delBtn.addEventListener("click", deleteActiveJob);

    const summary = document.createElement("span");
    summary.className = "jobbar-summary";
    summary.textContent = job.price ? ("$" + job.price + (job.audience ? " · " + job.audience.slice(0, 28) : "")) : "";

    bar.appendChild(label);
    bar.appendChild(select);
    bar.appendChild(newBtn);
    bar.appendChild(delBtn);
    bar.appendChild(summary);
  });
}

function renderAll() {
  renderJobbars();
  populateBriefForm();
  populateShipForm();
  populateGoliveForm();
  populateRateForm();
}

/* ================= BRIEF FORGE ================= */
/* Weighted scoring engine: price band + audience keywords + stated goal + the
   buyer's own claimed strength all vote on six positioning angles. */

const ANGLES = {
  speed: { label: "Speed & Turnaround", line: "Prioritize turnaround — I need something I can act on quickly, not a slow multi-round process." },
  affordability: { label: "Affordability", line: "Keep this lean and cost-effective — I'm optimizing for value, not the most elaborate version possible." },
  premium: { label: "Premium Quality", line: "This needs to feel premium — {audience} will judge quality fast, so don't hold back on craft." },
  personalization: { label: "Personalization", line: "Make this feel written specifically for {audience}, not a generic template with the names swapped in." },
  proof: { label: "Proven Results", line: "Lean on credibility and proof — {audience} respond to evidence, not just promises." },
  expertise: { label: "Niche Expertise", line: "Show deep familiarity with {audience}'s world — specifics beat generalities here." },
};

const AUDIENCE_KEYWORDS = [
  { test: /agenc(y|ies)/i, scores: { proof: 2, expertise: 2 } },
  { test: /(ecommerce|e-commerce|shop|store|retail)/i, scores: { speed: 2, affordability: 1 } },
  { test: /(coach|consult)/i, scores: { personalization: 3, proof: 1 } },
  { test: /(startup|founder)/i, scores: { speed: 2, affordability: 2 } },
  { test: /(enterprise|corporate)/i, scores: { premium: 3, proof: 2 } },
  { test: /(local|small business)/i, scores: { affordability: 2, personalization: 1 } },
];

const GOAL_SCORES = {
  leads: { speed: 2, personalization: 1 },
  sales: { proof: 3 },
  retainer: { personalization: 2, expertise: 1 },
  awareness: { premium: 1, proof: 1 },
};
const GOAL_LABELS = { leads: "Generate leads", sales: "Drive sales", retainer: "Win a retainer client", awareness: "Build awareness" };

const STRENGTH_SCORES = {
  speed: { speed: 4 }, price: { affordability: 4 }, quality: { premium: 4 },
  personalization: { personalization: 4 }, experience: { expertise: 4 },
};

function scoreAngles(job) {
  const scores = { speed: 0, affordability: 0, premium: 0, personalization: 0, proof: 0, expertise: 0 };
  const price = parseFloat(String(job.price).replace(/[^0-9.]/g, ""));
  if (!isNaN(price)) {
    if (price < 300) { scores.affordability += 3; scores.speed += 1; }
    else if (price < 1500) { scores.affordability += 1; scores.personalization += 1; }
    else { scores.premium += 3; scores.proof += 1; }
  }
  let matched = false;
  AUDIENCE_KEYWORDS.forEach((k) => {
    if (job.audience && k.test.test(job.audience)) {
      matched = true;
      Object.entries(k.scores).forEach(([a, v]) => { scores[a] += v; });
    }
  });
  if (!matched && job.audience) scores.expertise += 1;
  Object.entries(GOAL_SCORES[job.goal] || {}).forEach(([a, v]) => { scores[a] += v; });
  Object.entries(STRENGTH_SCORES[job.strength] || {}).forEach(([a, v]) => { scores[a] += v; });
  return scores;
}

function fillTemplate(str, job) {
  return str.replace(/\{audience\}/g, job.audience || "your audience");
}

function generateBrief() {
  const job = getActiveJob();
  job.product = document.getElementById("briefProduct").value.trim();
  job.price = document.getElementById("briefPrice").value.trim();
  job.audience = document.getElementById("briefAudience").value.trim();
  job.goal = document.getElementById("briefGoal").value;
  job.strength = document.getElementById("briefStrength").value;

  const scores = scoreAngles(job);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];
  const hasSecond = second && second[1] > 0 && (top[1] - second[1]) <= 2;

  job.angleScores = scores;
  job.topAngleKey = top[0];

  const topAngle = ANGLES[top[0]];
  const secondAngle = hasSecond ? ANGLES[second[0]] : null;

  const lines = [];
  lines.push("JOB: " + (job.product || "(untitled)"));
  lines.push("Audience: " + (job.audience || "—"));
  lines.push("Price point: " + (job.price ? "$" + job.price : "—"));
  lines.push("Primary goal: " + GOAL_LABELS[job.goal]);
  lines.push("");
  lines.push("Positioning angle (ranked #1 by Dispatch): " + topAngle.label);
  if (secondAngle) lines.push("Secondary angle: " + secondAngle.label);
  lines.push("");
  lines.push("— Paste below into your first message to the Claw Agent —");
  lines.push("");
  lines.push("I need " + (job.product || "this") + " for " + (job.audience || "my audience") + ". " + fillTemplate(topAngle.line, job));
  if (secondAngle) lines.push(fillTemplate(secondAngle.line, job));
  lines.push("Budget/price point for this job is " + (job.price ? "$" + job.price : "flexible") + ". The goal is to " + GOAL_LABELS[job.goal].toLowerCase() + ".");
  lines.push("Please ask me anything you need before starting, and flag if anything here is unclear.");

  job.briefText = lines.join("\n");
  touchJob(job);
  renderBriefOutput(job);
  renderJobbars();
}

function renderBriefOutput(job) {
  const wrap = document.getElementById("briefAngles");
  if (job.angleScores) {
    const max = Math.max(1, ...Object.values(job.angleScores));
    wrap.innerHTML = Object.entries(job.angleScores)
      .sort((a, b) => b[1] - a[1])
      .map(([key, val]) => {
        const pct = Math.round((val / max) * 100);
        const topClass = key === job.topAngleKey ? " is-top" : "";
        return '<div class="angle-bar-row' + topClass + '"><span class="angle-bar-name">' + escapeHtml(ANGLES[key].label) +
          '</span><span class="angle-bar-track"><span class="angle-bar-fill" style="width:' + pct + '%"></span></span>' +
          '<span class="angle-bar-score">' + val + '</span></div>';
      }).join("");
  } else {
    wrap.innerHTML = "";
  }
  document.getElementById("briefOutput").textContent = job.briefText ||
    "Fill in the form and click Generate Brief to see your ranked positioning angle and a ready-to-paste opening message.";
}

function populateBriefForm() {
  const job = getActiveJob();
  document.getElementById("briefProduct").value = job.product || "";
  document.getElementById("briefPrice").value = job.price || "";
  document.getElementById("briefAudience").value = job.audience || "";
  document.getElementById("briefGoal").value = job.goal || "leads";
  document.getElementById("briefStrength").value = job.strength || "speed";
  renderBriefOutput(job);
}

function syncBriefFields() {
  const job = getActiveJob();
  job.product = document.getElementById("briefProduct").value.trim();
  job.price = document.getElementById("briefPrice").value.trim();
  job.audience = document.getElementById("briefAudience").value.trim();
  job.goal = document.getElementById("briefGoal").value;
  job.strength = document.getElementById("briefStrength").value;
  touchJob(job);
  renderJobbars();
}

function saveBrief() {
  const job = getActiveJob();
  if (!job.briefText) { showToast("Generate a brief first"); return; }
  addSaved("brief", {
    title: job.product || "Untitled brief",
    product: job.product, price: job.price, audience: job.audience, goal: job.goal, strength: job.strength,
    angleScores: job.angleScores, topAngleKey: job.topAngleKey, briefText: job.briefText,
  });
  renderBriefSavedList();
  showToast("Brief saved");
}

function openSavedBrief(entry) {
  const job = getActiveJob();
  job.product = entry.product;
  job.price = entry.price;
  job.audience = entry.audience;
  job.goal = entry.goal;
  job.strength = entry.strength;
  job.angleScores = entry.angleScores;
  job.topAngleKey = entry.topAngleKey;
  job.briefText = entry.briefText;
  touchJob(job);
  populateBriefForm();
  renderJobbars();
  showToast("Loaded into current job");
}

function renderBriefSavedList() {
  renderSavedList("brief", "briefSavedList", "briefSavedCount",
    (e) => (e.audience || "—") + " · " + (e.price ? "$" + e.price : "—"),
    openSavedBrief, renderBriefSavedList);
}

function initBrief() {
  document.getElementById("briefGenerateBtn").addEventListener("click", generateBrief);
  document.getElementById("briefCopyBtn").addEventListener("click", () => {
    const job = getActiveJob();
    if (!job.briefText) { showToast("Generate a brief first"); return; }
    copyToClipboard(job.briefText);
  });
  document.getElementById("briefSaveBtn").addEventListener("click", saveBrief);
  ["briefProduct", "briefPrice", "briefAudience", "briefGoal", "briefStrength"].forEach((id) => {
    document.getElementById(id).addEventListener("change", syncBriefFields);
  });
}

/* ================= SHIPCHECK ================= */
/* Weighted checklist per deliverable type — items are worth different amounts,
   so a missed critical item costs more than a missed cosmetic one. */

const SHIP_CHECKLISTS = {
  "landing-page": [
    ["cta", "Has one single, clear call-to-action above the fold", 3],
    ["headline", "Headline states the core benefit, not just the feature", 3],
    ["mobile", "Renders correctly at mobile width", 3],
    ["links", "All links and buttons actually go somewhere", 2],
    ["placeholder", "No placeholder or lorem ipsum text left in", 3],
    ["proof", "Social proof or credibility element present", 2],
    ["voice", "Copy matches your brand voice, not generic AI phrasing", 2],
    ["spelling", "Spelling and grammar clean on a full read-through", 1],
  ],
  "email-sequence": [
    ["cta", "Each email has one clear goal / CTA", 3],
    ["subjects", 'Subject lines are specific, not generic ("Email 1", "Update")', 2],
    ["order", "Sequence has a logical build (open → value → offer)", 3],
    ["tokens", "Personalization tokens are used correctly and consistently", 2],
    ["compliance", "Unsubscribe / compliance footer language is present", 2],
    ["voice", "Tone matches your brand voice", 2],
    ["mergetags", "No broken merge tags or leftover placeholder brackets", 2],
    ["spelling", "Spelling and grammar clean", 1],
  ],
  "ad-set": [
    ["distinct", "Each ad variant has a distinct angle/hook, not near-duplicates", 3],
    ["length", "Primary text fits the platform's display limits", 2],
    ["cta", "CTA button/text matches your actual offer", 3],
    ["pairing", "Creative and copy pairing makes sense together", 2],
    ["targeting", "Targeting notes included if the platform needs them from you", 2],
    ["claims", "Claims made are things you can actually stand behind", 3],
    ["placeholder", "No placeholder brand names or links", 2],
    ["spelling", "Spelling and grammar clean", 1],
  ],
  "social-content": [
    ["message", "Each post has a clear single message", 2],
    ["hook", "Hooks (first line) are strong enough to stop a scroll", 3],
    ["variety", "Mix of formats/content types, not all repetitive", 2],
    ["voice", "Captions match your brand voice", 2],
    ["hashtags", "Hashtags/mentions are relevant, not generic filler", 1],
    ["claims", "Any claims made are accurate and supportable", 2],
    ["placeholder", "No leftover placeholder text or brackets", 2],
    ["spelling", "Spelling and grammar clean", 1],
  ],
  "product-copy": [
    ["benefit", "Leads with the core benefit, not just specs", 3],
    ["translate", "Key features are translated into buyer benefits", 3],
    ["tone", "Matches the tone/expectations of the destination marketplace", 2],
    ["details", "Includes the details buyers actually ask about (size, materials, compatibility)", 2],
    ["claims", "No factual claims you can't verify", 3],
    ["formatting", "Formatting matches platform norms (bullets, length)", 1],
    ["placeholder", "No leftover placeholder text", 2],
    ["spelling", "Spelling and grammar clean", 1],
  ],
  "blog-article": [
    ["headline", "Headline is specific and makes a promise the article delivers on", 3],
    ["structure", "Structure uses clear subheads a skimmer could follow", 2],
    ["argument", "Makes one central argument/point, not scattered tangents", 2],
    ["cta", "Includes a next step or CTA at the end", 2],
    ["claims", "Claims/statistics are ones you can support or source", 3],
    ["voice", "Matches your brand voice and reading level", 2],
    ["placeholder", "No leftover placeholder text or broken links", 2],
    ["spelling", "Spelling and grammar clean", 1],
  ],
};
const SHIP_TYPE_LABELS = {
  "landing-page": "Landing Page", "email-sequence": "Email Sequence", "ad-set": "Ad Set",
  "social-content": "Social Content Pack", "product-copy": "Product / Listing Copy", "blog-article": "Blog / Article",
};

function renderShipChecklist() {
  const job = getActiveJob();
  const type = job.deliverableType;
  const wrap = document.getElementById("shipChecklist");
  if (!type || !SHIP_CHECKLISTS[type]) {
    wrap.innerHTML = '<p class="empty-hint">Choose a deliverable type above to load its checklist.</p>';
    renderShipScore(0, null);
    return;
  }
  if (!job.shipCheckState[type]) job.shipCheckState[type] = { checked: {} };
  const state = job.shipCheckState[type].checked;
  const items = SHIP_CHECKLISTS[type];
  wrap.innerHTML = items.map(([id, text, weight]) => {
    const checked = !!state[id];
    return '<label class="checklist-item"><input type="checkbox" data-item="' + id + '"' +
      (checked ? " checked" : "") + ' /><span>' + escapeHtml(text) + '</span><span class="item-weight">' + weight + '×</span></label>';
  }).join("");
  wrap.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const j = getActiveJob();
      j.shipCheckState[type].checked[cb.dataset.item] = cb.checked;
      touchJob(j);
      computeShipScore();
    });
  });
  computeShipScore();
}

function computeShipScore() {
  const job = getActiveJob();
  const type = job.deliverableType;
  if (!type || !SHIP_CHECKLISTS[type]) { renderShipScore(0, null); return; }
  const items = SHIP_CHECKLISTS[type];
  const state = (job.shipCheckState[type] || { checked: {} }).checked;
  let total = 0, got = 0;
  items.forEach(([id, , weight]) => { total += weight; if (state[id]) got += weight; });
  const pct = total ? Math.round((got / total) * 100) : 0;
  renderShipScore(pct, type);
}

function renderShipScore(pct, type) {
  const ring = document.getElementById("shipScoreRing");
  const num = document.getElementById("shipScoreNum");
  const verdict = document.getElementById("shipVerdict");
  const sub = document.getElementById("shipVerdictSub");
  if (!type) {
    ring.style.setProperty("--pct", 0);
    num.textContent = "—";
    verdict.textContent = "No deliverable selected yet";
    verdict.className = "verdict";
    sub.textContent = "Choose a type and check off what's actually true.";
    return;
  }
  ring.style.setProperty("--pct", pct);
  num.textContent = pct + "%";
  verdict.className = "verdict";
  if (pct >= 85) {
    verdict.textContent = "Ship it";
    verdict.classList.add("is-pass");
    sub.textContent = "This clears the bar for a " + SHIP_TYPE_LABELS[type] + " — send it live.";
  } else if (pct >= 60) {
    verdict.textContent = "Minor revisions";
    verdict.classList.add("is-minor");
    sub.textContent = "Close, but flag the unchecked items back to the agent first.";
  } else {
    verdict.textContent = "Needs real revision";
    verdict.classList.add("is-revise");
    sub.textContent = "Too much missing to ship as-is — send it back with specifics.";
  }
}

function populateShipForm() {
  const job = getActiveJob();
  document.getElementById("shipType").value = job.deliverableType || "";
  renderShipChecklist();
}

function shipSummaryText(job) {
  const type = job.deliverableType;
  if (!type || !SHIP_CHECKLISTS[type]) return "";
  const state = (job.shipCheckState[type] || { checked: {} }).checked;
  const lines = [
    "ShipCheck — " + SHIP_TYPE_LABELS[type],
    "Score: " + document.getElementById("shipScoreNum").textContent + " — " + document.getElementById("shipVerdict").textContent,
    "",
  ];
  SHIP_CHECKLISTS[type].forEach(([id, text]) => lines.push((state[id] ? "✓" : "✗") + " " + text));
  return lines.join("\n");
}

function saveShip() {
  const job = getActiveJob();
  const type = job.deliverableType;
  if (!type || !SHIP_CHECKLISTS[type]) { showToast("Choose a deliverable and check some items first"); return; }
  const state = job.shipCheckState[type] || { checked: {} };
  addSaved("ship", {
    title: SHIP_TYPE_LABELS[type] + " check",
    deliverableType: type,
    checked: Object.assign({}, state.checked),
    score: document.getElementById("shipScoreNum").textContent,
    verdict: document.getElementById("shipVerdict").textContent,
  });
  renderShipSavedList();
  showToast("ShipCheck saved");
}

function openSavedShip(entry) {
  const job = getActiveJob();
  job.deliverableType = entry.deliverableType;
  job.shipCheckState[entry.deliverableType] = { checked: Object.assign({}, entry.checked) };
  touchJob(job);
  populateShipForm();
  renderJobbars();
  showToast("Loaded into current job");
}

function renderShipSavedList() {
  renderSavedList("ship", "shipSavedList", "shipSavedCount",
    (e) => e.score + " · " + e.verdict,
    openSavedShip, renderShipSavedList);
}

function initShip() {
  document.getElementById("shipType").addEventListener("change", (e) => {
    const job = getActiveJob();
    job.deliverableType = e.target.value;
    touchJob(job);
    renderShipChecklist();
    renderJobbars();
  });
  document.getElementById("shipSaveBtn").addEventListener("click", saveShip);
  document.getElementById("shipCopyBtn").addEventListener("click", () => {
    const text = shipSummaryText(getActiveJob());
    if (!text) { showToast("Choose a deliverable first"); return; }
    copyToClipboard(text);
  });
}

/* ================= GOLIVE ================= */
/* Platform-specific publish checklists + a live progress tracker. */

const GOLIVE_STEPS = {
  cms: [
    "Create or duplicate the page/post in your CMS",
    "Paste in the copy and format headings/paragraphs",
    "Add and compress any images (with alt text)",
    "Set the page's SEO title and meta description",
    "Check how it looks on a mobile preview",
    "Set the URL slug/permalink",
    "Publish or schedule",
    "Load the live URL once and click every link/button yourself",
  ],
  email: [
    "Create a new campaign/broadcast (or add to an automation)",
    "Paste in the subject line and body copy",
    "Check that all merge tags render correctly in a preview",
    "Set the sender name and reply-to address",
    "Send yourself a test email and check it on mobile",
    "Confirm the list/segment is correct before sending",
    "Schedule or send",
    "Check the unsubscribe/compliance footer is present",
  ],
  "meta-ads": [
    "Create the campaign with the right objective",
    "Set up ad set targeting and budget",
    "Upload creative and paste in ad copy for each variant",
    "Add the destination URL and confirm it's tracked (UTM/pixel)",
    "Preview each placement (feed, stories, reels)",
    "Submit for review",
    "Confirm the ad is approved and delivering",
    "Check spend/results after the first 24–48 hours",
  ],
  amazon: [
    "Open the listing (or create a new one)",
    "Paste in the title, bullet points and description",
    "Upload/update product images per Amazon's spec",
    "Update backend search terms/keywords",
    "Confirm pricing and inventory are correct",
    "Preview the live listing page",
    "Save and publish the changes",
    "Check the listing appears correctly in search once it indexes",
  ],
  social: [
    "Create a new post/queue entry for each piece of content",
    "Paste in captions and add relevant hashtags/mentions",
    "Upload the matching image/video for each post",
    "Set the posting time/schedule",
    "Preview how each post will look on each platform",
    "Confirm tagged accounts/links are correct",
    "Schedule or publish",
    "Check the post went out correctly once it's live",
  ],
  shopify: [
    "Open the product/page editor",
    "Paste in the copy and format it",
    "Upload and order product images",
    "Set price, SKU and inventory",
    "Set the SEO title and meta description",
    "Preview on mobile",
    "Publish / make visible",
    "Load the live page and test the buy flow yourself",
  ],
  other: [
    "Confirm exactly where this needs to go live",
    "Paste in and format the content",
    "Add/replace any images or media needed",
    "Proofread once more in its final destination",
    "Get a second pair of eyes if this is client-facing",
    "Publish or send",
    "Confirm it's actually live/visible where it should be",
    "Note the live link/location somewhere you'll remember",
  ],
};

const GOLIVE_PLATFORM_LABELS = {
  cms: "WordPress / CMS", email: "Email Platform", "meta-ads": "Meta Ads Manager",
  amazon: "Amazon Seller Central", social: "Social Scheduler", shopify: "Shopify / Ecommerce Store", other: "Generic / Other",
};

function renderGoliveChecklist() {
  const job = getActiveJob();
  const platform = job.golivePlatform;
  const wrap = document.getElementById("goliveChecklist");
  if (!platform || !GOLIVE_STEPS[platform]) {
    wrap.innerHTML = '<p class="empty-hint">Choose a platform above to load its checklist.</p>';
    renderGoliveProgress(0, 0);
    return;
  }
  if (!job.goLiveState[platform]) job.goLiveState[platform] = { checked: {} };
  const state = job.goLiveState[platform].checked;
  const steps = GOLIVE_STEPS[platform];
  wrap.innerHTML = steps.map((text, i) => {
    const checked = !!state[i];
    return '<label class="checklist-item"><input type="checkbox" data-step="' + i + '"' +
      (checked ? " checked" : "") + ' /><span>' + escapeHtml(text) + '</span></label>';
  }).join("");
  wrap.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const j = getActiveJob();
      j.goLiveState[platform].checked[cb.dataset.step] = cb.checked;
      touchJob(j);
      computeGoliveProgress();
    });
  });
  computeGoliveProgress();
}

function computeGoliveProgress() {
  const job = getActiveJob();
  const platform = job.golivePlatform;
  if (!platform || !GOLIVE_STEPS[platform]) { renderGoliveProgress(0, 0); return; }
  const steps = GOLIVE_STEPS[platform];
  const state = (job.goLiveState[platform] || { checked: {} }).checked;
  let done = 0;
  steps.forEach((_, i) => { if (state[i]) done++; });
  renderGoliveProgress(done, steps.length);
}

function renderGoliveProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("goliveProgressFill").style.width = pct + "%";
  document.getElementById("goliveProgressLabel").textContent =
    done + " of " + total + " steps complete" + (total && done === total ? " — live!" : "");
}

function populateGoliveForm() {
  const job = getActiveJob();
  document.getElementById("golivePlatform").value = job.golivePlatform || "";
  renderGoliveChecklist();
}

function goliveSummaryText(job) {
  const platform = job.golivePlatform;
  if (!platform || !GOLIVE_STEPS[platform]) return "";
  const steps = GOLIVE_STEPS[platform];
  const state = (job.goLiveState[platform] || { checked: {} }).checked;
  let done = 0;
  steps.forEach((_, i) => { if (state[i]) done++; });
  const lines = [
    "GoLive — " + GOLIVE_PLATFORM_LABELS[platform],
    "Progress: " + done + " of " + steps.length + " steps complete",
    "",
  ];
  steps.forEach((text, i) => lines.push((state[i] ? "✓" : "○") + " " + text));
  return lines.join("\n");
}

function saveGolive() {
  const job = getActiveJob();
  const platform = job.golivePlatform;
  if (!platform || !GOLIVE_STEPS[platform]) { showToast("Choose a platform and check some steps first"); return; }
  const steps = GOLIVE_STEPS[platform];
  const state = job.goLiveState[platform] || { checked: {} };
  let done = 0;
  steps.forEach((_, i) => { if (state.checked[i]) done++; });
  addSaved("golive", {
    title: GOLIVE_PLATFORM_LABELS[platform] + " launch",
    platform, checked: Object.assign({}, state.checked), done, total: steps.length,
  });
  renderGoliveSavedList();
  showToast("GoLive checklist saved");
}

function openSavedGolive(entry) {
  const job = getActiveJob();
  job.golivePlatform = entry.platform;
  job.goLiveState[entry.platform] = { checked: Object.assign({}, entry.checked) };
  touchJob(job);
  populateGoliveForm();
  renderJobbars();
  showToast("Loaded into current job");
}

function renderGoliveSavedList() {
  renderSavedList("golive", "goliveSavedList", "goliveSavedCount",
    (e) => e.done + "/" + e.total + " steps",
    openSavedGolive, renderGoliveSavedList);
}

function initGolive() {
  document.getElementById("golivePlatform").addEventListener("change", (e) => {
    const job = getActiveJob();
    job.golivePlatform = e.target.value;
    touchJob(job);
    renderGoliveChecklist();
    renderJobbars();
  });
  document.getElementById("goliveSaveBtn").addEventListener("click", saveGolive);
  document.getElementById("goliveCopyBtn").addEventListener("click", () => {
    const text = goliveSummaryText(getActiveJob());
    if (!text) { showToast("Choose a platform first"); return; }
    copyToClipboard(text);
  });
}

/* ================= RATECARD ================= */
/* Base rate × market multiplier × complexity multiplier × rush surcharge. */

const RATE_BASE = {
  "landing-page": { low: 350, high: 900, label: "Landing Page Build" },
  "email-sequence": { low: 250, high: 650, label: "Email Sequence" },
  "ad-set": { low: 300, high: 800, label: "Ad Campaign Setup" },
  "social-content": { low: 200, high: 550, label: "Social Content Package" },
  "product-copy": { low: 150, high: 400, label: "Product / Listing Copy Batch" },
  "full-funnel": { low: 800, high: 2200, label: "Full Funnel Build" },
};
const MARKET_MULT = { premium: 1.15, standard: 1.0, emerging: 0.75 };
const MARKET_LABELS = { premium: "a premium-market", standard: "a standard-market", emerging: "a budget-conscious-market" };
const COMPLEXITY_MULT = { basic: 0.8, standard: 1.0, complex: 1.4 };
const COMPLEXITY_LABELS = { basic: "basic", standard: "standard", complex: "complex" };

function roundNice(n) { return Math.round(n / 5) * 5; }

function calculateRate() {
  const job = getActiveJob();
  job.serviceType = document.getElementById("rateService").value;
  job.market = document.getElementById("rateMarket").value;
  job.complexity = document.getElementById("rateComplexity").value;
  job.rush = document.getElementById("rateRush").checked;

  const base = RATE_BASE[job.serviceType];
  const marketMult = MARKET_MULT[job.market];
  const complexityMult = COMPLEXITY_MULT[job.complexity];
  const rushMult = job.rush ? 1.2 : 1;

  const low = roundNice(base.low * marketMult * complexityMult * rushMult);
  const high = roundNice(base.high * marketMult * complexityMult * rushMult);

  const quoteLine = "For a " + base.label.toLowerCase() + " at " + COMPLEXITY_LABELS[job.complexity] + " complexity for " +
    MARKET_LABELS[job.market] + " client" + (job.rush ? ", with rush turnaround," : ",") +
    " a fair market range is $" + low + "–$" + high + ".";

  job.rateCardResult = { low, high, quoteLine };
  touchJob(job);
  renderRateOutput(job);
  renderJobbars();
}

function renderRateOutput(job) {
  const rangeEl = document.getElementById("rateRange");
  const lineEl = document.getElementById("rateQuoteLine");
  if (job.rateCardResult) {
    rangeEl.innerHTML = "$" + job.rateCardResult.low + "–$" + job.rateCardResult.high + '<span class="unit">per job</span>';
    lineEl.textContent = job.rateCardResult.quoteLine;
  } else {
    rangeEl.textContent = "—";
    lineEl.textContent = "Fill in the form and click Calculate Rate to get a suggested price range and a copy-ready quote line.";
  }
}

function populateRateForm() {
  const job = getActiveJob();
  // Prefill from the deliverable type set earlier in ShipCheck, if this job hasn't set its own service type yet.
  let service = job.serviceType;
  if (!service && job.deliverableType && RATE_BASE[job.deliverableType]) service = job.deliverableType;
  document.getElementById("rateService").value = service || "landing-page";
  document.getElementById("rateMarket").value = job.market || "standard";
  document.getElementById("rateComplexity").value = job.complexity || "standard";
  document.getElementById("rateRush").checked = !!job.rush;
  renderRateOutput(job);
}

function saveRate() {
  const job = getActiveJob();
  if (!job.rateCardResult) { showToast("Calculate a rate first"); return; }
  addSaved("rate", {
    title: RATE_BASE[job.serviceType].label + " quote",
    serviceType: job.serviceType, market: job.market, complexity: job.complexity, rush: job.rush,
    result: job.rateCardResult,
  });
  renderRateSavedList();
  showToast("Quote saved");
}

function openSavedRate(entry) {
  const job = getActiveJob();
  job.serviceType = entry.serviceType;
  job.market = entry.market;
  job.complexity = entry.complexity;
  job.rush = entry.rush;
  job.rateCardResult = entry.result;
  touchJob(job);
  populateRateForm();
  renderJobbars();
  showToast("Loaded into current job");
}

function renderRateSavedList() {
  renderSavedList("rate", "rateSavedList", "rateSavedCount",
    (e) => "$" + e.result.low + "–$" + e.result.high,
    openSavedRate, renderRateSavedList);
}

function initRate() {
  document.getElementById("rateCalcBtn").addEventListener("click", calculateRate);
  document.getElementById("rateCopyBtn").addEventListener("click", () => {
    const job = getActiveJob();
    if (!job.rateCardResult) { showToast("Calculate a rate first"); return; }
    copyToClipboard(job.rateCardResult.quoteLine);
  });
  document.getElementById("rateSaveBtn").addEventListener("click", saveRate);
}

/* ================= BOOT ================= */

document.addEventListener("DOMContentLoaded", () => {
  initGate();
  initTheme();
  initTabs();
  ensureActiveJob();
  initBrief();
  initShip();
  initGolive();
  initRate();
  renderAll();
  renderAllSavedLists();
});
