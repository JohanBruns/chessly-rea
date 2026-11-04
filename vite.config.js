import { defineConfig } from 'vite';

export default defineConfig({
  // Nur index.html nach Abhängigkeiten durchsuchen – im Python-Ordner downloader/ liegen fremde HTML-Dateien.
  optimizeDeps: { entries: ['index.html'] },
  build: {
    rollupOptions: {
      output: {
        // Nachgeladene Teile (die App samt Kursinhalten) landen in dist/app/, das nur mit Anmeldung erreichbar ist
        chunkFileNames: (chunk) => (chunk.isDynamicEntry ? 'app/[name]-[hash].js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  server: {
    // downloader/ (venv, Videos) nicht überwachen: tausende Dateien, die die App nie ändern.
    watch: { ignored: ['**/downloader/**'] },
  },
});
