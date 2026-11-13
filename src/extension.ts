import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { ChatView } from "./chatView";
import { Mentor, MentorZustand } from "./mentor";
import { zeilenDiff, mitZeilennummern } from "./diff";
import { STILL, Uebung, aenderungsNachricht, systemPrompt, uebungenAuslesen } from "./prompts";

/** Ist der Diff länger als dieser Anteil der Datei, schicken wir lieber die ganze Datei. */
const GANZE_DATEI_AB_DIFF_ANTEIL = 1.0;
const MAX_DATEI_ZEICHEN = 60_000;

let instanz: Schulterblick | undefined;

export function activate(ctx: vscode.ExtensionContext) {
  instanz = new Schulterblick(ctx);
  // kleine API, damit der Integrationstest Chat-Fragen stellen kann
  return { frage: (text: string) => instanz!.frage(text) };
}

export function deactivate() {
  instanz?.dispose();
}

class Schulterblick implements vscode.Disposable {
  private chat: ChatView;
  private mentor: Mentor;
  private statusItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  /** Stand der Datei, den Claude zuletzt gesehen hat (URI -> Text). */
  private gesehen = new Map<string, string>();
  /** Geänderte Zeichen seit dem letzten Blick (URI -> Anzahl). */
  private offen = new Map<string, number>();
  private timer?: NodeJS.Timeout;
  private blickLaeuft = false;
  private blickNochmal = false;
  private systemPromptDatei: string;

  constructor(private ctx: vscode.ExtensionContext) {
    const speicher = ctx.globalStorageUri.fsPath;
    fs.mkdirSync(speicher, { recursive: true });
    this.systemPromptDatei = path.join(speicher, "mentor-prompt.md");
    this.promptSchreiben();

    const zustand = ctx.workspaceState.get<MentorZustand>("sitzung") ?? {
      sessionId: randomUUID(),
      gestartet: false,
    };
    this.mentor = new Mentor(
      () => ({
        claudePfad: this.cfg().get("claudePfad", "claude"),
        modell: this.cfg().get("modell", "sonnet"),
        // eigener Ordner, damit die Mentor-Sitzungen nicht zwischen deinen
        // normalen Claude-Code-Sitzungen im Projekt auftauchen
        arbeitsordner: speicher,
        systemPromptDatei: this.systemPromptDatei,
      }),
      zustand,
      (z) => void ctx.workspaceState.update("sitzung", z),
    );
    // Neue VS-Code-Sitzung: Claude kennt die Sitzung noch, aber wir wissen nicht,
    // welchen Stand er gesehen hat -> beim ersten Blick die ganze Datei schicken.

    this.chat = new ChatView(ctx, (t) => void this.frage(t));

    this.statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusItem.command = "schulterblick.modusUmschalten";
    this.statusAktualisieren();
    this.statusItem.show();

    this.disposables.push(
      vscode.window.registerWebviewViewProvider(ChatView.id, this.chat, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
      vscode.workspace.onDidChangeTextDocument((e) => this.geaendert(e)),
      vscode.workspace.onDidCloseTextDocument((d) => {
        this.offen.delete(d.uri.toString());
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("schulterblick")) this.promptSchreiben();
        if (e.affectsConfiguration("schulterblick.modus")) this.modusAnzeigen();
      }),
      vscode.commands.registerCommand("schulterblick.jetztPruefen", () => this.jetztPruefen()),
      vscode.commands.registerCommand("schulterblick.modusUmschalten", () => this.modusUmschalten()),
      vscode.commands.registerCommand("schulterblick.neueUebung", () => this.neueUebung()),
      vscode.commands.registerCommand("schulterblick.neueSitzung", () => this.neueSitzung()),
      this.statusItem,
    );
  }

  dispose() {
    clearTimeout(this.timer);
    this.disposables.forEach((d) => d.dispose());
  }

  private get live(): boolean {
    return this.cfg().get<string>("modus", "live") !== "aufFrage";
  }

  private cfg() {
    return vscode.workspace.getConfiguration("schulterblick");
  }

