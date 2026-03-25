// ============================================
// Claude Update Tracker - Hierarchical Filters
// ============================================

export class FilterEngine {
  constructor() {
    this.activeGroups = new Set();
    this.activeSubs = new Set(); // Desktop sub-filters
    this.activeCategories = new Set();
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

  clearSubs() {
    this.activeSubs.clear();
  }

  clearAll() {
    this.activeGroups.clear();
    this.activeSubs.clear();
    this.activeCategories.clear();
  }

  hasActiveFilters() {
    return (
      this.activeGroups.size > 0 ||
      this.activeSubs.size > 0 ||
      this.activeCategories.size > 0
    );
  }

  /**
   * Apply hierarchical filters:
   * - Groups: OR within groups (show if update belongs to ANY selected group)
   * - Subs: If desktop is selected AND subs are active, further narrow to those subs
   * - Categories: AND with groups (must match both group AND category)
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
          // If the update is in the "desktop" group, check sub-match
          // But only filter out if no other selected group matches
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

      return true;
    });
  }

  getState() {
    return {
      groups: [...this.activeGroups],
      subs: [...this.activeSubs],
      categories: [...this.activeCategories],
    };
  }

  setState(state) {
    this.activeGroups = new Set(state.groups || []);
    this.activeSubs = new Set(state.subs || []);
    this.activeCategories = new Set(state.categories || []);
  }
}
