#!/usr/bin/env node
// Ersatz für die Claude-CLI im Integrationstest: protokolliert Argumente und
// Eingabe in log.txt (Ordner aus SCHULTERBLICK_TESTDIR) und gibt feste Antworten.
const fs = require("fs");
const path = require("path");
let eingabe = "";
process.stdin.on("data", (d) => (eingabe += d)).on("end", () => {
  fs.appendFileSync(
    path.join(process.env.SCHULTERBLICK_TESTDIR, "log.txt"),
    JSON.stringify({ args: process.argv.slice(2), stdin: eingabe }) + "\n",
  );
  let antwort = "[STILL]";
  if (eingabe.includes("[FRAGE] korrigier")) {
    antwort = "Klar, so:\n<<<ERSETZE Zeile 3\n    int x = 3;\nERSETZE>>>\nWeil 3 schöner ist.";
  } else if (eingabe.includes("[FRAGE]")) {
    antwort = "Viel Spaß!\n\n<<<UEBUNG Uebung.java\npublic class Uebung {\n  // TODO 1\n}\nUEBUNG>>>";
  } else if (eingabe.includes("int x = 1")) {
    antwort = "Schau dir mal Zeile 3 an.";
  }
  console.log(JSON.stringify({ result: antwort, is_error: false }));
});
