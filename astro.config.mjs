import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

const site = process.env.SITE_URL ?? "https://dasarang-class.pages.dev";
const base = process.env.SITE_BASE_PATH ?? "/";

export default defineConfig({
  site,
  base,
  output: "server",
  trailingSlash: "always",
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
});
