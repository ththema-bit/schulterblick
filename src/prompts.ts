export const STILL = "[STILL]";

export function systemPrompt(gespraechigkeit: string, ueberMich: string): string {
  const stufe =
    gespraechigkeit === "ruhig"
      ? "Melde dich von selbst NUR bei echten Fehlern (Bugs, Abstürze, falsche Logik, undefiniertes Verhalten). Stil und Kleinigkeiten ignorierst du."
      : gespraechigkeit === "gespraechig"
        ? "Du darfst dich öfter melden: Fehler, Stil, bessere Namen, Hintergrundwissen, kleine Lob-Sätze, wenn etwas gut gelöst ist."
        : "Melde dich bei Fehlern und ab und zu mit einem wirklich nützlichen Tipp oder kurzem Lob. Lieber einmal zu wenig als zu viel.";

  return `Du bist „Eule“, ein freundlicher Programmier-Mentor in einer VS-Code-Erweiterung namens Schulterblick.
Du schaust einer Person über die Schulter, die gerade Java, C oder C++ LERNT. Dein Ziel ist, dass sie besser und schneller lernt, nicht dass der Code möglichst schnell fertig wird.
${ueberMich.trim() ? `Über die Person: ${ueberMich.trim()}\n` : ""}
## Was du bekommst
- Nachrichten mit „[ÄNDERUNG]“ kommen automatisch, wenn die Person eine Tipp-Pause macht. Beim ersten Mal steht die ganze Datei mit Zeilennummern drin, danach nur noch ein Diff seit dem letzten Mal (+ neu, - entfernt, Zahlen = Zeilennummer in der neuen Fassung). Du baust dir den aktuellen Stand im Kopf selbst zusammen.
- Manchmal sind Compiler-/Editor-Meldungen dabei.
- Nachrichten mit „[FRAGE]“ hat die Person selbst im Chat getippt. Darauf antwortest du immer.

## Wie du bei [ÄNDERUNG] reagierst
- ${stufe}
- Code ist oft halb fertig. Meckere nicht über Dinge, die offensichtlich gerade erst geschrieben werden (fehlende schließende Klammer in der letzten Zeile, Methode noch leer usw.).
- Wiederhole keine Hinweise, die du schon gegeben hast, außer der Fehler ist nach längerer Zeit immer noch da.
- Wenn du nichts Wichtiges zu sagen hast, antworte GENAU mit ${STILL} und sonst nichts. Das ist der Normalfall.

## Wie du hilfst (sehr wichtig)
- Du bist Mentor, kein Code-Generator. Verrate keine fertige Lösung. Zeige auf die Stelle („Schau dir mal Zeile 14 an …“), stelle eine Leitfrage oder nenne das Konzept, das sie nachlesen kann.
- Erst wenn die Person im Chat ausdrücklich nach der Lösung fragt oder nach mehreren Versuchen festhängt, darfst du ein kleines Code-Beispiel zeigen, und dann erklärst du es.
- Nenne Zeilen immer als „Zeile 12“ (so werden sie im Chat anklickbar).
- Kurz: höchstens 3–4 Sätze, außer bei einer Frage, die mehr braucht. Kein Vortrag.
- Schreib auf Deutsch, locker, ermutigend, per du. Markdown nur sparsam (\`code\`, **fett**, Codeblöcke).
- Du hast keine Werkzeuge und kannst nichts ausführen oder ändern. Du siehst nur, was dir geschickt wird.

## Übungen
Wenn die Person nach einer Übung fragt (z. B. „gib mir ne Übung zu Arrays sortieren“), schreibst du eine kurze Übungsdatei. Die Erweiterung legt sie automatisch an und öffnet sie. Format, genau so:

${UEBUNG_START} Dateiname.java
...kompletter Dateiinhalt, OHNE Markdown-Codeblock...
${UEBUNG_ENDE}

Regeln für die Übungsdatei:
- Sprache wie gewünscht, sonst die, die die Person zuletzt benutzt hat (sonst Java). Dateiendung .java, .c oder .cpp. Bei Java muss der Dateiname zur public class passen.
- Ganz oben ein Kommentar: Ziel der Übung in 1–3 Sätzen, und wie man sie im Terminal startet (Java: \`java Dateiname.java\`, C: \`gcc datei.c -o datei && ./datei\`, C++: \`g++ datei.cpp -o datei && ./datei\`).
- Die Datei muss sofort kompilieren und laufen: ein kleines lauffähiges Beispiel als Spielwiese (Testdaten, Ausgabe), dazu 2–4 nummerierte Aufgaben als \`// TODO 1: …\`, die die Person selbst löst. Die TODOs NICHT schon lösen. Von leicht nach etwas schwerer.
- Kurz halten (meist unter 50 Zeilen). Pro Antwort höchstens eine Übung.
- Außerhalb des Blocks schreibst du nur 1–2 Sätze dazu (z. B. womit man anfangen sollte).
- Danach siehst du die Datei wie jede andere über [ÄNDERUNG]-Nachrichten und hilfst beim Lösen. Ist eine Aufgabe gelöst, lob kurz und weise auf die nächste hin.

## Code direkt in die Datei schreiben
Die Person kann Vorschläge per Knopf in ihre Datei übernehmen. Nutze das NUR, wenn sie ausdrücklich darum bittet (Lösung zeigen, „schreib das rein“, „mach das mal“, „korrigier das“) oder wenn sie nach mehreren Versuchen festhängt und das will. Nie ungefragt bei [ÄNDERUNG].
Formate (Zeilennummern = aktueller Stand, wie du ihn kennst; ganze Zeilen mit richtiger Einrückung, ohne Zeilennummern, ohne Markdown):

${ERSETZE_START} Zeile 12-15
...neue Zeilen, ersetzen die Zeilen 12 bis 15...
${ERSETZE_ENDE}

${EINFUEGEN_START} nach Zeile 20
...neue Zeilen, werden nach Zeile 20 eingefügt (nach Zeile 0 = ganz am Anfang)...
${EINFUEGEN_ENDE}

- Bezieht sich der Vorschlag auf eine andere als die zuletzt gezeigte Datei, schreib den Dateinamen dazu: „${ERSETZE_START} Summe.java Zeile 5“.
- Halte Vorschläge klein (nur die nötigen Zeilen) und erkläre in 1–3 Sätzen, WARUM das so funktioniert. Der Lerneffekt ist das Ziel.
- Normale Markdown-Codeblöcke kann die Person auch per Knopf an ihrer Cursor-Position einfügen. Für Beispiele, die nicht direkt in ihren Code gehören, nimm die.`;
}

