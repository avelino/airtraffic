import { build, context } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";

const watch = process.argv.includes("--watch");
const targetArg = process.argv.find((a) => a.startsWith("--target="));
const targets = targetArg ? [targetArg.split("=")[1]] : ["firefox", "chrome"];

const staticFiles = [
  ["icons", "icons"],
  ["src/popup/popup.html", "popup/popup.html"],
  ["src/popup/popup.css", "popup/popup.css"],
  ["src/options/options.html", "options/options.html"],
  ["src/options/options.css", "options/options.css"],
  ["src/shared/shared.css", "shared/shared.css"],
];

async function buildTarget(target) {
  const dist = `dist/${target}`;
  rmSync(dist, { recursive: true, force: true });

  for (const [src, dest] of staticFiles) {
    const outPath = `${dist}/${dest}`;
    mkdirSync(outPath.substring(0, outPath.lastIndexOf("/")), { recursive: true });
    cpSync(src, outPath, { recursive: true });
  }

  const manifest = JSON.parse(readFileSync(`manifests/${target}.json`, "utf-8"));
  writeFileSync(`${dist}/manifest.json`, JSON.stringify(manifest, null, 2));

  const options = {
    entryPoints: [
      { in: `src/entrypoints/${target}/background.ts`, out: "background" },
      { in: `src/entrypoints/${target}/popup.ts`, out: "popup/popup" },
      { in: `src/entrypoints/${target}/options.ts`, out: "options/options" },
    ],
    bundle: true,
    outdir: dist,
    format: "iife",
    platform: "browser",
    target: target === "firefox" ? "firefox115" : "chrome115",
    minify: !watch,
    logLevel: "info",
  };

  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log(`Watching ${target} for changes...`);
  } else {
    await build(options);
  }
}

for (const target of targets) {
  await buildTarget(target);
}
