"""Kleine Oberfläche: Kurs-Links eingeben (einer oder mehrere), Login, Download starten."""

import queue
import threading
import tkinter as tk
from tkinter import filedialog, scrolledtext

from browser import PROJECT_DIR, login_window
from chessly import NotLoggedIn, parse_course_links
from downloader import Stopped
from exporter import DEFAULT_WORKERS, export_courses

DEFAULT_TARGET = PROJECT_DIR / "downloads"


class App:
    def __init__(self, root):
        self.root = root
        self.messages = queue.Queue()  # Log-Zeilen aus dem Hintergrund-Thread
        self.stop_requested = False

        root.title("Chessly Downloader")
        root.geometry("760x640")

        frame = tk.Frame(root, padx=10, pady=10)
        frame.pack(fill="both", expand=True)
        frame.columnconfigure(1, weight=1)

        tk.Label(frame, text="Kurs-Links:", anchor="nw").grid(row=0, column=0, sticky="nw")
        self.url_box = tk.Text(frame, height=6, wrap="none")
        self.url_box.grid(row=0, column=1, columnspan=2, sticky="ew", pady=2)
        tk.Label(frame, text="(ein Link pro Zeile)", fg="gray").grid(row=1, column=1, sticky="w")

        tk.Label(frame, text="Zielordner:").grid(row=2, column=0, sticky="w")
        self.target_var = tk.StringVar(value=str(DEFAULT_TARGET))
        tk.Entry(frame, textvariable=self.target_var).grid(row=2, column=1, sticky="ew", pady=2)
        tk.Button(frame, text="...", command=self.choose_folder).grid(row=2, column=2, padx=(5, 0))

        self.full_export = tk.BooleanVar(value=True)
        tk.Checkbutton(
            frame,
            text="Kompletter Kurs: Videos + Linien + PGN für openings/",
            variable=self.full_export,
        ).grid(row=3, column=0, columnspan=3, sticky="w")

        self.publish = tk.BooleanVar(value=True)
        tk.Checkbutton(
            frame,
            text="Danach automatisch hochladen und veröffentlichen (R2 + Cloudflare Pages)",
            variable=self.publish,
        ).grid(row=4, column=0, columnspan=3, sticky="w")

        workers_row = tk.Frame(frame)
        workers_row.grid(row=5, column=0, columnspan=3, sticky="w")
        tk.Label(workers_row, text="Videos gleichzeitig laden:").pack(side="left")
        self.workers_var = tk.StringVar(value=str(DEFAULT_WORKERS))
        tk.Spinbox(workers_row, from_=1, to=6, width=3, textvariable=self.workers_var).pack(side="left", padx=5)

        buttons = tk.Frame(frame)
        buttons.grid(row=6, column=0, columnspan=3, sticky="w", pady=8)
        self.login_button = tk.Button(buttons, text="Login", width=12, command=self.login)
        self.login_button.pack(side="left")
        self.start_button = tk.Button(buttons, text="Download starten", width=16, command=self.start)
        self.start_button.pack(side="left", padx=5)
        self.stop_button = tk.Button(buttons, text="Stopp", width=10, command=self.stop,
                                     state="disabled")
        self.stop_button.pack(side="left")

        self.log_box = scrolledtext.ScrolledText(frame, height=18, state="disabled")
        self.log_box.grid(row=7, column=0, columnspan=3, sticky="nsew")
        frame.rowconfigure(7, weight=1)

        self.log("1. Einmal auf \"Login\" klicken, bei Chessly einloggen, Browserfenster schließen.")
        self.log("2. Kurs-Links einfügen (auch mehrere untereinander) und \"Download starten\" klicken.")
        self.log("   Doppelte Links werden entfernt. Die Kurse werden nacheinander gelesen, die Videos")
        self.log("   laden mehrere gleichzeitig, und am Ende gibt es nur einen Upload und ein Deploy.")
        self.log("   Mit Häkchen: Videos + Kapitel/Linien + fertige PGN in openings/.")
        self.log("   Mit dem zweiten Häkchen geht alles danach auch gleich online")
        self.log("   (einmalig vorher: `npx wrangler login` im Projektordner).")
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

    def workers(self):
        try:
            return max(1, min(6, int(self.workers_var.get())))
        except ValueError:
            return DEFAULT_WORKERS

    def start(self):
        links, ignored, duplicates = parse_course_links(self.url_box.get("1.0", "end"))
        for part in ignored:
            self.log(f"Ignoriert (kein Kurs-Link): {part}")
        if duplicates:
            self.log(f"{duplicates} doppelte(r) Link(s) entfernt.")
        if not links:
            self.log("Bitte zuerst mindestens einen Kurs-Link einfügen.")
            return
        if len(links) > 1:
            self.log(f"{len(links)} Kurse in der Warteschlange.")
        self.stop_requested = False
        full = self.full_export.get()
        publish = self.publish.get()
        workers = self.workers()
        self.run_in_background(
            lambda: export_courses(links, self.target_var.get(), self.log,
                                   lambda: self.stop_requested, full, publish, workers))

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