  private promptSchreiben() {
    fs.writeFileSync(
      this.systemPromptDatei,
      systemPrompt(this.cfg().get("gespraechigkeit", "normal"), this.cfg().get("ueberMich", "")),
      "utf8",
    );
  }

  private relevant(doc: vscode.TextDocument): boolean {
    const sprachen = this.cfg().get<string[]>("sprachen", ["java", "c", "cpp"]);
    return sprachen.includes(doc.languageId) && (doc.uri.scheme === "file" || doc.uri.scheme === "untitled");
  }

  // ---------- Änderungen sammeln, auf Pause warten ----------

  private geaendert(e: vscode.TextDocumentChangeEvent) {
    if (!this.relevant(e.document) || e.contentChanges.length === 0) return;
    const menge = e.contentChanges.reduce((s, c) => s + Math.max(c.text.length, c.rangeLength), 0);
    const key = e.document.uri.toString();
    this.offen.set(key, (this.offen.get(key) ?? 0) + menge);

    // Timer bei jedem Tastendruck neu starten -> feuert erst nach einer Pause
    clearTimeout(this.timer);
    if (!this.live) return;
    const ms = Math.max(2, this.cfg().get("pauseSekunden", 8)) * 1000;
    this.timer = setTimeout(() => void this.blick(false), ms);
  }

  /** Schaut auf alle Dateien mit genug offenen Änderungen. */
  private async blick(erzwingen: boolean) {
    if (this.blickLaeuft) {
      this.blickNochmal = true;
      return;
    }
    const min = this.cfg().get("minZeichen", 40);
    const kandidaten = vscode.workspace.textDocuments.filter((d) => {
      if (!this.relevant(d)) return false;
      const n = this.offen.get(d.uri.toString()) ?? 0;
      return erzwingen ? n > 0 || !this.gesehen.has(d.uri.toString()) : n >= min;
    });
    if (erzwingen && kandidaten.length === 0) {
      const aktiv = vscode.window.activeTextEditor?.document;
      if (aktiv && this.relevant(aktiv)) kandidaten.push(aktiv);
    }
    if (kandidaten.length === 0) return;

    this.blickLaeuft = true;
    try {
      for (const doc of kandidaten) await this.dokumentZeigen(doc, erzwingen);
    } finally {
      this.blickLaeuft = false;
    }
    if (this.blickNochmal) {
      this.blickNochmal = false;
      void this.blick(false);
    }
  }

  /** Baut die [ÄNDERUNG]-Nachricht (oder null, wenn sich nichts geändert hat). */
  private aenderungFuer(doc: vscode.TextDocument, erzwingen: boolean): string | null {
    const key = doc.uri.toString();
    const text = doc.getText();
    const vorher = this.gesehen.get(key);

    let ganz = vorher === undefined;
    let inhalt = "";
    if (!ganz) {
      const d = zeilenDiff(vorher!, text);
      if (d && d.geaenderteZeilen === 0) {
        if (!erzwingen) return null;
        inhalt = "(keine Änderung seit dem letzten Mal, bitte nochmal genau hinschauen)";
      } else if (!d || d.text.length > text.length * GANZE_DATEI_AB_DIFF_ANTEIL) {
        ganz = true;
      } else {
        inhalt = d.text;
      }
    }
    if (ganz) {
      if (text.length > MAX_DATEI_ZEICHEN) {
        inhalt = mitZeilennummern(text.slice(0, MAX_DATEI_ZEICHEN)) + "\n… (Rest abgeschnitten, Datei zu groß)";
      } else {
        inhalt = mitZeilennummern(text);
      }
    }

    const meldungen = vscode.languages
      .getDiagnostics(doc.uri)
      .filter((d) => d.severity <= vscode.DiagnosticSeverity.Warning)
      .slice(0, 15)
      .map((d) => {
        const art = d.severity === vscode.DiagnosticSeverity.Error ? "Fehler" : "Warnung";
        return `- Zeile ${d.range.start.line + 1}: ${art}: ${d.message.split("\n")[0]}`;
      });

    const editor = vscode.window.visibleTextEditors.find((e) => e.document === doc);
    return aenderungsNachricht({
      datei: vscode.workspace.asRelativePath(doc.uri),
      sprache: doc.languageId,
      zeilen: doc.lineCount,
      ganzeDatei: ganz,
      inhalt,
      meldungen,
      cursorZeile: editor ? editor.selection.active.line + 1 : undefined,
    });
  }