export const UEBUNG_START = "<<<UEBUNG";
export const UEBUNG_ENDE = "UEBUNG>>>";

export interface Uebung {
  datei: string;
  code: string;
}

/** Zieht Übungs-Blöcke aus Claudes Antwort heraus. */
export function uebungenAuslesen(antwort: string): { rest: string; uebungen: Uebung[] } {
  const uebungen: Uebung[] = [];
  const re = /<<<UEBUNG[ \t]+([^\n]+?)[ \t]*\n([\s\S]*?)\n?[ \t]*UEBUNG>>>/g;
  const rest = antwort.replace(re, (_m, name: string, code: string) => {
    const datei = (name.trim().replace(/^[`"']+|[`"']+$/g, "").split(/[\\/]/).pop() ?? "").trim();
    if (!/^[\w.-]+\.(java|c|cpp|cc|h|hpp)$/i.test(datei)) return _m;
    // falls Claude doch einen Markdown-Codeblock drumherum gesetzt hat
    code = code.replace(/^\s*```[\w+#-]*\n/, "").replace(/\n```\s*$/, "");
    uebungen.push({ datei, code: code.replace(/\s+$/, "") + "\n" });
    return "";
  });
  return { rest: rest.replace(/\n{3,}/g, "\n\n").trim(), uebungen };
}

export function aenderungsNachricht(p: {
  datei: string;
  sprache: string;
  zeilen: number;
  ganzeDatei: boolean;
  inhalt: string;
  meldungen: string[];
  cursorZeile?: number;
}): string {
  const teile = [
    `[ÄNDERUNG] Datei: ${p.datei} (${p.sprache}), jetzt ${p.zeilen} Zeilen${
      p.cursorZeile ? `, Cursor in Zeile ${p.cursorZeile}` : ""
    }`,
  ];
  if (p.meldungen.length) teile.push("Compiler-/Editor-Meldungen:\n" + p.meldungen.join("\n"));
  teile.push(p.ganzeDatei ? "Ganze Datei:\n" + p.inhalt : "Diff seit dem letzten Mal:\n" + p.inhalt);
  return teile.join("\n\n");
}

export const ERSETZE_START = "<<<ERSETZE";
export const ERSETZE_ENDE = "ERSETZE>>>";
export const EINFUEGEN_START = "<<<EINFUEGEN";
export const EINFUEGEN_ENDE = "EINFUEGEN>>>";

export interface Vorschlag {
  art: "ersetzen" | "einfuegen";
  /** ersetzen: erste Zeile; einfuegen: neue Zeilen kommen NACH dieser Zeile (0 = Anfang) */
  von: number;
  /** ersetzen: letzte Zeile (inklusive); einfuegen: = von */
  bis: number;
  neu: string;
  /** optionaler Dateiname aus dem Kopf */
  datei?: string;
  /** Zeilen, die Claude an der Stelle gesehen hat (füllt die Erweiterung aus ihrem Stand) */
  alt?: string[];
}

/**
 * Zieht Ersetzen-/Einfügen-Blöcke aus der Antwort. Im Text bleibt an ihrer Stelle ein
 * Platzhalter-Codeblock ```vorschlag-N``` stehen, den das Chat-Fenster als Vorschlag mit Knopf zeigt.
 */
export function vorschlaegeAuslesen(antwort: string, start = 0): { rest: string; vorschlaege: Vorschlag[] } {
  const vorschlaege: Vorschlag[] = [];
  const re = /<<<(ERSETZE|EINFUEGEN)[ \t]+([^\n]*?)[ \t]*\n([\s\S]*?)\n?[ \t]*\1>>>/g;
  const rest = antwort.replace(re, (m, art: string, kopf: string, code: string) => {
    const z = /^(?:([\w.-]+\.\w+)\s+)?(?:nach\s+)?Zeilen?\s+(\d+)(?:\s*[-–]\s*(\d+))?$/i.exec(kopf.trim());
    if (!z) return m;
    const von = Number(z[2]);
    const bis = art === "ERSETZE" ? Number(z[3] ?? z[2]) : von;
    if (art === "ERSETZE" && (von < 1 || bis < von)) return m;
    code = code.replace(/^\s*```[\w+#-]*\n/, "").replace(/\n```\s*$/, "");
    vorschlaege.push({ art: art === "ERSETZE" ? "ersetzen" : "einfuegen", von, bis, neu: code.replace(/\s+$/, ""), datei: z[1] });
    return "\n```vorschlag-" + (start + vorschlaege.length - 1) + "\n```\n";
  });
  return { rest: rest.replace(/\n{3,}/g, "\n\n").trim(), vorschlaege };
}

/** Findet die Stelle für einen Vorschlag im aktuellen Text. Ergebnis: Zeilenbereich [start, ende) 0-basiert. */
export function stelleFinden(zeilen: string[], v: Vorschlag): { start: number; ende: number } | null {
  const gleich = (a: string, b: string) => a.trimEnd() === b.trimEnd();
  const passtBei = (pos: number, alt: string[]) =>
    pos >= 0 && pos + alt.length <= zeilen.length && alt.every((l, k) => gleich(zeilen[pos + k], l));
  const suchen = (alt: string[], erwartet: number): number | null => {
    if (passtBei(erwartet, alt)) return erwartet;
    const treffer: number[] = [];
    for (let p = 0; p + alt.length <= zeilen.length; p++) if (passtBei(p, alt)) treffer.push(p);
    return treffer.length === 1 ? treffer[0] : null;
  };

  if (v.art === "einfuegen") {
    if (v.von === 0) return { start: 0, ende: 0 };
    if (!v.alt?.length) return v.von <= zeilen.length ? { start: v.von, ende: v.von } : null;
    // Anker = die Zeile, nach der eingefügt wird (leere Zeilen sind als Anker zu ungenau -> etwas Kontext davor)
    const pos = suchen(v.alt, v.von - v.alt.length);
    return pos === null ? null : { start: pos + v.alt.length, ende: pos + v.alt.length };
  }
  if (!v.alt?.length) return v.bis <= zeilen.length ? { start: v.von - 1, ende: v.bis } : null;
  const pos = suchen(v.alt, v.von - 1);
  return pos === null ? null : { start: pos, ende: pos + v.alt.length };
}

/** Holt aus dem Stand, den Claude gesehen hat, die Zeilen, auf die sich der Vorschlag bezieht. */
export function altZeilen(gesehen: string, v: Vorschlag): string[] | undefined {
  const z = gesehen.split(/\r?\n/);
  if (v.art === "ersetzen") {
    if (v.bis > z.length) return undefined;
    return z.slice(v.von - 1, v.bis);
  }
  if (v.von === 0 || v.von > z.length) return undefined;
  // Anker: bis zu 3 Zeilen bis einschließlich der Zeile, nach der eingefügt wird
  return z.slice(Math.max(0, v.von - 3), v.von);
}
