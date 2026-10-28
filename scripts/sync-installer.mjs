import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "skills/onhold-assistant/assets/installer");
const entries = [
  "bin",
  "lib",
  "extension",
  "package.json",
  "LICENSE",
  "THIRD_PARTY_NOTICES.txt",
];
const check = process.argv.includes("--check");

function files(directory, relative = "") {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const name = path.join(relative, entry.name);
      return entry.isDirectory()
        ? files(path.join(directory, entry.name), name)
        : [name];
    })
    .sort();
}

const different = entries.filter((name) => {
  const source = path.join(root, name),
    target = path.join(destination, name);
  if (!fs.existsSync(target)) return true;
  if (fs.statSync(source).isFile())
    return !fs.readFileSync(source).equals(fs.readFileSync(target));
  const sourceFiles = files(source),
    targetFiles = files(target);
  return (
    sourceFiles.length !== targetFiles.length ||
    sourceFiles.some(
      (file, index) =>
        file !== targetFiles[index] ||
        !fs
          .readFileSync(path.join(source, file))
          .equals(fs.readFileSync(path.join(target, file))),
    )
  );
});

if (check && different.length) {
  console.error(
    `安装器副本不同步：${different.join(", ")}。请运行 npm run installer:sync`,
  );
  process.exitCode = 1;
} else {
  for (const name of different) {
    const target = path.join(destination, name);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(root, name), target, { recursive: true });
  }
  console.log(check ? "安装器副本已同步" : "安装器副本同步完成");
}