  private async dokumentZeigen(doc: vscode.TextDocument, erzwingen: boolean) {
    const key = doc.uri.toString();
    const nachricht = this.aenderungFuer(doc, erzwingen);
    // ab hier gilt dieser Stand als "gesehen"
    const text = doc.getText();
    this.offen.set(key, 0);
    if (!nachricht) return;
    const vorher = this.gesehen.get(key);
    this.gesehen.set(key, text);

    const antwort = await this.senden(nachricht, erzwingen ? "\n\n(Die Person hat ausdrücklich um einen Blick gebeten, sag also auf jeden Fall kurz etwas.)" : "");
    if (antwort === undefined) {
      // fehlgeschlagen -> beim nächsten Mal wieder vom alten Stand aus
      if (vorher === undefined) this.gesehen.delete(key);
      else this.gesehen.set(key, vorher);
      return;
    }
    if (istStill(antwort)) return;
    this.mentorSagt(antwort, doc);
  }

  // ---------- Chat ----------

  async frage(text: string) {
    this.chat.hinzufuegen({ rolle: "ich", text });
    // aktuellen Stand der aktiven Datei mitschicken, damit Claude weiß, worum es geht
    const doc = vscode.window.activeTextEditor?.document;
    let kontext = "";
    if (doc && this.relevant(doc)) {
      const n = this.aenderungFuer(doc, false);
      if (n) {
        kontext = n + "\n\n";
        this.gesehen.set(doc.uri.toString(), doc.getText());
        this.offen.set(doc.uri.toString(), 0);
      }
    }
    const antwort = await this.senden(`${kontext}[FRAGE] ${text}`, "");
    if (antwort === undefined) return;
    const { rest, uebungen } = uebungenAuslesen(antwort);
    let zielDoc = doc;
    const geoeffnet: string[] = [];
    for (const u of uebungen) {
      const neu = await this.uebungAnlegen(u);
      if (neu) {
        zielDoc = neu;
        geoeffnet.push(path.basename(neu.uri.fsPath));
      }
    }
    if (rest || uebungen.length === 0) {
      this.mentorSagt(rest && !istStill(rest) ? rest : "Hm, dazu fällt mir gerade nichts ein. Magst du die Frage anders stellen?", zielDoc);
    }
    for (const name of geoeffnet) this.chat.hinzufuegen({ rolle: "info", text: `Übung geöffnet: ${name}` });
  }

  private async senden(prompt: string, zusatz: string): Promise<string | undefined> {
    this.chat.setzeStimmung("denkt");
    this.statusAktualisieren(true);
    try {
      return await this.mentor.fragen(prompt + zusatz);
    } catch (e) {
      this.chat.hinzufuegen({ rolle: "fehler", text: `Konnte Claude nicht fragen: ${(e as Error).message}` });
      return undefined;
    } finally {
      if (!this.mentor.beschaeftigt) {
        this.chat.setzeStimmung(this.live ? "wach" : "schlaeft");
        this.statusAktualisieren(false);
      }
    }
  }

  private mentorSagt(text: string, doc?: vscode.TextDocument) {
    this.chat.hinzufuegen({
      rolle: "mentor",
      text,
      datei: doc?.uri.toString(),
      dateiName: doc ? path.basename(doc.uri.fsPath) : undefined,
    });
    if (!this.chat.sichtbar && this.cfg().get("benachrichtigen", true)) {
      const kurz = text.replace(/```[\s\S]*?```/g, "[Code]").replace(/\s+/g, " ").trim();
      void vscode.window
        .showInformationMessage(`🦉 ${kurz.length > 140 ? kurz.slice(0, 137) + "…" : kurz}`, "Öffnen")
        .then((w) => w && this.chat.zeigen());
    }
  }

