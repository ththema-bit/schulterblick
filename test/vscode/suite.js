// Läuft innerhalb von VS Code. Prüft: Pause-Timer, Diff statt ganzer Datei, Modus
// "Nur auf Frage", Übung anlegen, Vorschlag nach verrutschten Zeilen übernehmen, Einfügen.
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const T = process.env.SCHULTERBLICK_TESTDIR;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const log = () => {
  const f = path.join(T, "log.txt");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").map((z) => JSON.parse(z)) : [];
};

exports.run = async () => {
  const c = vscode.workspace.getConfiguration("schulterblick");
  const G = vscode.ConfigurationTarget.Global;
  await c.update("claudePfad", path.join(__dirname, "fake-claude.js"), G);
  await c.update("pauseSekunden", 2, G);
  await c.update("minZeichen", 5, G);
  await c.update("benachrichtigen", false, G);
  await c.update("modus", "live", G);

  const datei = path.join(T, "ws", "A.java");
  fs.writeFileSync(datei, "");
  const doc = await vscode.workspace.openTextDocument(datei);
  const ed = await vscode.window.showTextDocument(doc);
  const api = await vscode.extensions.getExtension("ththema-bit.schulterblick").activate();

  // 1) Erste Änderung -> ganze Datei, neue Sitzung
  const methoden = Array.from({ length: 20 }, (_, i) => `  void g${i}() { System.out.println("hallo welt"); }\n`).join("");
  await ed.edit((e) => e.insert(new vscode.Position(0, 0), "public class A {\n  void f() {\n    int x = 1;\n  }\n" + methoden + "}\n"));
  await warte(4000);
  let l = log();
  assert.strictEqual(l.length, 1, "erste Änderung nicht geschickt");
  assert.ok(l[0].stdin.includes("Ganze Datei"));
  assert.ok(l[0].args.includes("--session-id"));

  // 2) Weitere Änderungen -> nur Diff, gleiche Sitzung
  await ed.edit((e) => e.replace(new vscode.Range(2, 0, 2, 14), "    int x = 22;"));
  await warte(1000);
  await ed.edit((e) => e.insert(new vscode.Position(3, 0), "    x++;\n"));
  await warte(4000);
  l = log();
  assert.strictEqual(l.length, 2, "zweite Änderung nicht geschickt");
  assert.ok(l[1].stdin.includes("Diff seit dem letzten Mal"));
  assert.ok(l[1].args.includes("--resume"));
  assert.ok(!l[1].stdin.includes("void g15"), "Diff enthält zu viel");

  // 3) Modus "Nur auf Frage" -> nichts automatisch
  await vscode.commands.executeCommand("schulterblick.modusUmschalten");
  await warte(500);
  assert.strictEqual(vscode.workspace.getConfiguration("schulterblick").get("modus"), "aufFrage");
  await ed.edit((e) => e.insert(new vscode.Position(4, 0), "    // ganz viel neuer Kommentar hier\n"));
  await warte(4000);
  assert.strictEqual(log().length, 2, "im Modus aufFrage trotzdem geschickt");

  // 4) Frage -> Übung wird angelegt und geöffnet, aktueller Stand geht mit
  await api.frage("gib mir ne übung");
  l = log();
  assert.strictEqual(l.length, 3);
  assert.ok(l[2].stdin.includes("ganz viel neuer Kommentar"), "Frage ohne aktuellen Stand");
  assert.ok(fs.existsSync(path.join(T, "ws", "schulterblick-uebungen", "Uebung.java")), "Übung nicht angelegt");
  assert.strictEqual(path.basename(vscode.window.activeTextEditor.document.uri.fsPath), "Uebung.java");

  // 5) Vorschlag übernehmen, nachdem die Zeilen verrutscht sind
  const ed2 = await vscode.window.showTextDocument(doc);
  await api.frage("korrigier das bitte");
  await ed2.edit((e) => e.insert(new vscode.Position(0, 0), "// oben 1\n// oben 2\n"));
  assert.strictEqual(await api.vorschlagUebernehmen(), true, "Übernehmen fehlgeschlagen");
  assert.strictEqual(doc.lineAt(4).text, "    int x = 3;");

  // 6) Code-Block an Cursor einfügen, mit Einrückung der Zeile
  const leer = doc.lineCount - 1;
  await ed2.edit((e) => e.insert(new vscode.Position(leer, 0), "    "));
  ed2.selection = new vscode.Selection(leer, 4, leer, 4);
  await api.einfuegen("int a = 1;\nint b = 2;");
  assert.ok(doc.getText().includes("    int a = 1;\n    int b = 2;"));

  // Einstellungen zurücksetzen
  for (const k of ["claudePfad", "pauseSekunden", "minZeichen", "benachrichtigen", "modus"]) await c.update(k, undefined, G);
  console.log("INTEGRATION OK");
};
