const { execFileSync, spawnSync } = require("node:child_process");
const { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } = require("node:fs");
const { basename, join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const outRoot = join(root, "tizen-dist");
const projectDir = join(outRoot, "NoreboxDisplay");
const packageDir = join(outRoot, "packages");
const unsignedPackage = join(packageDir, "NoreboxDisplay.wgt");
const unsignedZip = join(packageDir, "NoreboxDisplay.zip");
const webBuildDir = join(root, "dist");

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
}

function ensureCleanDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function copyDirectoryContents(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) {
      cpSync(source, target, { recursive: true });
    } else {
      copyFileSync(source, target);
    }
  }
}

function commandExists(command) {
  const checker = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(checker, [command], { stdio: "ignore", shell: false });
  return result.status === 0;
}

function createUnsignedWgt() {
  mkdirSync(packageDir, { recursive: true });
  rmSync(unsignedPackage, { force: true });
  rmSync(unsignedZip, { force: true });

  if (process.platform === "win32") {
    run("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Compress-Archive -Path '${projectDir}\\*' -DestinationPath '${unsignedZip}' -Force; Move-Item -LiteralPath '${unsignedZip}' -Destination '${unsignedPackage}' -Force`,
    ]);
    return;
  }

  run("zip", ["-r", unsignedPackage, "."], { cwd: projectDir, shell: false });
}

function getTizenCommand() {
  if (commandExists("tizen")) return "tizen";
  if (process.platform === "win32" && commandExists("tizen.bat")) return "tizen.bat";
  return null;
}

function packageWithTizenCli() {
  const tizenCommand = getTizenCommand();
  if (!tizenCommand) return false;

  const signProfileArg = process.argv.find((arg) => arg.startsWith("--sign-profile="));
  const signProfile = signProfileArg ? signProfileArg.split("=")[1] : process.env.TIZEN_SIGN_PROFILE;
  const args = ["package", "-t", "wgt", "-o", packageDir];

  if (signProfile) {
    args.push("-s", signProfile);
  }

  args.push("--", projectDir);
  run(tizenCommand, args, { shell: process.platform === "win32" });
  return true;
}

console.log("Building display app from the same React source...");
try {
  run("npm", ["run", "build"]);
} catch (error) {
  if (!existsSync(join(webBuildDir, "index.html"))) {
    throw error;
  }
  console.warn("build failed; using existing dist output for Tizen packaging.");
}

ensureCleanDir(projectDir);
mkdirSync(packageDir, { recursive: true });
copyDirectoryContents(webBuildDir, projectDir);
copyFileSync(join(root, "tizen", "config.xml"), join(projectDir, "config.xml"));

console.log(`Tizen web app project created at ${projectDir}`);

if (packageWithTizenCli()) {
  console.log(`Signed Tizen package written to ${packageDir}`);
} else {
  createUnsignedWgt();
  console.log(`Unsigned Tizen web package written to ${unsignedPackage}`);
  console.log("Installable Samsung TV packages must be signed with Tizen Studio CLI.");
  console.log("After installing Tizen Studio, rerun with: npm run build:tizen -- --sign-profile=<profile>");
}

console.log("Note: React/web display apps package as .wgt for Tizen TV. .tpk is for native Tizen apps.");
