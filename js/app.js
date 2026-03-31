// ============================================
// Claude Update Tracker - Main Application
// ============================================

import { SearchEngine } from "./search.js";
import { FilterEngine } from "./filters.js?v=2";

// --- Platform Group Hierarchy ---
const GROUPS = {
  cli: { label: "CLI", color: "cli" },
  desktop: { label: "デスクトップ", color: "desktop" },
  web: { label: "Web版", color: "web" },
  mobile: { label: "モバイル", color: "mobile" },
  api: { label: "API", color: "api" },
  model: { label: "モデル", color: "model" },
};

const DESKTOP_SUBS = {
  chat: { label: "チャット" },
  cowork: { label: "Cowork" },
  "claude-code": { label: "Claude Code" },
};

const CATEGORY_LABELS = {
  "model-release": "モデルリリース",
  feature: "新機能",
  improvement: "改善",
  deprecation: "非推奨・廃止",
  pricing: "料金変更",
  sdk: "SDK・ツール",
  infrastructure: "インフラ",
};

const SOURCE_LABELS = {
  platform: "API Platform",
  apps: "Claude Apps",
  code: "Claude Code",
  blog: "Blog",
};

// --- Pagination ---
const PAGE_SIZE = 20;

// --- Map old platform values to new groups ---
function getGroups(platforms) {
  const groups = new Set();
  const subs = new Set();

  for (const p of platforms) {
    switch (p) {
      case "claude-code-cli":
        groups.add("cli");
        break;
      case "claude-code-vscode":
        groups.add("desktop");
        subs.add("claude-code");
        break;
      case "claude-ai":
        groups.add("web");
        groups.add("desktop");
        subs.add("chat");
        break;
      case "desktop":
        groups.add("desktop");
        subs.add("chat");
        break;
      case "mobile":
        groups.add("mobile");
        break;
      case "api":
      case "console":
      case "bedrock":
      case "vertex":
        groups.add("api");
        break;
      case "model":
        groups.add("model");
        break;
    }
  }

  // Check for cowork tag
  return { groups: [...groups], subs: [...subs] };
}

