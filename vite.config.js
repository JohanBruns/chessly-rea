import { defineConfig } from 'vite';

export default defineConfig({
  // Nur index.html nach Abhängigkeiten durchsuchen – im Python-Ordner downloader/ liegen fremde HTML-Dateien.
  optimizeDeps: { entries: ['index.html'] },
  server: {
    // downloader/ (venv, Videos) nicht überwachen: tausende Dateien, die die App nie ändern.
    watch: { ignored: ['**/downloader/**'] },
  },
});
