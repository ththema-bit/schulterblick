// Selbsttest ohne VS Code: npm test
// Mit SCHULTERBLICK_LIVE=1 wird zusätzlich die echte Claude-CLI gefragt.
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
import { zeilenDiff, mitZeilennummern } from "./diff";
import { STILL, aenderungsNachricht, systemPrompt, uebungenAuslesen } from "./prompts";
import { Mentor } from "./mentor";

let ok = 0;
function test(name: string, f: () => void) {
  f();
  ok++;
  console.log("  ok  " + name);
}

const alt = ["public class A {", "  void f() {", "    int x = 1;", "  }", "}"].join("\n");
const neu = ["public class A {", "  void f() {", "    int x = 2;", "    int y = x;", "  }", "}"].join("\n");

test("Diff zeigt nur Änderungen mit Kontext", () => {
  const d = zeilenDiff(alt, neu, 1)!;
  assert.strictEqual(d.geaenderteZeilen, 3);
  assert.match(d.text, /^@@ um Zeile 2 @@/);
  assert.ok(d.text.includes("-  |     int x = 1;\n+ 3|     int x = 2;"), d.text);
    assert.ok(d.text.includes("+ 4|     int y = x;"));
  assert.ok(!d.text.includes("public class"), "zu viel Kontext");
});

test("Diff ohne Änderung ist leer", () => {
  assert.deepStrictEqual(zeilenDiff(alt, alt), { text: "", geaenderteZeilen: 0 });
});

test("Diff erkennt eingefügte Zeile am Anfang", () => {
  const d = zeilenDiff("b\nc", "a\nb\nc", 0)!;
  assert.strictEqual(d.text, "@@ um Zeile 1 @@\n+ 1| a");
});

test("Zeilennummern", () => {
  assert.strictEqual(mitZeilennummern("x\ny"), "1| x\n2| y");
});

test("Übung wird aus Antwort gezogen", () => {
  const antwort = `Hier eine Übung für dich!

<<<UEBUNG ArraySortieren.java
\`\`\`java
public class ArraySortieren {
  public static void main(String[] a) {}
}
\`\`\`
UEBUNG>>>

Fang mit TODO 1 an.`;
  const { rest, uebungen } = uebungenAuslesen(antwort);
  assert.strictEqual(uebungen.length, 1);
  assert.strictEqual(uebungen[0].datei, "ArraySortieren.java");
  assert.ok(uebungen[0].code.startsWith("public class"));
  assert.ok(!uebungen[0].code.includes("```"));
  assert.strictEqual(rest, "Hier eine Übung für dich!\n\nFang mit TODO 1 an.");
});

test("Übung mit bösem Dateinamen wird ignoriert", () => {
  const { uebungen } = uebungenAuslesen("<<<UEBUNG ../../x.sh\necho\nUEBUNG>>>");
  assert.strictEqual(uebungen.length, 0);
  const { uebungen: u2 } = uebungenAuslesen("<<<UEBUNG ../geheim/Test.java\nclass Test{}\nUEBUNG>>>");
  assert.strictEqual(u2[0].datei, "Test.java");
});

test("Prompts bauen", () => {
  assert.ok(systemPrompt("ruhig", "Ich lerne Java").includes("Ich lerne Java"));
  const n = aenderungsNachricht({ datei: "A.java", sprache: "java", zeilen: 6, ganzeDatei: false, inhalt: "x", meldungen: ["- Zeile 3: Fehler: ;"] });
  assert.match(n, /^\[ÄNDERUNG\] Datei: A\.java/);
});

async function live() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schulterblick-"));
  const spf = path.join(dir, "prompt.md");
  fs.writeFileSync(spf, systemPrompt("normal", ""));
  const mentor = new Mentor(
    () => ({ claudePfad: process.env.CLAUDE ?? "claude", modell: "haiku", arbeitsordner: dir, systemPromptDatei: spf }),
    { sessionId: randomUUID(), gestartet: false },
    () => undefined,
  );
  const code = `public class Summe {\n  public static void main(String[] args) {\n    int[] z = {1, 2, 3};\n    int s = 0;\n    for (int i = 0; i <= z.length; i++) s += z[i];\n    System.out.println(s);\n  }\n}`;
  const a1 = await mentor.fragen(aenderungsNachricht({ datei: "Summe.java", sprache: "java", zeilen: 8, ganzeDatei: true, inhalt: mitZeilennummern(code), meldungen: [] }));
  console.log("\n  Eule zum Off-by-one:\n  " + a1.replace(/\n/g, "\n  "));
  assert.ok(a1 !== STILL && /5/.test(a1), "Off-by-one in Zeile 5 nicht bemerkt");

  const a2 = await mentor.fragen("[FRAGE] In welcher Datei war ich gerade? Nur der Dateiname.");
  console.log("\n  Kontext-Test: " + a2);
  assert.match(a2, /Summe\.java/);

  const a3 = await mentor.fragen("[FRAGE] gib mir ne übung zu arrays sortieren in java");
  const { uebungen, rest } = uebungenAuslesen(a3);
  console.log("\n  Übung: " + uebungen.map((u) => u.datei).join(", ") + " | " + rest);
  assert.strictEqual(uebungen.length, 1, "keine Übung erkannt:\n" + a3);
  const datei = path.join(dir, uebungen[0].datei);
  fs.writeFileSync(datei, uebungen[0].code);
  console.log(uebungen[0].code.replace(/^/gm, "    | "));
  ok++;
  return datei;
}

(async () => {
  if (process.env.SCHULTERBLICK_LIVE) {
    const datei = await live();
    console.log("  ok  Live-Test mit Claude (Übung gespeichert: " + datei + ")");
  }
  console.log(`\nALLES OK (${ok} Tests)`);
})().catch((e) => {
  console.error("\nFEHLER:", e.message ?? e);
  process.exit(1);
});