// --- State ---
const search = new SearchEngine();
const filters = new FilterEngine();
let allUpdates = [];
let lastUpdated = "";
let debounceTimer = null;
let currentPage = 1;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// --- Initialize ---
async function init() {
  try {
    const res = await fetch("./data/updates.json");
    const data = await res.json();
    allUpdates = data.updates
      .map((u) => ({
        ...u,
        _mapped: getGroups(u.platforms),
        _isCowork: (u.tags || []).includes("cowork"),
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Mark cowork items
    for (const u of allUpdates) {
      if (u._isCowork) {
        u._mapped.subs.push("cowork");
      }
    }

    lastUpdated = data.meta.lastUpdated;
    $(".header-meta").textContent = `最終更新: ${lastUpdated} / 全${allUpdates.length}件`;

    search.buildIndex(allUpdates);
    renderGroupChips();
    renderCategoryChips();
    renderOSChips();
    restoreFromHash();
    render();

    $(".loading").style.display = "none";
  } catch (err) {
    $(".loading").innerHTML = `<p>データの読み込みに失敗しました</p><p style="font-size:0.78rem;margin-top:0.5rem;color:#999">${err.message}</p>`;
  }
}

// --- Render Group Chips (Hierarchical) ---
function renderGroupChips() {
  const container = $("#group-chips");

  // Count per group
  const groupCounts = {};
  const subCounts = {};
  for (const u of allUpdates) {
    for (const g of u._mapped.groups) {
      groupCounts[g] = (groupCounts[g] || 0) + 1;
    }
    for (const s of u._mapped.subs) {
      subCounts[s] = (subCounts[s] || 0) + 1;
    }
  }

  for (const [key, info] of Object.entries(GROUPS)) {
    if (!groupCounts[key]) continue;

    const chip = document.createElement("button");
    chip.className = "chip";
    chip.dataset.group = key;
    chip.innerHTML = `${info.label} <span class="chip-count">${groupCounts[key]}</span>`;
    chip.addEventListener("click", () => {
      const active = filters.toggleGroup(key);
      chip.classList.toggle("active", active);

      // Show/hide desktop sub-filters
      if (key === "desktop") {
        const subGroup = $(".filter-sub-group");
        subGroup.classList.toggle("visible", active);
        if (!active) {
          // Clear sub-filters when desktop is deselected
          filters.clearSubs();
          for (const subChip of $$("#desktop-sub-chips .chip")) {
            subChip.classList.remove("active");
          }
        }
      }

      updateHash();
      render();
    });
    container.appendChild(chip);

    // Insert desktop sub-group after desktop chip
    if (key === "desktop") {
      const subGroup = document.createElement("div");
      subGroup.className = "filter-sub-group";
      subGroup.id = "desktop-sub-chips";

      for (const [subKey, subInfo] of Object.entries(DESKTOP_SUBS)) {
        if (!subCounts[subKey]) continue;
        const subChip = document.createElement("button");
        subChip.className = "chip";
        subChip.dataset.sub = subKey;
        subChip.innerHTML = `${subInfo.label} <span class="chip-count">${subCounts[subKey]}</span>`;
        subChip.addEventListener("click", () => {
          const active = filters.toggleSub(subKey);
          subChip.classList.toggle("active", active);
          updateHash();
          render();
        });
        subGroup.appendChild(subChip);
      }

      container.appendChild(subGroup);
    }
  }
}

// --- Render Category Chips ---
function renderCategoryChips() {
  const container = $("#category-chips");
  const counts = {};
  for (const u of allUpdates) {
    counts[u.category] = (counts[u.category] || 0) + 1;
  }

  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    if (!counts[key]) continue;
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.dataset.category = key;
    chip.innerHTML = `${label} <span class="chip-count">${counts[key]}</span>`;
    chip.addEventListener("click", () => {
      const active = filters.toggleCategory(key);
      chip.classList.toggle("active", active);
      updateHash();
      render();
    });
    container.appendChild(chip);
  }
}

// --- Render OS Chips ---
const OS_LABELS = { mac: "Mac", windows: "Windows" };

function renderOSChips() {
  const container = $("#os-chips");
  const counts = { mac: 0, windows: 0 };

  for (const u of allUpdates) {
    const os = u.os || [];
    for (const o of os) {
      if (counts[o] !== undefined) counts[o]++;
    }
  }

  for (const [key, label] of Object.entries(OS_LABELS)) {
    const id = `os-${key}`;
    const wrapper = document.createElement("label");
    wrapper.className = "os-label";
    wrapper.htmlFor = id;

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "os-filter";
    input.id = id;
    input.className = "os-radio";
    input.dataset.os = key;
    input.addEventListener("click", () => {
      if (filters.activeOS === key) {
        // 同じものをクリック → 解除
        input.checked = false;
        filters.activeOS = null;
      } else {
        filters.activeOS = key;
      }
      updateHash();
      render();
    });

    const text = document.createTextNode(` ${label} `);
    const count = document.createElement("span");
    count.className = "os-count";
    count.textContent = counts[key];

    wrapper.appendChild(input);
    wrapper.appendChild(text);
    wrapper.appendChild(count);
    container.appendChild(wrapper);
  }
}

// --- Recent check: within last 48 hours from lastUpdated ---
function isRecent(dateStr, lastUpdated) {
  const update = new Date(dateStr);
  const base = new Date(lastUpdated);
  const diffMs = base - update;
  return diffMs >= 0 && diffMs <= 48 * 60 * 60 * 1000; // 48 hours
}

// --- Main Render ---
function render(resetPage = true) {
  if (resetPage) currentPage = 1;

  const query = $("#search-input").value;
  const searchIds = search.search(query);
  const filtered = filters.apply(allUpdates, searchIds);

  const isFiltered = searchIds !== null || filters.hasActiveFilters();
  $(".results-count").innerHTML = isFiltered
    ? `<strong>${filtered.length}件</strong> / 全${allUpdates.length}件`
    : `全 <strong>${allUpdates.length}件</strong>`;

  $(".clear-filters").classList.toggle("visible", isFiltered);

  const timeline = $(".timeline");
  timeline.innerHTML = "";

  if (filtered.length === 0) {
    timeline.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#x1F50D;</div>
        <p>該当するアップデートが見つかりませんでした</p>
      </div>`;
    return;
  }

  // Split recent updates (within 48h of lastUpdated) from the rest
  const recentUpdates = filtered.filter((u) => isRecent(u.date, lastUpdated));
  const restUpdates = filtered.filter((u) => !isRecent(u.date, lastUpdated));

  // Pagination: slice restUpdates
  const visibleRest = restUpdates.slice(0, currentPage * PAGE_SIZE);
  const totalShown = recentUpdates.length + visibleRest.length;
  const totalAll = filtered.length;

  // Render NEW section
  if (recentUpdates.length > 0) {
    const newSection = document.createElement("div");
    newSection.className = "today-section";

    const newHeader = document.createElement("div");
    newHeader.className = "today-header";
    newHeader.innerHTML = `<span class="today-badge">NEW</span> 最新のアップデート <span class="today-count">${recentUpdates.length}件</span>`;
    newSection.appendChild(newHeader);

    for (const update of recentUpdates) {
      newSection.appendChild(createCard(update, query));
    }

    timeline.appendChild(newSection);
  }

  // Render the rest grouped by month (paginated)
  const groups = groupByMonth(visibleRest);

  for (const [monthKey, updates] of groups) {
    const group = document.createElement("div");
    group.className = "month-group";

    const header = document.createElement("div");
    header.className = "month-header";
    header.textContent = monthKey;
    group.appendChild(header);

    for (const update of updates) {
      group.appendChild(createCard(update, query));
    }

    timeline.appendChild(group);
  }

  // Pagination controls
  const remaining = restUpdates.length - visibleRest.length;
  if (remaining > 0) {
    const paginationDiv = document.createElement("div");
    paginationDiv.className = "pagination";

    const info = document.createElement("span");
    info.className = "pagination-info";
    info.textContent = `${totalShown}件 / ${totalAll}件 を表示中`;

    const btn = document.createElement("button");
    btn.className = "load-more-btn";
    btn.textContent = `さらに表示（残り${remaining}件）`;
    btn.addEventListener("click", () => {
      currentPage++;
      render(false);
    });

    paginationDiv.appendChild(info);
    paginationDiv.appendChild(btn);
    timeline.appendChild(paginationDiv);
  }
}

// --- Create Update Card ---
function createCard(update, query) {
  const card = document.createElement("div");
  card.className = `update-card${update.importance === "major" ? " major" : ""}`;

  const titleHtml = query
    ? search.highlight(update.title, query)
    : escapeHtml(update.title);
  const titleEnHtml =
    update.titleEn && query
      ? search.highlight(update.titleEn, query)
      : escapeHtml(update.titleEn || "");
  const descHtml = query
    ? search.highlight(update.description, query)
    : escapeHtml(update.description);

  // Group badges
  const groupBadges = update._mapped.groups
    .map(
      (g) =>
        `<span class="group-badge" data-group="${g}">${GROUPS[g]?.label || g}</span>`
    )
    .join("");

  // Add sub badges for desktop
  const subBadges = update._mapped.subs
    .map(
      (s) =>
        `<span class="group-badge" data-group="desktop">${DESKTOP_SUBS[s]?.label || s}</span>`
    )
    .join("");

  const dateStr = formatDate(update.date);
  const categoryLabel = CATEGORY_LABELS[update.category] || update.category;
  const sourceLabel = SOURCE_LABELS[update.source] || update.source;

  card.innerHTML = `
    <div class="card-top">
      <span class="card-date">${dateStr}</span>
      <span class="card-category" data-category="${update.category}">${categoryLabel}</span>
      <span class="card-source">${sourceLabel}</span>
    </div>
    <div class="card-title">${titleHtml}</div>
    ${titleEnHtml ? `<div class="card-title-en">${titleEnHtml}</div>` : ""}
    <div class="card-description">${descHtml}
      ${update.link ? `<br><a class="card-link" href="${escapeHtml(update.link)}" target="_blank" rel="noopener">公式ソースを開く &rarr;</a>` : ""}
    </div>
    <div class="card-groups">${groupBadges}${subBadges}</div>
  `;

  card.addEventListener("click", (e) => {
    if (e.target.tagName === "A") return;
    card.classList.toggle("expanded");
  });

  return card;
}

// --- Helpers ---
function groupByMonth(updates) {
  const groups = new Map();
  for (const u of updates) {
    const d = new Date(u.date);
    const key = `${d.getFullYear()}年${d.getMonth() + 1}月`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(u);
  }
  return groups;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- URL Hash ---
function updateHash() {
  const params = new URLSearchParams();
  const state = filters.getState();
  const query = $("#search-input").value;

  if (state.groups.length) params.set("g", state.groups.join(","));
  if (state.subs.length) params.set("s", state.subs.join(","));
  if (state.categories.length) params.set("c", state.categories.join(","));
  if (state.os) params.set("os", state.os);
  if (query) params.set("q", query);

  const hash = params.toString();
  history.replaceState(null, "", hash ? `#${hash}` : window.location.pathname);
}

function restoreFromHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;

  const params = new URLSearchParams(hash);

  if (params.has("g")) {
    const groups = params.get("g").split(",");
    filters.setState({
      groups,
      subs: params.has("s") ? params.get("s").split(",") : [],
      categories: params.has("c") ? params.get("c").split(",") : [],
      os: params.get("os") || null,
    });
    for (const chip of $$("#group-chips .chip[data-group]")) {
      const isActive = groups.includes(chip.dataset.group);
      chip.classList.toggle("active", isActive);
      if (chip.dataset.group === "desktop" && isActive) {
        $(".filter-sub-group")?.classList.add("visible");
      }
    }
  }

  if (params.has("s")) {
    const subs = params.get("s").split(",");
    for (const chip of $$("#desktop-sub-chips .chip")) {
      chip.classList.toggle("active", subs.includes(chip.dataset.sub));
    }
  }

  if (params.has("c")) {
    const categories = params.get("c").split(",");
    for (const chip of $$("#category-chips .chip")) {
      chip.classList.toggle("active", categories.includes(chip.dataset.category));
    }
  }

  if (params.has("os")) {
    const os = params.get("os");
    for (const cb of $$("#os-chips .os-radio")) {
      cb.checked = cb.dataset.os === os;
    }
  }

  if (params.has("q")) {
    $("#search-input").value = params.get("q");
  }
}

// --- Event Listeners ---
document.addEventListener("DOMContentLoaded", () => {
  init();

  $("#search-input").addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateHash();
      render();
    }, 300);
  });

  $(".clear-filters").addEventListener("click", () => {
    filters.clearAll();
    $("#search-input").value = "";
    for (const chip of $$(".chip")) {
      chip.classList.remove("active");
    }
    $(".filter-sub-group")?.classList.remove("visible");
    updateHash();
    render();
  });
});
