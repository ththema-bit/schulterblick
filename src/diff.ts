// Kleiner Zeilen-Diff ohne Abhängigkeiten.
// Ausgabeformat (für Claude gedacht, Zeilennummern = neue Datei):
//   @@ um Zeile 12 @@
//      11| unverändert
//   -    | entfernt
//   +  12| neu

export interface DiffErgebnis {
  text: string;
  geaenderteZeilen: number;
}

type Op = { t: " " | "+" | "-"; text: string; neu: number };

const MAX_ZELLEN = 4_000_000;

/** Liefert null, wenn der Diff zu groß wäre (dann lieber ganze Datei schicken). */
export function zeilenDiff(alt: string, neu: string, kontext = 2): DiffErgebnis | null {
  const a = alt.split(/\r?\n/);
  const b = neu.split(/\r?\n/);

  // gemeinsamen Anfang und gemeinsames Ende abschneiden
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endeA = a.length;
  let endeB = b.length;
  while (endeA > start && endeB > start && a[endeA - 1] === b[endeB - 1]) {
    endeA--;
    endeB--;
  }

  const ma = a.slice(start, endeA);
  const mb = b.slice(start, endeB);
  if (ma.length === 0 && mb.length === 0) return { text: "", geaenderteZeilen: 0 };
  if ((ma.length + 1) * (mb.length + 1) > MAX_ZELLEN) return null;

  // LCS-Tabelle von hinten
  const n = ma.length;
  const m = mb.length;
  const breite = m + 1;
  const lcs = new Uint32Array((n + 1) * breite);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * breite + j] =
        ma[i] === mb[j]
          ? lcs[(i + 1) * breite + j + 1] + 1
          : Math.max(lcs[(i + 1) * breite + j], lcs[i * breite + j + 1]);
    }
  }

  const ops: Op[] = [];
  for (let k = 0; k < start; k++) ops.push({ t: " ", text: b[k], neu: k + 1 });
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && ma[i] === mb[j]) {
      ops.push({ t: " ", text: mb[j], neu: start + j + 1 });
      i++;
      j++;
    } else if (i < n && (j >= m || lcs[(i + 1) * breite + j] >= lcs[i * breite + j + 1])) {
      // entfernte Zeilen zuerst, dann die neuen (liest sich natürlicher)
      ops.push({ t: "-", text: ma[i], neu: start + j });
      i++;
    } else {
      ops.push({ t: "+", text: mb[j], neu: start + j + 1 });
      j++;
    }
  }
  for (let k = endeB; k < b.length; k++) ops.push({ t: " ", text: b[k], neu: k + 1 });

  // Hunks mit Kontext bilden
  const zeigen = new Array<boolean>(ops.length).fill(false);
  let geaendert = 0;
  ops.forEach((op, idx) => {
    if (op.t === " ") return;
    geaendert++;
    for (let k = Math.max(0, idx - kontext); k <= Math.min(ops.length - 1, idx + kontext); k++) {
      zeigen[k] = true;
    }
  });

  const breiteNr = String(b.length).length;
  const zeilen: string[] = [];
  let imHunk = false;
  ops.forEach((op, idx) => {
    if (!zeigen[idx]) {
      imHunk = false;
      return;
    }
    if (!imHunk) {
      zeilen.push(`@@ um Zeile ${Math.max(1, op.neu)} @@`);
      imHunk = true;
    }
    const nr = op.t === "-" ? " ".repeat(breiteNr) : String(op.neu).padStart(breiteNr);
    zeilen.push(`${op.t === " " ? " " : op.t} ${nr}| ${op.text}`);
  });

  return { text: zeilen.join("\n"), geaenderteZeilen: geaendert };
}

/** Ganze Datei mit Zeilennummern. */
export function mitZeilennummern(text: string): string {
  const z = text.split(/\r?\n/);
  const w = String(z.length).length;
  return z.map((l, i) => `${String(i + 1).padStart(w)}| ${l}`).join("\n");
}