  // ---------- Befehle ----------

  private jetztPruefen() {
    this.chat.zeigen();
    void this.blick(true);
  }

  private async modusUmschalten() {
    await this.cfg().update("modus", this.live ? "aufFrage" : "live", vscode.ConfigurationTarget.Global);
    // modusAnzeigen() kommt über onDidChangeConfiguration
  }

  private modusAnzeigen() {
    if (!this.live) clearTimeout(this.timer);
    this.chat.setzeStimmung(this.mentor.beschaeftigt ? "denkt" : this.live ? "wach" : "schlaeft");
    this.chat.hinzufuegen({
      rolle: "info",
      text: this.live ? "Live-Modus: Ich schaue in deinen Tipp-Pausen mit." : "Nur auf Frage: Ich melde mich nur, wenn du mich fragst.",
    });
    this.statusAktualisieren();
  }

  private async neueUebung() {
    const thema = await vscode.window.showInputBox({
      title: "Neue Übung",
      prompt: "Wozu willst du üben? (Sprache gern dazu schreiben)",
      placeHolder: "z. B. Arrays sortieren in Java",
    });
    if (!thema?.trim()) return;
    this.chat.zeigen();
    await this.frage(`Gib mir eine Übung zu: ${thema.trim()}`);
  }

  private uebungsOrdner(): string {
    const eigen = this.cfg().get("uebungsOrdner", "").trim();
    if (eigen) return eigen;
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (ws && ws.uri.scheme === "file") return path.join(ws.uri.fsPath, "schulterblick-uebungen");
    return path.join(this.ctx.globalStorageUri.fsPath, "uebungen");
  }

  /** Schreibt die Übung in den Sandbox-Ordner und öffnet sie. */
  private async uebungAnlegen(u: Uebung): Promise<vscode.TextDocument | undefined> {
    const ordner = this.uebungsOrdner();
    try {
      fs.mkdirSync(ordner, { recursive: true });
      const ext = path.extname(u.datei);
      const basis = path.basename(u.datei, ext);
      let ziel = path.join(ordner, u.datei);
      const code = u.code;
      // nichts überschreiben: Ordner pro Übung ist bei Java nötig, weil Klassenname = Dateiname
      if (fs.existsSync(ziel)) {
        let i = 2;
        while (fs.existsSync(path.join(ordner, `${basis}_${i}`, u.datei))) i++;
        const unter = path.join(ordner, `${basis}_${i}`);
        fs.mkdirSync(unter, { recursive: true });
        ziel = path.join(unter, u.datei);
      }
      fs.writeFileSync(ziel, code, "utf8");
      const doc = await vscode.workspace.openTextDocument(ziel);
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
      // Claude hat die Datei selbst geschrieben, kennt also genau diesen Stand
      this.gesehen.set(doc.uri.toString(), doc.getText());
      this.offen.set(doc.uri.toString(), 0);
      return doc;
    } catch (e) {
      this.chat.hinzufuegen({ rolle: "fehler", text: `Übung konnte nicht angelegt werden: ${(e as Error).message}` });
      return undefined;
    }
  }

  private neueSitzung() {
    this.mentor.neueSitzung();
    this.gesehen.clear();
    this.chat.verlaufLeeren();
    this.chat.hinzufuegen({ rolle: "info", text: "Neue Sitzung – ich habe alles Bisherige vergessen." });
  }

  private statusAktualisieren(denkt = this.mentor?.beschaeftigt ?? false) {
    this.statusItem.text = denkt ? "$(loading~spin) Eule" : this.live ? "$(eye) Eule: live" : "$(comment) Eule: auf Frage";
    this.statusItem.tooltip = this.live
      ? "Schulterblick schaut live mit – klicken für „Nur auf Frage“"
      : "Schulterblick hilft nur auf Frage – klicken für Live-Modus";
  }
}

function istStill(antwort: string): boolean {
  const a = antwort.trim();
  return a === "" || a === STILL || (a.includes(STILL) && a.length < STILL.length + 15);
}
