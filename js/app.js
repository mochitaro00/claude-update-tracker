// ============================================
// Claude Update Tracker - Main Application
// ============================================

import { SearchEngine } from "./search.js";
import { FilterEngine } from "./filters.js";

// --- i18n ---
const I18N = {
  ja: {
    groups: {
      cli: "CLI", desktop: "デスクトップ", web: "Web版",
      mobile: "モバイル", api: "API", model: "モデル",
    },
    desktopSubs: { chat: "チャット", cowork: "Cowork", "claude-code": "Claude Code" },
    categories: {
      "model-release": "モデルリリース", feature: "新機能", improvement: "改善",
      deprecation: "非推奨・廃止", pricing: "料金変更", sdk: "SDK・ツール", infrastructure: "インフラ",
    },
    sources: { platform: "API Platform", apps: "Claude Apps", code: "Claude Code", blog: "Blog" },
    ui: {
      searchPlaceholder: "キーワードで検索（例: extended thinking, Claude Code, ボイス）",
      filterPlatform: "プラットフォーム",
      filterCategory: "種別",
      clearFilters: "フィルタをクリア",
      headerMeta: (last, total) => `最終更新: ${last} / 全${total}件`,
      resultsFiltered: (count, total) => `<strong>${count}件</strong> / 全${total}件`,
      resultsAll: (total) => `全 <strong>${total}件</strong>`,
      newBadge: "NEW",
      newHeader: "最新のアップデート",
      newCount: (n) => `${n}件`,
      emptyState: "該当するアップデートが見つかりませんでした",
      loadingText: "データを読み込んでいます...",
      loadingError: "データの読み込みに失敗しました",
      openSource: "公式ソースを開く",
      footerHint: "カードをクリックすると詳細が表示されます",
      footerDataSource: "データソース:",
      loadMore: (remaining) => `さらに表示（残り${remaining}件）`,
      monthLabel: (y, m) => `${y}年${m}月`,
      pageInfo: (shown, total) => `${shown}件 / ${total}件 を表示中`,
    },
  },
  en: {
    groups: {
      cli: "CLI", desktop: "Desktop", web: "Web",
      mobile: "Mobile", api: "API", model: "Model",
    },
    desktopSubs: { chat: "Chat", cowork: "Cowork", "claude-code": "Claude Code" },
    categories: {
      "model-release": "Model Release", feature: "New Feature", improvement: "Improvement",
      deprecation: "Deprecation", pricing: "Pricing", sdk: "SDK / Tools", infrastructure: "Infrastructure",
    },
    sources: { platform: "API Platform", apps: "Claude Apps", code: "Claude Code", blog: "Blog" },
    ui: {
      searchPlaceholder: "Search by keyword (e.g. extended thinking, Claude Code, voice)",
      filterPlatform: "Platform",
      filterCategory: "Category",
      clearFilters: "Clear Filters",
      headerMeta: (last, total) => `Last updated: ${last} / ${total} total`,
      resultsFiltered: (count, total) => `<strong>${count}</strong> / ${total} total`,
      resultsAll: (total) => `<strong>${total}</strong> total`,
      newBadge: "NEW",
      newHeader: "Latest Updates",
      newCount: (n) => `${n} items`,
      emptyState: "No matching updates found",
      loadingText: "Loading data...",
      loadingError: "Failed to load data",
      openSource: "View official source",
      footerHint: "Click a card to see details",
      footerDataSource: "Data sources:",
      loadMore: (remaining) => `Show more (${remaining} remaining)`,
      monthLabel: (y, m) => {
        const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${months[m]} ${y}`;
      },
      pageInfo: (shown, total) => `Showing ${shown} of ${total}`,
    },
  },
};

let currentLang = localStorage.getItem("claude-tracker-lang") || "ja";
function t() { return I18N[currentLang]; }

// --- Platform Group Hierarchy ---
const GROUPS = {
  cli: { color: "cli" },
  desktop: { color: "desktop" },
  web: { color: "web" },
  mobile: { color: "mobile" },
  api: { color: "api" },
  model: { color: "model" },
};

const DESKTOP_SUBS = {
  chat: {},
  cowork: {},
  "claude-code": {},
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
    $(".header-meta").textContent = t().ui.headerMeta(lastUpdated, allUpdates.length);

    search.buildIndex(allUpdates);

    // Set initial i18n text
    $("#search-input").placeholder = t().ui.searchPlaceholder;
    $(".clear-filters").textContent = t().ui.clearFilters;
    const filterLabels = $$(".filter-label");
    filterLabels[0].textContent = t().ui.filterPlatform;
    filterLabels[1].textContent = t().ui.filterCategory;
    $(".loading p").textContent = t().ui.loadingText;

    renderGroupChips();
    renderCategoryChips();
    renderLangSwitch();
    restoreFromHash();
    render();

    $(".loading").style.display = "none";
  } catch (err) {
    $(".loading").innerHTML = `<p>${t().ui.loadingError}</p><p style="font-size:0.78rem;margin-top:0.5rem;color:#999">${err.message}</p>`;
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

  for (const [key] of Object.entries(GROUPS)) {
    if (!groupCounts[key]) continue;

    const chip = document.createElement("button");
    chip.className = "chip";
    chip.dataset.group = key;
    chip.innerHTML = `${t().groups[key]} <span class="chip-count">${groupCounts[key]}</span>`;
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

      for (const [subKey] of Object.entries(DESKTOP_SUBS)) {
        if (!subCounts[subKey]) continue;
        const subChip = document.createElement("button");
        subChip.className = "chip";
        subChip.dataset.sub = subKey;
        subChip.innerHTML = `${t().desktopSubs[subKey]} <span class="chip-count">${subCounts[subKey]}</span>`;
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

  for (const key of Object.keys(t().categories)) {
    if (!counts[key]) continue;
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.dataset.category = key;
    chip.innerHTML = `${t().categories[key]} <span class="chip-count">${counts[key]}</span>`;
    chip.addEventListener("click", () => {
      const active = filters.toggleCategory(key);
      chip.classList.toggle("active", active);
      updateHash();
      render();
    });
    container.appendChild(chip);
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
    ? t().ui.resultsFiltered(filtered.length, allUpdates.length)
    : t().ui.resultsAll(allUpdates.length);

  $(".clear-filters").classList.toggle("visible", isFiltered);

  const timeline = $(".timeline");
  timeline.innerHTML = "";

  if (filtered.length === 0) {
    timeline.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#x1F50D;</div>
        <p>${t().ui.emptyState}</p>
      </div>`;
    return;
  }

  // Split recent updates (within 48h of lastUpdated) from the rest
  const recentUpdates = filtered.filter((u) => isRecent(u.date, lastUpdated));
  const restUpdates = filtered.filter((u) => !isRecent(u.date, lastUpdated));

  // Pagination: slice restUpdates
  const totalRest = restUpdates.length;
  const visibleRest = restUpdates.slice(0, currentPage * PAGE_SIZE);
  const totalShown = recentUpdates.length + visibleRest.length;
  const totalAll = filtered.length;

  // Render NEW section
  if (recentUpdates.length > 0) {
    const newSection = document.createElement("div");
    newSection.className = "today-section";

    const newHeader = document.createElement("div");
    newHeader.className = "today-header";
    newHeader.innerHTML = `<span class="today-badge">${t().ui.newBadge}</span> ${t().ui.newHeader} <span class="today-count">${t().ui.newCount(recentUpdates.length)}</span>`;
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
  const remaining = totalRest - visibleRest.length;
  if (remaining > 0) {
    const paginationDiv = document.createElement("div");
    paginationDiv.className = "pagination";

    const info = document.createElement("span");
    info.className = "pagination-info";
    info.textContent = t().ui.pageInfo(totalShown, totalAll);

    const btn = document.createElement("button");
    btn.className = "load-more-btn";
    btn.textContent = t().ui.loadMore(remaining);
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

  // In EN mode, swap primary/secondary titles
  const primaryTitle = currentLang === "en" && update.titleEn ? update.titleEn : update.title;
  const secondaryTitle = currentLang === "en" ? update.title : (update.titleEn || "");

  const titleHtml = query
    ? search.highlight(primaryTitle, query)
    : escapeHtml(primaryTitle);
  const titleEnHtml = secondaryTitle && query
    ? search.highlight(secondaryTitle, query)
    : escapeHtml(secondaryTitle);
  const descHtml = query
    ? search.highlight(update.description, query)
    : escapeHtml(update.description);

  // Group badges
  const groupBadges = update._mapped.groups
    .map(
      (g) =>
        `<span class="group-badge" data-group="${g}">${t().groups[g] || g}</span>`
    )
    .join("");

  // Add sub badges for desktop
  const subBadges = update._mapped.subs
    .map(
      (s) =>
        `<span class="group-badge" data-group="desktop">${t().desktopSubs[s] || s}</span>`
    )
    .join("");

  const dateStr = formatDate(update.date);
  const categoryLabel = t().categories[update.category] || update.category;
  const sourceLabel = t().sources[update.source] || update.source;

  card.innerHTML = `
    <div class="card-top">
      <span class="card-date">${dateStr}</span>
      <span class="card-category" data-category="${update.category}">${categoryLabel}</span>
      <span class="card-source">${sourceLabel}</span>
    </div>
    <div class="card-title">${titleHtml}</div>
    ${titleEnHtml ? `<div class="card-title-en">${titleEnHtml}</div>` : ""}
    <div class="card-description">${descHtml}
      ${update.link ? `<br><a class="card-link" href="${escapeHtml(update.link)}" target="_blank" rel="noopener">${t().ui.openSource} &rarr;</a>` : ""}
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
    const key = t().ui.monthLabel(d.getFullYear(), d.getMonth() + 1);
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

  if (params.has("q")) {
    $("#search-input").value = params.get("q");
  }
}

// --- Language Switch ---
function renderLangSwitch() {
  const container = $(".header-inner");
  const sw = document.createElement("div");
  sw.className = "lang-switch";
  sw.innerHTML = `<button class="lang-btn${currentLang === "ja" ? " active" : ""}" data-lang="ja">JA</button><button class="lang-btn${currentLang === "en" ? " active" : ""}" data-lang="en">EN</button>`;
  container.appendChild(sw);

  for (const btn of sw.querySelectorAll(".lang-btn")) {
    btn.addEventListener("click", () => {
      currentLang = btn.dataset.lang;
      localStorage.setItem("claude-tracker-lang", currentLang);
      rebuildUI();
    });
  }
}

function rebuildUI() {
  // Update static text
  $(".header-meta").textContent = t().ui.headerMeta(lastUpdated, allUpdates.length);
  $("#search-input").placeholder = t().ui.searchPlaceholder;
  $(".clear-filters").textContent = t().ui.clearFilters;
  $$(".filter-label").forEach((el, i) => {
    el.textContent = i === 0 ? t().ui.filterPlatform : t().ui.filterCategory;
  });

  // Update footer
  $(".footer").querySelector("p:last-child").textContent = t().ui.footerHint;
  $(".footer").querySelector("p:first-child").innerHTML = `${t().ui.footerDataSource}
    <a href="https://docs.anthropic.com/en/release-notes/overview" target="_blank" rel="noopener">API Platform Release Notes</a> /
    <a href="https://support.claude.com/en/articles/12138966-release-notes" target="_blank" rel="noopener">Claude Apps Release Notes</a> /
    <a href="https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md" target="_blank" rel="noopener">Claude Code CHANGELOG</a>`;

  // Rebuild chips
  $("#group-chips").innerHTML = "";
  $("#category-chips").innerHTML = "";
  renderGroupChips();
  renderCategoryChips();

  // Restore active states
  const state = filters.getState();
  for (const chip of $$("#group-chips .chip[data-group]")) {
    chip.classList.toggle("active", state.groups.includes(chip.dataset.group));
    if (chip.dataset.group === "desktop" && state.groups.includes("desktop")) {
      $(".filter-sub-group")?.classList.add("visible");
    }
  }
  for (const chip of $$("#desktop-sub-chips .chip")) {
    chip.classList.toggle("active", state.subs.includes(chip.dataset.sub));
  }
  for (const chip of $$("#category-chips .chip")) {
    chip.classList.toggle("active", state.categories.includes(chip.dataset.category));
  }

  // Update lang switch
  for (const btn of $$(".lang-btn")) {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  }

  render(false);
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
