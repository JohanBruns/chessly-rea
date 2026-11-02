"""Kleine Oberfläche: Kurs-Link eingeben, Login, Download starten."""

import queue
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, scrolledtext

from browser import PROJECT_DIR, login_window, open_browser
from chessly import NotLoggedIn, collect_lessons, find_vimeo_id
from downloader import Stopped, download_video, safe_filename

DEFAULT_TARGET = PROJECT_DIR / "downloads"


def download_course(course_url, target_dir, log, should_stop=lambda: False):
    """Der komplette Ablauf: Lektionen finden, Vimeo-IDs holen, Videos laden."""
    from playwright.sync_api import sync_playwright

    # Schritt 1: Im Browser alle Lektionen und ihre Vimeo-IDs sammeln.
    with sync_playwright() as p:
        context = open_browser(p, headless=True)
        page = context.pages[0] if context.pages else context.new_page()
        try:
            log("Öffne Kursseite ...")
            course_name, lessons = collect_lessons(page, course_url, log)
            course_dir = Path(target_dir) / safe_filename(course_name)

            jobs = []  # Liste von (vimeo_id, zieldatei)
            for lesson in lessons:
                if should_stop():
                    raise Stopped()
                file_name = safe_filename(
                    f"{lesson['chapter_no']:02d}-{lesson['lesson_no']:02d} "
                    f"{lesson['chapter']} - {lesson['lesson']}") + ".mp4"
                target_file = course_dir / file_name
                if target_file.exists():
                    log(f"Schon vorhanden: {file_name}")
                    continue
                log(f"Suche Video: {file_name}")
                vimeo_id = find_vimeo_id(page, lesson["url"])
                if vimeo_id:
                    jobs.append((vimeo_id, target_file))
                else:
                    log("  Kein Video auf dieser Seite - übersprungen.")
        finally:
            context.close()

    # Schritt 2: Videos herunterladen. Fehler bei einem Video stoppen nicht den ganzen Kurs.
    errors = 0
    for number, (vimeo_id, target_file) in enumerate(jobs, start=1):
        if should_stop():
            raise Stopped()
        log(f"[{number}/{len(jobs)}] Lade {target_file.name} (Vimeo {vimeo_id})")
        try:
            if not download_video(vimeo_id, target_file, log, should_stop):
                errors += 1
        except Exception as error:
            if should_stop():
                raise Stopped()
            errors += 1
            log(f"  FEHLER: {error}")

    log("")
    log(f"Fertig! Ordner: {course_dir}")
    if errors:
        log(f"{errors} Video(s) mit Fehler. Einfach nochmal starten - "
            "fertige Videos werden übersprungen.")


class App:
    def __init__(self, root):
        self.root = root
        self.messages = queue.Queue()  # Log-Zeilen aus dem Hintergrund-Thread
        self.stop_requested = False

        root.title("Chessly Downloader")
        root.geometry("760x480")

        frame = tk.Frame(root, padx=10, pady=10)
        frame.pack(fill="both", expand=True)
        frame.columnconfigure(1, weight=1)

        tk.Label(frame, text="Kurs-Link:").grid(row=0, column=0, sticky="w")
        self.url_entry = tk.Entry(frame)
        self.url_entry.grid(row=0, column=1, columnspan=2, sticky="ew", pady=2)

        tk.Label(frame, text="Zielordner:").grid(row=1, column=0, sticky="w")
        self.target_var = tk.StringVar(value=str(DEFAULT_TARGET))
        tk.Entry(frame, textvariable=self.target_var).grid(row=1, column=1, sticky="ew", pady=2)
        tk.Button(frame, text="...", command=self.choose_folder).grid(row=1, column=2, padx=(5, 0))

        buttons = tk.Frame(frame)
        buttons.grid(row=2, column=0, columnspan=3, sticky="w", pady=8)
        self.login_button = tk.Button(buttons, text="Login", width=12, command=self.login)
        self.login_button.pack(side="left")
        self.start_button = tk.Button(buttons, text="Download starten", width=16, command=self.start)
        self.start_button.pack(side="left", padx=5)
        self.stop_button = tk.Button(buttons, text="Stopp", width=10, command=self.stop,
                                     state="disabled")
        self.stop_button.pack(side="left")

        self.log_box = scrolledtext.ScrolledText(frame, height=18, state="disabled")
        self.log_box.grid(row=3, column=0, columnspan=3, sticky="nsew")
        frame.rowconfigure(3, weight=1)

        self.log("1. Einmal auf \"Login\" klicken, bei Chessly einloggen, Browserfenster schließen.")
        self.log("2. Kurs-Link einfügen und \"Download starten\" klicken.")
        self.root.after(100, self.show_messages)

    # --- Log ---------------------------------------------------------------

    def log(self, text):
        """Darf aus jedem Thread aufgerufen werden."""
        self.messages.put(text)

    def show_messages(self):
        """Holt alle wartenden Log-Zeilen und zeigt sie an (läuft im GUI-Thread)."""
        while not self.messages.empty():
            text = self.messages.get()
            if text is None:  # Signal: Hintergrund-Arbeit ist fertig
                self.set_busy(False)
                continue
            self.log_box.configure(state="normal")
            self.log_box.insert("end", text + "\n")
            self.log_box.see("end")
            self.log_box.configure(state="disabled")
        self.root.after(100, self.show_messages)

    # --- Buttons -----------------------------------------------------------

    def set_busy(self, busy):
        state = "disabled" if busy else "normal"
        self.login_button.configure(state=state)
        self.start_button.configure(state=state)
        self.stop_button.configure(state="normal" if busy else "disabled")

    def choose_folder(self):
        folder = filedialog.askdirectory(initialdir=self.target_var.get())
        if folder:
            self.target_var.set(folder)

    def login(self):
        self.log("Browser geöffnet. Einloggen und danach das Fenster schließen.")
        self.run_in_background(login_window, "Login gespeichert.")

    def start(self):
        url = self.url_entry.get().strip()
        if not url:
            self.log("Bitte zuerst einen Kurs-Link einfügen.")
            return
        self.stop_requested = False
        self.run_in_background(
            lambda: download_course(url, self.target_var.get(), self.log,
                                    lambda: self.stop_requested))

    def stop(self):
        self.stop_requested = True
        self.log("Stoppe nach dem aktuellen Schritt ...")

    def run_in_background(self, work, done_text=None):
        """Führt work() in einem eigenen Thread aus, damit das Fenster nicht einfriert."""
        def runner():
            try:
                work()
                if done_text:
                    self.log(done_text)
            except NotLoggedIn:
                self.log("Nicht eingeloggt! Bitte zuerst auf \"Login\" klicken.")
            except Stopped:
                self.log("Gestoppt. Beim nächsten Start geht es dort weiter.")
            except Exception as error:
                self.log(f"FEHLER: {error}")
            finally:
                self.messages.put(None)

        self.set_busy(True)
        threading.Thread(target=runner, daemon=True).start()


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
