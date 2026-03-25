// ============================================
// Claude Update Tracker - Search Engine
// ============================================

export class SearchEngine {
  constructor() {
    this.index = [];
  }

  /**
   * Build search index from updates
   * @param {Array} updates
   */
  buildIndex(updates) {
    this.index = updates.map((update) => ({
      id: update.id,
      text: [
        update.title,
        update.titleEn || "",
        update.description,
        (update.tags || []).join(" "),
      ]
        .join(" ")
        .toLowerCase(),
    }));
  }

  /**
   * Search updates by query string
   * @param {string} query - Space-separated search terms (AND logic)
   * @returns {Set<string>} Set of matching update IDs
   */
  search(query) {
    if (!query.trim()) return null; // null = no filter

    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    const matchingIds = new Set();

    for (const entry of this.index) {
      const allMatch = terms.every((term) => entry.text.includes(term));
      if (allMatch) {
        matchingIds.add(entry.id);
      }
    }

    return matchingIds;
  }

  /**
   * Highlight matching terms in text
   * @param {string} text
   * @param {string} query
   * @returns {string} HTML with <mark> tags
   */
  highlight(text, query) {
    if (!query.trim()) return escapeHtml(text);

    const terms = query
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

    if (terms.length === 0) return escapeHtml(text);

    const escaped = escapeHtml(text);
    const regex = new RegExp(`(${terms.join("|")})`, "gi");
    return escaped.replace(regex, "<mark>$1</mark>");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
