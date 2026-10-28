import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  base: "./",
  resolve: { alias: { "@": path.join(root, "src") } },
  build: {
    rollupOptions: {
      input: {
        index: path.join(root, "index.html"),
        bridge: path.join(root, "bridge.html"),
        ui: path.join(root, "ui.html"),
      },
    },
  },
  plugins: [
    tailwindcss(),
    {
      name: "package-cdp-popup",
      closeBundle() {
        const out = path.join(root, "dist"),
          target = path.join(root, "../extension/admin-ui");
        fs.rmSync(target, { recursive: true, force: true });
        fs.mkdirSync(target, { recursive: true });
        fs.copyFileSync(
          path.join(out, "bridge.html"),
          path.join(target, "bridge.html"),
        );
        for(const file of ["free-policy.gif","free-policy.png"]) fs.copyFileSync(path.join(out,file),path.join(target,file));
        fs.cpSync(path.join(out, "assets"), path.join(target, "assets"), {
          recursive: true,
        });
        fs.copyFileSync(
          path.join(root, "src/styles/tokens.css"),
          path.join(root, "../extension/onhold-tokens.css"),
        );
        const packages = fs
          .readdirSync(path.join(root, "node_modules"), { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
          .flatMap((entry) =>
            entry.name.startsWith("@")
              ? fs
                  .readdirSync(path.join(root, "node_modules", entry.name))
                  .map((name) => `${entry.name}/${name}`)
              : [entry.name],
          );
        const notices = packages
          .sort()
          .flatMap((name) => {
            const directory = path.join(root, "node_modules", name);
            return fs
              .readdirSync(directory)
              .filter(
                (file) =>
                  /^(licen[cs]e|notice|copying)(\.|$)/i.test(file) &&
                  fs.statSync(path.join(directory, file)).isFile(),
              )
              .map(
                (file) =>
                  `${name}/${file}\n${fs.readFileSync(path.join(directory, file), "utf8")}`,
              );
          })
          .join("\n\n");
        fs.writeFileSync(path.join(out, "THIRD_PARTY_LICENSES.txt"), notices);
        fs.writeFileSync(
          path.join(target, "THIRD_PARTY_LICENSES.txt"),
          notices,
        );
        for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.txt"]) {
          fs.copyFileSync(path.join(root, "..", name), path.join(out, name));
        }
      },
    },
  ],
});
