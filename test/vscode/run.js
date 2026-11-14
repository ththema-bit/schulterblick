// Startet ein echtes VS Code (wird beim ersten Mal heruntergeladen) und führt suite.js darin aus.
// Aufruf: npm run test:vscode   (unter Linux ohne Bildschirm: xvfb-run -a npm run test:vscode)
const { runTests } = require("@vscode/test-electron");
const fs = require("fs");
const path = require("path");

const projekt = path.resolve(__dirname, "../..");
const testdir = path.join(projekt, ".vscode-test", "lauf");
fs.rmSync(testdir, { recursive: true, force: true });
fs.mkdirSync(path.join(testdir, "ws"), { recursive: true });
process.env.SCHULTERBLICK_TESTDIR = testdir;

runTests({
  version: "1.95.0",
  extensionDevelopmentPath: projekt,
  extensionTestsPath: path.join(__dirname, "suite.js"),
  launchArgs: [
    path.join(testdir, "ws"),
    "--disable-extensions",
    "--no-sandbox",
    "--disable-gpu",
    "--user-data-dir=" + path.join(testdir, "userdata"),
  ],
}).catch((e) => {
  console.error("Integrationstest fehlgeschlagen:", e);
  process.exit(1);
});
