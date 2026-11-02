"""Startet Chromium mit einem gespeicherten Profil, damit der Chessly-Login erhalten bleibt."""

from pathlib import Path

PROJECT_DIR = Path(__file__).parent
PROFILE_DIR = PROJECT_DIR / "browser_profile"


def open_browser(playwright, headless=False):
    """Öffnet Chromium mit dem Profil aus dem Projektordner (Cookies bleiben gespeichert)."""
    return playwright.chromium.launch_persistent_context(
        str(PROFILE_DIR),
        headless=headless,
        viewport={"width": 1280, "height": 900},
        # Ohne diese Optionen blockieren manche Login-Seiten (z.B. Google) den Browser.
        ignore_default_args=["--enable-automation"],
        args=["--disable-blink-features=AutomationControlled"],
    )


def login_window():
    """Öffnet die Chessly-Login-Seite und wartet, bis das Browserfenster geschlossen wird."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        context = open_browser(p, headless=False)
        page = context.pages[0] if context.pages else context.new_page()
        page.goto("https://chessly.com/login")
        # Warten, bis der Nutzer das Fenster schließt.
        page.wait_for_event("close", timeout=0)
        context.close()


if __name__ == "__main__":
    login_window()
