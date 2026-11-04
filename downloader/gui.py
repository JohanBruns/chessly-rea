"""Kleine Oberfläche: Kurs-Link eingeben, Login, Download starten."""

import queue
import threading
import tkinter as tk
from tkinter import filedialog, scrolledtext

from browser import PROJECT_DIR, login_window
from chessly import NotLoggedIn
from downloader import Stopped
from exporter import export_course

DEFAULT_TARGET = PROJECT_DIR / "downloads"


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

        self.full_export = tk.BooleanVar(value=True)
        tk.Checkbutton(
            frame,
            text="Kompletter Kurs: Videos + Linien + PGN für openings/",
            variable=self.full_export,
        ).grid(row=2, column=0, columnspan=3, sticky="w")

        buttons = tk.Frame(frame)
        buttons.grid(row=3, column=0, columnspan=3, sticky="w", pady=8)
        self.login_button = tk.Button(buttons, text="Login", width=12, command=self.login)
        self.login_button.pack(side="left")
        self.start_button = tk.Button(buttons, text="Download starten", width=16, command=self.start)
        self.start_button.pack(side="left", padx=5)
        self.stop_button = tk.Button(buttons, text="Stopp", width=10, command=self.stop,
                                     state="disabled")
        self.stop_button.pack(side="left")

        self.log_box = scrolledtext.ScrolledText(frame, height=18, state="disabled")
        self.log_box.grid(row=4, column=0, columnspan=3, sticky="nsew")
        frame.rowconfigure(4, weight=1)

        self.log("1. Einmal auf \"Login\" klicken, bei Chessly einloggen, Browserfenster schließen.")
        self.log("2. Kurs-Link einfügen und \"Download starten\" klicken.")
        self.log("   Mit Häkchen: Videos + Kapitel/Linien + fertige PGN in openings/.")
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
        full = self.full_export.get()
        self.run_in_background(
            lambda: export_course(url, self.target_var.get(), self.log,
                                  lambda: self.stop_requested, full))

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
