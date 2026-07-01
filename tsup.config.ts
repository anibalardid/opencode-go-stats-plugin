import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["index.tsx"],
  outDir: "dist",
  format: ["esm"],
  dts: true,
  clean: true,
  external: [
    "@opencode-ai/plugin",
    "@opentui/core",
    "@opentui/solid",
    "solid-js",
    "child_process",
  ],
})
