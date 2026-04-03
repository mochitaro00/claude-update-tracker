// ============================================
// X Buzz Page - Claude関連の話題ポスト（公式埋め込み）
// ============================================

export class XBuzzPage {
  constructor() {
    this.posts = [];
    this.allTags = [];
    this.activeTag = null; // single select
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      await this.loadWidgetsScript();

      const res = await fetch("./data/x-buzz.json");
      const data = await res.json();
      this.posts = data.posts.sort((a, b) => new Date(b.date) - new Date(a.date));
      this.collectTags();
      this.renderFilters();
      await this.render();
      this.initialized = true;

      document.querySelector(".x-buzz-loading").style.display = "none";
    } catch (err) {
      document.querySelector(".x-buzz-loading").innerHTML =
        `<p>データの読み込みに失敗しました</p><p style="font-size:0.78rem;margin-top:0.5rem;color:#999">${err.message}</p>`;
    }
  }

  loadWidgetsScript() {
    return new Promise((resolve) => {
      if (window.twttr && window.twttr.widgets) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      script.onload = () => {
        const check = () => {
          if (window.twttr && window.twttr.widgets) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      };
      document.head.appendChild(script);
    });
  }

  collectTags() {
    const tagSet = new Set();
    for (const post of this.posts) {
      for (const tag of post.tags || []) {
        tagSet.add(tag);
      }
    }
    this.allTags = [...tagSet].sort();
  }

  renderFilters() {
    const container = document.getElementById("x-buzz-filters");
    container.innerHTML = "";

    for (const tag of this.allTags) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = tag;
      chip.addEventListener("click", () => {
        if (this.activeTag === tag) {
          // Deselect
          this.activeTag = null;
          chip.classList.remove("active");
        } else {
          // Single select: clear others first
          this.activeTag = tag;
          for (const c of container.querySelectorAll(".chip")) {
            c.classList.remove("active");
          }
          chip.classList.add("active");
        }
        this.render();
      });
      container.appendChild(chip);
    }
  }

  getFiltered() {
    if (!this.activeTag) return this.posts;
    return this.posts.filter((p) =>
      (p.tags || []).includes(this.activeTag)
    );
  }

  async render() {
    const list = document.getElementById("x-buzz-list");
    const filtered = this.getFiltered();

    if (filtered.length === 0) {
      list.innerHTML = `<div class="x-buzz-empty">該当するポストがありません</div>`;
      return;
    }

    list.innerHTML = "";

    // Create all wrappers first, then load embeds in parallel
    const tasks = [];

    for (const post of filtered) {
      const wrapper = document.createElement("div");
      wrapper.className = "x-post-embed";

      const embedTarget = document.createElement("div");
      embedTarget.className = "x-post-embed-target";
      wrapper.appendChild(embedTarget);

      list.appendChild(wrapper);

      tasks.push(
        window.twttr.widgets
          .createTweet(post.id, embedTarget, {
            lang: "ja",
            dnt: true,
          })
          .catch(() => {
            embedTarget.innerHTML = `<a href="${this.escapeHtml(post.url)}" target="_blank" rel="noopener" class="x-post-fallback">ポストを開く &rarr;</a>`;
          })
      );
    }

    await Promise.all(tasks);
  }

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
