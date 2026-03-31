// ============================================
// Claude Update Tracker - Hierarchical Filters
// ============================================

export class FilterEngine {
  constructor() {
    this.activeGroups = new Set();
    this.activeSubs = new Set(); // Desktop sub-filters
    this.activeCategories = new Set();
    this.activeOS = null; // "mac" | "windows" | null
  }

  toggleGroup(group) {
    if (this.activeGroups.has(group)) {
      this.activeGroups.delete(group);
      return false;
    } else {
      this.activeGroups.add(group);
      return true;
    }
  }

  toggleSub(sub) {
    if (this.activeSubs.has(sub)) {
      this.activeSubs.delete(sub);
      return false;
    } else {
      this.activeSubs.add(sub);
      return true;
    }
  }

  toggleCategory(category) {
    if (this.activeCategories.has(category)) {
      this.activeCategories.delete(category);
      return false;
    } else {
      this.activeCategories.add(category);
      return true;
    }
  }

  toggleOS(os) {
    if (this.activeOS === os) {
      this.activeOS = null;
      return false;
    } else {
      this.activeOS = os;
      return true;
    }
  }

  clearSubs() {
    this.activeSubs.clear();
  }

  clearAll() {
    this.activeGroups.clear();
    this.activeSubs.clear();
    this.activeCategories.clear();
    this.activeOS = null;
  }

  hasActiveFilters() {
    return (
      this.activeGroups.size > 0 ||
      this.activeSubs.size > 0 ||
      this.activeCategories.size > 0 ||
      this.activeOS !== null
    );
  }

  /**
   * Apply hierarchical filters:
   * - Groups: OR within groups (show if update belongs to ANY selected group)
   * - Subs: If desktop is selected AND subs are active, further narrow to those subs
   * - Categories: AND with groups (must match both group AND category)
   * - OS: Show selected OS + OS-agnostic entries
   */
  apply(updates, searchIds = null) {
    return updates.filter((update) => {
      // Search filter
      if (searchIds !== null && !searchIds.has(update.id)) {
        return false;
      }

      // Group filter (OR within groups)
      if (this.activeGroups.size > 0) {
        const mapped = update._mapped;
        const hasMatchingGroup = mapped.groups.some((g) =>
          this.activeGroups.has(g)
        );
        if (!hasMatchingGroup) return false;

        // Sub-filter: only apply when desktop is selected AND subs are active
        if (
          this.activeGroups.has("desktop") &&
          this.activeSubs.size > 0 &&
          mapped.groups.includes("desktop")
        ) {
          const matchesOtherGroup = mapped.groups.some(
            (g) => g !== "desktop" && this.activeGroups.has(g)
          );
          if (!matchesOtherGroup) {
            const hasMatchingSub = mapped.subs.some((s) =>
              this.activeSubs.has(s)
            );
            if (!hasMatchingSub) return false;
          }
        }
      }

      // Category filter (OR within categories)
      if (this.activeCategories.size > 0) {
        if (!this.activeCategories.has(update.category)) return false;
      }

      // OS filter: show selected OS entries + OS-agnostic (no os field)
      if (this.activeOS !== null) {
        const updateOS = update.os || []; // empty = OS-agnostic
        if (updateOS.length > 0 && !updateOS.includes(this.activeOS)) {
          return false;
        }
      }

      return true;
    });
  }

  getState() {
    return {
      groups: [...this.activeGroups],
      subs: [...this.activeSubs],
      categories: [...this.activeCategories],
      os: this.activeOS,
    };
  }

  setState(state) {
    this.activeGroups = new Set(state.groups || []);
    this.activeSubs = new Set(state.subs || []);
    this.activeCategories = new Set(state.categories || []);
    this.activeOS = state.os || null;
  }
}
