#!/usr/bin/env python3
"""
Claude Update Tracker - Auto Update Script
公式3ソースから最新のアップデート情報を取得し、updates.json に追記する。

データソース:
  1. Claude Code CHANGELOG (GitHub raw)
  2. API Platform Release Notes (HTML)
  3. Claude Apps Release Notes (Intercom JSON)

Usage:
  python3 update.py           # 通常実行
  python3 update.py --dry-run # JSON書き込みせず差分だけ表示
"""

import json
import re
import sys
import os
from datetime import datetime, date
from pathlib import Path

# --- Config ---
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
UPDATES_FILE = DATA_DIR / "updates.json"
LOG_FILE = SCRIPT_DIR / "update.log"

CHANGELOG_URL = "https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md"
PLATFORM_URL = "https://docs.anthropic.com/en/release-notes/overview"
APPS_URL = "https://support.claude.com/en/articles/12138966-release-notes"
GITHUB_TAGS_URL = "https://api.github.com/repos/anthropics/claude-code/tags?per_page=50"

# --- Logging ---
def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


def load_updates():
    """既存の updates.json を読み込む"""
    with open(UPDATES_FILE, "r") as f:
        return json.load(f)


def save_updates(data, dry_run=False):
    """updates.json を保存"""
    if dry_run:
        log("DRY RUN: 書き込みをスキップ")
        return

    data["meta"]["lastUpdated"] = date.today().isoformat()

    with open(UPDATES_FILE, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    log(f"updates.json を保存しました（{len(data['updates'])}件）")


def get_existing_ids(data):
    """既存のIDセットを取得"""
    return {u["id"] for u in data["updates"]}


def git_push(count):
    """変更を commit & push"""
    import subprocess

    repo_dir = SCRIPT_DIR.parent
    today = date.today().isoformat()

    try:
        subprocess.run(
            ["git", "add", "data/updates.json"],
            cwd=repo_dir, check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "commit", "-m", f"auto-update: {count} new entries ({today})"],
            cwd=repo_dir, check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "push"],
            cwd=repo_dir, check=True, capture_output=True,
        )
        log(f"Git push 完了（{count}件の新規エントリ）")
    except subprocess.CalledProcessError as e:
        log(f"Git push エラー: {e.stderr.decode() if e.stderr else e}")


# ============================================================
# Source 1: Claude Code CHANGELOG
# ============================================================
def fetch_changelog():
    """Claude Code CHANGELOG.md をパースして新しいエントリを生成"""
    import requests

    log("Claude Code CHANGELOG を取得中...")
    resp = requests.get(CHANGELOG_URL, timeout=30)
    resp.raise_for_status()
    text = resp.text

    # バージョンごとに分割
    entries = []
    parts = re.split(r"^## (\d+\.\d+\.\d+)\s*$", text, flags=re.MULTILINE)
    # parts = ['preamble', 'version1', 'content1', 'version2', 'content2', ...]

    for i in range(1, len(parts) - 1, 2):
        version = parts[i]
        content = parts[i + 1].strip()
        if not content:
            continue

        # 箇条書きを取得（最初の5項目まで）
        bullets = []
        for line in content.split("\n"):
            line = line.strip()
            if line.startswith("- "):
                bullets.append(line[2:].strip())
            if len(bullets) >= 5:
                break

        entries.append({
            "version": version,
            "bullets": bullets,
            "raw": content,
        })

    # GitHub Tags API で日付を取得
    tag_dates = fetch_tag_dates()

    results = []
    for entry in entries:
        v = entry["version"]
        tag_date = tag_dates.get(v)
        if not tag_date:
            continue  # 日付が取れないバージョンはスキップ

        bullets = entry["bullets"]

        # 重要度判定: "Added" や新機能キーワードがあれば feature、なければ patch スキップ
        raw_lower = entry["raw"].lower()
        has_feature = any(
            kw in raw_lower
            for kw in ["added", "new ", "launch", "support for", "introduced"]
        )
        is_fix_only = all(
            b.lower().startswith("fix") or b.lower().startswith("update")
            for b in bullets
        ) if bullets else True

        # バグ修正のみのパッチリリースはスキップ（ノイズ軽減）
        if is_fix_only and not has_feature:
            continue

        # タイトルを主要な変更点から生成
        title_parts = []
        for b in bullets[:3]:
            # 長い説明は短くする
            short = b.split("—")[0].split("–")[0].split(" -- ")[0].strip()
            if len(short) > 60:
                short = short[:57] + "..."
            title_parts.append(short)

        title = f"Claude Code v{v}"
        description = "、".join(title_parts[:3]) if title_parts else f"Claude Code v{v} リリース"
        category = "feature" if has_feature else "improvement"

        slug = re.sub(r"[^a-z0-9]+", "-", f"claude-code-v{v}".lower()).strip("-")
        entry_id = f"{tag_date}-{slug}"

        results.append({
            "id": entry_id,
            "date": tag_date,
            "title": title,
            "titleEn": f"Claude Code v{v}",
            "description": description,
            "source": "code",
            "platforms": ["claude-code-cli", "claude-code-vscode"],
            "category": category,
            "importance": "minor",
            "tags": ["claude-code", f"v{v}"],
            "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
        })

    log(f"  → {len(results)}件のエントリを取得")
    return results


