/// <reference types="vite/client" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const isCloudflareBuild = process.env.CLOUDFLARE === "true";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    port: 8080,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [
    ...(isCloudflareBuild ? [cloudflare({ viteEnvironment: { name: "ssr" } })] : [nitro()]),
    tanstackStart(),
    tailwindcss(),
    viteReact(),
  ],
});
