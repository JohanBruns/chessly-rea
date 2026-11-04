"""Exportiert den gespeicherten Chessly-Login aus browser_profile/ in Dateien für andere Tools.

Erzeugt im Ordner session/ (per .gitignore ausgeschlossen, niemals hochladen!):
  storage_state.json  Playwright-Format (Cookies + localStorage), z.B. fuer Playwright-MCP oder OpenCode
  cookies.txt         Netscape-Format, z.B. fuer curl -b, yt-dlp --cookies, wget
  cookie_header.txt   Fertige Cookie-Zeile fuer eigene Skripte (fetch, requests)

Aufruf (der Downloader und das Login-Fenster muessen vorher geschlossen sein):
  .venv\\Scripts\\python session_export.py
"""

import json
import sys
from pathlib import Path

from browser import open_browser

OUT_DIR = Path(__file__).parent / "session"
BASE = "https://chessly.com"


def netscape_line(cookie):
    """Eine Zeile im Netscape-cookies.txt-Format (HttpOnly-Cookies bekommen das Praefix #HttpOnly_)."""
    domain = cookie["domain"]
    include_subdomains = "TRUE" if domain.startswith(".") else "FALSE"
    expires = int(cookie["expires"]) if cookie["expires"] and cookie["expires"] > 0 else 0
    prefix = "#HttpOnly_" if cookie.get("httpOnly") else ""
    return "\t".join([
        prefix + domain,
        include_subdomains,
        cookie.get("path", "/"),
        "TRUE" if cookie.get("secure") else "FALSE",
        str(expires),
        cookie["name"],
        cookie["value"],
    ])


def main():
    from playwright.sync_api import sync_playwright

    OUT_DIR.mkdir(exist_ok=True)

    with sync_playwright() as p:
        context = open_browser(p, headless=True)
        try:
            page = context.pages[0] if context.pages else context.new_page()
            # Seite laden, damit Cookies/Tokens auf dem aktuellen Stand sind (Chessly kann sie erneuern).
            page.goto(f"{BASE}/courses", wait_until="domcontentloaded")
            page.wait_for_timeout(3000)
            if "/login" in page.url:
                print('Nicht eingeloggt! Bitte zuerst im Downloader auf "Login" klicken.')
                return 1

            state = context.storage_state(path=str(OUT_DIR / "storage_state.json"))
            cookies = [c for c in state["cookies"] if "chessly" in c["domain"]]
        finally:
            context.close()

    (OUT_DIR / "cookies.txt").write_text(
        "# Netscape HTTP Cookie File\n" + "\n".join(netscape_line(c) for c in cookies) + "\n",
        encoding="utf-8",
    )
    (OUT_DIR / "cookie_header.txt").write_text(
        "; ".join(f"{c['name']}={c['value']}" for c in cookies) + "\n",
        encoding="utf-8",
    )

    # Nur Namen und Ablauf ausgeben, niemals Werte.
    for c in cookies:
        print(f"{c['domain']}  {c['name']}  Ablauf: {c['expires']}")
    print(f"Gespeichert in {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