def fetch_tag_dates():
    """GitHub Tags API からバージョン→日付のマッピングを取得"""
    import requests

    try:
        resp = requests.get(GITHUB_TAGS_URL, timeout=15)
        resp.raise_for_status()
        tags = resp.json()
    except Exception as e:
        log(f"  GitHub Tags API エラー: {e}")
        return {}

    dates = {}
    for tag in tags:
        name = tag.get("name", "")
        # "v2.1.81" → "2.1.81"
        version = name.lstrip("v")
        # commit の日付を取得
        commit_url = tag.get("commit", {}).get("url")
        if commit_url:
            try:
                cr = requests.get(commit_url, timeout=10)
                cr.raise_for_status()
                commit_data = cr.json()
                date_str = commit_data.get("commit", {}).get("committer", {}).get("date", "")
                if date_str:
                    dates[version] = date_str[:10]  # "2026-03-20T..." → "2026-03-20"
            except Exception:
                pass

    log(f"  → {len(dates)}件のタグ日付を取得")
    return dates


# ============================================================
# Source 2: API Platform Release Notes
# ============================================================
def fetch_platform_notes():
    """API Platform リリースノートをパース"""
    import requests
    from bs4 import BeautifulSoup

    log("API Platform Release Notes を取得中...")
    resp = requests.get(PLATFORM_URL, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    results = []

    # h3 タグ内の div.group[id] で日付を特定
    headings = soup.find_all("h3")

    for h3 in headings:
        div_group = h3.find("div", id=True)
        if not div_group:
            continue

        # 日付テキストを取得
        date_text = None
        for div in div_group.find_all("div", recursive=False):
            text = div.get_text(strip=True)
            if re.match(r"[A-Z][a-z]+ \d{1,2}, \d{4}", text):
                date_text = text
                break

        if not date_text:
            continue

        # 日付をパース
        try:
            parsed_date = datetime.strptime(date_text, "%B %d, %Y")
            date_iso = parsed_date.strftime("%Y-%m-%d")
        except ValueError:
            continue

        # 次の ul を取得
        ul = h3.find_next_sibling("ul")
        if not ul:
            continue

        items = []
        for li in ul.find_all("li", recursive=False):
            text = li.get_text(strip=True)
            if text:
                items.append(text)

        if not items:
            continue

        # 最初の項目をタイトルに
        title = items[0]
        if len(title) > 80:
            title = title[:77] + "..."
        description = " / ".join(items) if len(items) > 1 else items[0]

        slug_id = div_group.get("id", "")
        entry_id = f"{date_iso}-platform-{slug_id}"

        results.append({
            "id": entry_id,
            "date": date_iso,
            "title": title,
            "titleEn": title,
            "description": description,
            "source": "platform",
            "platforms": ["api"],
            "category": "feature",
            "importance": "minor",
            "tags": ["api", "platform"],
            "link": f"https://docs.anthropic.com/en/release-notes/overview#{slug_id}",
        })

    log(f"  → {len(results)}件のエントリを取得")
    return results


# ============================================================
# Source 3: Claude Apps Release Notes
# ============================================================
def fetch_apps_notes():
    """Claude Apps リリースノートをパース（__NEXT_DATA__ JSON）"""
    import requests
    from bs4 import BeautifulSoup

    log("Claude Apps Release Notes を取得中...")
    resp = requests.get(APPS_URL, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    # __NEXT_DATA__ を探す
    script_tag = soup.find("script", id="__NEXT_DATA__")
    if not script_tag:
        log("  → __NEXT_DATA__ が見つかりません")
        return []

    try:
        next_data = json.loads(script_tag.string)
        blocks = next_data["props"]["pageProps"]["articleContent"]["blocks"]
    except (KeyError, json.JSONDecodeError) as e:
        log(f"  → JSON パースエラー: {e}")
        return []

    results = []
    current_date = None
    current_items = []

    def flush():
        nonlocal current_date, current_items
        if current_date and current_items:
            # 最初のboldテキストをタイトルに
            title = current_items[0]
            # HTML タグを除去
            title_clean = re.sub(r"<[^>]+>", "", title).strip()
            desc_parts = [re.sub(r"<[^>]+>", "", t).strip() for t in current_items if re.sub(r"<[^>]+>", "", t).strip()]

            if title_clean:
                slug = re.sub(r"[^a-z0-9]+", "-", title_clean[:50].lower()).strip("-")
                entry_id = f"{current_date}-apps-{slug}"

                platforms = ["claude-ai", "desktop"]
                # モバイル関連かチェック
                full_text = " ".join(desc_parts).lower()
                if "mobile" in full_text or "ios" in full_text or "android" in full_text:
                    platforms.append("mobile")

                results.append({
                    "id": entry_id,
                    "date": current_date,
                    "title": title_clean if len(title_clean) <= 80 else title_clean[:77] + "...",
                    "titleEn": "",
                    "description": " ".join(desc_parts[1:3]) if len(desc_parts) > 1 else title_clean,
                    "source": "apps",
                    "platforms": platforms,
                    "category": "feature",
                    "importance": "minor",
                    "tags": ["apps"],
                    "link": "https://support.claude.com/en/articles/12138966-release-notes",
                })

        current_date = None
        current_items = []

    for block in blocks:
        btype = block.get("type", "")
        text = block.get("text", "")

        if btype == "subheading3":
            flush()
            # 日付をパース
            try:
                parsed = datetime.strptime(text.strip(), "%B %d, %Y")
                current_date = parsed.strftime("%Y-%m-%d")
            except ValueError:
                current_date = None

        elif btype == "paragraph" and current_date:
            clean = text.strip()
            if clean and clean != " ":
                current_items.append(clean)

        elif btype in ("subheading", "horizontalRule"):
            flush()

    flush()

    log(f"  → {len(results)}件のエントリを取得")
    return results


# ============================================================
# Main
# ============================================================
def main():
    dry_run = "--dry-run" in sys.argv

    log("=" * 50)
    log("Claude Update Tracker - 自動更新開始")
    log("=" * 50)

    # 依存チェック
    try:
        import requests
        from bs4 import BeautifulSoup
    except ImportError:
        log("ERROR: 必要なパッケージがありません。以下を実行してください:")
        log("  pip3 install requests beautifulsoup4")
        sys.exit(1)

    # 既存データ読み込み
    data = load_updates()
    existing_ids = get_existing_ids(data)
    log(f"既存エントリ: {len(existing_ids)}件")

    # 3ソースから取得
    new_entries = []

    try:
        for entry in fetch_changelog():
            if entry["id"] not in existing_ids:
                new_entries.append(entry)
    except Exception as e:
        log(f"ERROR (Claude Code): {e}")

    try:
        for entry in fetch_platform_notes():
            if entry["id"] not in existing_ids:
                new_entries.append(entry)
    except Exception as e:
        log(f"ERROR (Platform): {e}")

    try:
        for entry in fetch_apps_notes():
            if entry["id"] not in existing_ids:
                new_entries.append(entry)
    except Exception as e:
        log(f"ERROR (Apps): {e}")

    # 結果
    if new_entries:
        log(f"\n新規エントリ: {len(new_entries)}件")
        for e in new_entries:
            log(f"  + [{e['date']}] {e['title']}")

        data["updates"].extend(new_entries)
        save_updates(data, dry_run=dry_run)

        # Git commit & push（GitHub Pages 自動デプロイ）
        if not dry_run:
            git_push(len(new_entries))
    else:
        log("新規エントリなし。updates.json は変更しません。")

    log("完了\n")


if __name__ == "__main__":
    main()
