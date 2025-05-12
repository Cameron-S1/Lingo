import { defineConfig } from 'vite';
import path from 'node:path';
import electron from 'vite-plugin-electron/simple'; // Use simple mode for easier setup
import react from '@vitejs/plugin-react';
import renderer from 'vite-plugin-electron-renderer'; // Renderer plugin

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(), // React plugin for JSX and Fast Refresh
    electron({
      main: {
        // Main process entry file
        entry: 'src/main.ts',
        // Tell Vite not to bundle listed dependencies for the main process.
        // Treat them as external requires available at runtime.
        vite: {
           build: {
             // rollupOptions is used by Vite during build
             rollupOptions: {
               external: [
                 'sqlite3', // Mark sqlite3 as external
                 // Add other native modules here if needed later
               ],
             },
             // Tell Vite's dev server to treat the module as external
             // This might be needed depending on how the plugin handles externals in dev
             // see https://github.com/electron-vite/vite-plugin-electron/issues/214
             // commonjsOptions: {
             //   ignore: ['sqlite3']
             // }
           },
            // Optional: If needed during development for optimized deps scanning
            // optimizeDeps: {
            //  exclude: ['sqlite3']
            // },
        }
      },
      preload: {
        // Preload script entry file
        input: path.join(__dirname, 'src/preload.ts'),
        // Preload scripts often also need native modules marked as external
        vite: {
          build: {
            rollupOptions: {
              external: [
                'sqlite3' // Mark sqlite3 as external for preload too, if it were used here (it's not currently)
              ],
            },
          },
        },
      },
    }),
    renderer({
      // Renderer process usually doesn't interact with native modules directly,
      // but relies on IPC via preload script.
    }),
  ],
  build: {
    // Optional: Configure build options like output directory if needed
    // outDir: 'dist', // Default output directory is 'dist'
  }
});