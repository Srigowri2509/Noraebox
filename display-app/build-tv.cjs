const { build } = require("esbuild");
const { transformFileSync } = require("@babel/core");
const { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const outDir = "dist-tv";
const intermediateFile = join(outDir, "bundle.modern.js");
const intermediateCssFile = join(outDir, "bundle.modern.css");
const outFile = join(outDir, "bundle.js");
const htmlFile = join(outDir, "index.html");

mkdirSync(outDir, { recursive: true });

build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  outfile: intermediateFile,
  format: "iife",
  target: ["es2017"],
  platform: "browser",
  minify: true,
  define: {
    "import.meta.env": JSON.stringify({
      VITE_API_URL: process.env.VITE_API_URL || "http://16.112.20.5:8000",
      VITE_GITHUB_REPO: process.env.VITE_GITHUB_REPO || "Srigowri2509/Noraebox",
    }),
  },
  loader: {
    ".js": "jsx",
    ".jsx": "jsx",
  },
}).then(() => {
  const transformed = transformFileSync(intermediateFile, {
    presets: [
      ["@babel/preset-env", { targets: { android: "5" }, modules: false }],
    ],
    comments: false,
    minified: true,
    compact: true,
  });

  writeFileSync(outFile, transformed && transformed.code ? transformed.code : "", "utf8");

  // Preserve assets from public/ (logo, media, etc.) used by absolute paths.
  if (existsSync("public")) {
    cpSync("public", outDir, { recursive: true });
  }

  const srcCssFile = join("src", "index.css");
  let inlineCss = "";
  if (existsSync(srcCssFile)) {
    inlineCss = readFileSync(srcCssFile, "utf8");
  } else if (existsSync(intermediateCssFile)) {
    inlineCss = readFileSync(intermediateCssFile, "utf8");
  }

  writeFileSync(
    htmlFile,
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Norebox Display TV</title>
  <style>${inlineCss}</style>
</head>
<body>
  <div id="root"></div>
  <script src="./bundle.js"></script>
</body>
</html>
`,
    "utf8"
  );
}).catch(() => process.exit(1));
