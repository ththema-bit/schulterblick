import * as vscode from "vscode";
import { randomBytes } from "crypto";
import type { Vorschlag } from "./prompts";

export type Rolle = "mentor" | "ich" | "info" | "fehler";
export type Stimmung = "wach" | "denkt" | "schlaeft";

export interface ChatNachricht {
  rolle: Rolle;
  text: string;
  /** URI der Datei, auf die sich "Zeile N" bezieht */
  datei?: string;
  dateiName?: string;
  /** Änderungsvorschläge zum Übernehmen in die Datei */
  vorschlaege?: Vorschlag[];
  /** Indizes der schon übernommenen Vorschläge */
  uebernommen?: number[];
  zeit: number;
}

export interface ChatAktionen {
  frage(text: string): void;
  einfuegen(code: string): void;
  uebernehmen(n: ChatNachricht, index: number): Promise<boolean>;
}

const MAX_VERLAUF = 150;

export class ChatView implements vscode.WebviewViewProvider {
  static readonly id = "schulterblick.chat";
  private view?: vscode.WebviewView;
  private verlauf: ChatNachricht[];
  private ungelesen = 0;
  private stimmung: Stimmung = "wach";

  constructor(
    private ctx: vscode.ExtensionContext,
    private aktionen: ChatAktionen,
  ) {
    this.verlauf = ctx.workspaceState.get<ChatNachricht[]>("verlauf", []);
  }

  get sichtbar(): boolean {
    return !!this.view?.visible;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();
    view.webview.onDidReceiveMessage((m) => this.empfangen(m));
    view.onDidChangeVisibility(() => {
      if (view.visible) this.gelesen();
    });
    view.onDidDispose(() => (this.view = undefined));
  }

  hinzufuegen(n: Omit<ChatNachricht, "zeit">): void {
    const nachricht = { ...n, zeit: Date.now() };
    this.verlauf.push(nachricht);
    if (this.verlauf.length > MAX_VERLAUF) this.verlauf.splice(0, this.verlauf.length - MAX_VERLAUF);
    void this.ctx.workspaceState.update("verlauf", this.verlauf);
    this.view?.webview.postMessage({ typ: "nachricht", nachricht });
    if (n.rolle === "mentor" && !this.sichtbar) {
      this.ungelesen++;
      this.badge();
    }
  }

  /** Letzte Nachricht mit Vorschlägen (für den Integrationstest). */
  letzteMitVorschlag(): ChatNachricht | undefined {
    return [...this.verlauf].reverse().find((n) => n.vorschlaege?.length);
  }

  setzeStimmung(s: Stimmung): void {
    this.stimmung = s;
    this.view?.webview.postMessage({ typ: "stimmung", stimmung: s });
  }

  verlaufLeeren(): void {
    this.verlauf = [];
    void this.ctx.workspaceState.update("verlauf", this.verlauf);
    this.view?.webview.postMessage({ typ: "alles", verlauf: [], stimmung: this.stimmung });
  }

  zeigen(): void {
    void vscode.commands.executeCommand(`${ChatView.id}.focus`);
  }

  private gelesen(): void {
    this.ungelesen = 0;
    this.badge();
  }

  private badge(): void {
    if (!this.view) return;
    this.view.badge = this.ungelesen
      ? { value: this.ungelesen, tooltip: `${this.ungelesen} neue Hinweise` }
      : undefined;
  }

  private async empfangen(m: { typ: string; text?: string; datei?: string; zeile?: number; befehl?: string; zeit?: number; index?: number }) {
    if (m.typ === "bereit") {
      this.view?.webview.postMessage({ typ: "alles", verlauf: this.verlauf, stimmung: this.stimmung });
      this.gelesen();
    } else if (m.typ === "befehl" && m.befehl?.startsWith("schulterblick.")) {
      void vscode.commands.executeCommand(m.befehl);
    } else if (m.typ === "frage" && m.text?.trim()) {
      this.aktionen.frage(m.text.trim());
    } else if (m.typ === "einfuegen" && m.text) {
      this.aktionen.einfuegen(m.text);
    } else if (m.typ === "kopieren" && m.text) {
      await vscode.env.clipboard.writeText(m.text);
      void vscode.window.setStatusBarMessage("$(check) Code kopiert", 2000);
    } else if (m.typ === "uebernehmen" && m.zeit !== undefined && m.index !== undefined) {
      const n = this.verlauf.find((x) => x.zeit === m.zeit);
      if (!n?.vorschlaege?.[m.index]) return;
      if (await this.aktionen.uebernehmen(n, m.index)) {
        n.uebernommen = [...(n.uebernommen ?? []), m.index];
        void this.ctx.workspaceState.update("verlauf", this.verlauf);
        this.view?.webview.postMessage({ typ: "uebernommen", zeit: n.zeit, index: m.index });
      }
    } else if (m.typ === "springe" && m.zeile) {
      const uri = m.datei ? vscode.Uri.parse(m.datei) : vscode.window.activeTextEditor?.document.uri;
      if (!uri) return;
      const doc = await vscode.workspace.openTextDocument(uri);
      const zeile = Math.min(Math.max(0, m.zeile - 1), doc.lineCount - 1);
      const pos = new vscode.Position(zeile, doc.lineAt(zeile).firstNonWhitespaceCharacterIndex);
      await vscode.window.showTextDocument(doc, {
        selection: new vscode.Range(pos, pos),
        viewColumn: vscode.ViewColumn.One,
      });
    }
  }

  private html(): string {
    const nonce = randomBytes(16).toString("hex");
    return /* html */ `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { padding: 0; margin: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); display: flex; flex-direction: column; height: 100vh; }
  #kopf { display: flex; align-items: center; gap: 10px; padding: 10px 12px 6px; }
  #kopf .name { font-weight: 600; }
  #kopf .status { opacity: .7; font-size: .9em; }
  #liste { flex: 1; overflow-y: auto; padding: 4px 10px 10px; display: flex; flex-direction: column; gap: 8px; }
  .msg { padding: 7px 10px; border-radius: 10px; line-height: 1.45; max-width: 92%; word-wrap: break-word; white-space: pre-wrap; }
  .mentor { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border, transparent); align-self: flex-start; border-top-left-radius: 2px; }
  .ich { background: var(--vscode-button-background); color: var(--vscode-button-foreground); align-self: flex-end; border-top-right-radius: 2px; }
  .info { align-self: center; opacity: .65; font-size: .85em; text-align: center; }
  .fehler { align-self: stretch; color: var(--vscode-errorForeground); border: 1px solid var(--vscode-inputValidation-errorBorder, currentColor); font-size: .9em; }
  .datei { display: block; font-size: .8em; opacity: .6; margin-bottom: 2px; white-space: normal; }
  code { font-family: var(--vscode-editor-font-family); background: var(--vscode-textCodeBlock-background); padding: 0 3px; border-radius: 3px; }
  pre { background: var(--vscode-textCodeBlock-background); padding: 6px 8px; border-radius: 6px; overflow-x: auto; margin: 4px 0; white-space: pre; }
  pre code { background: none; padding: 0; }
  .block { margin: 6px 0; border: 1px solid var(--vscode-editorWidget-border, transparent); border-radius: 6px; overflow: hidden; white-space: normal; }
  .block pre { margin: 0; border-radius: 0; }
  .block .leiste { display: flex; gap: 4px; align-items: center; padding: 3px 6px; background: var(--vscode-editorGroupHeader-tabsBackground, rgba(128,128,128,.12)); font-size: .82em; }
  .block .leiste .titel { flex: 1; opacity: .75; }
  .block .leiste button { padding: 2px 7px; font-size: 1em; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  .block .leiste button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .block .leiste button.haupt { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  .block .leiste button.haupt:hover { background: var(--vscode-button-hoverBackground); }
  .block .leiste button:disabled { opacity: .6; cursor: default; }
  .vorschlag { border-color: var(--vscode-focusBorder); }
  .vorschlag pre code { color: var(--vscode-gitDecoration-addedResourceForeground, inherit); }
  a.zeile { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: underline dotted; }
  #leer { opacity: .6; text-align: center; margin-top: 20px; padding: 0 16px; line-height: 1.5; }
  form { display: flex; gap: 6px; padding: 8px 10px 10px; border-top: 1px solid var(--vscode-panel-border, transparent); }
  textarea { flex: 1; resize: none; min-height: 34px; max-height: 120px; font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 6px; padding: 6px 8px; }
  textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
  button { font: inherit; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: none; border-radius: 6px; padding: 0 12px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.klein { padding: 3px 8px; font-size: .85em; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button.klein:hover { background: var(--vscode-button-secondaryHoverBackground); }

  /* Eule */
  #eule { width: 44px; height: 44px; flex: none; }
  #eule .koerper { fill: #8a6a4a; } #eule .bauch { fill: #d9c3a1; }
  #eule .auge { fill: #fff; } #eule .pupille { fill: #222; transition: transform .3s; }
  #eule .lid { fill: #8a6a4a; transform-origin: center; transform: scaleY(0); transition: transform .25s; }
  #eule .schnabel { fill: #f0a830; }
  #eule.denkt .pupillen { animation: umschauen 1.6s ease-in-out infinite; }
  #eule.schlaeft .lid { transform: scaleY(1); }
  #eule.spricht { animation: hopsen .5s ease-out 2; }
  #eule.wach .lid { animation: blinzeln 5s infinite; }
  @keyframes umschauen { 0%,100% { transform: translateX(-1.5px); } 50% { transform: translateX(1.5px); } }
  @keyframes blinzeln { 0%,94%,100% { transform: scaleY(0); } 97% { transform: scaleY(1); } }
  @keyframes hopsen { 0%,100% { transform: translateY(0); } 40% { transform: translateY(-5px); } }
</style>
</head>
<body>
  <div id="kopf">
    <svg id="eule" class="wach" viewBox="0 0 48 48" aria-hidden="true">
      <path class="koerper" d="M10 10 L16 15 L32 15 L38 10 L38 34 C38 42 31 46 24 46 C17 46 10 42 10 34 Z"/>
      <ellipse class="bauch" cx="24" cy="35" rx="9" ry="9"/>
      <circle class="auge" cx="18" cy="22" r="6"/><circle class="auge" cx="30" cy="22" r="6"/>
      <g class="pupillen"><circle class="pupille" cx="18" cy="22" r="2.6"/><circle class="pupille" cx="30" cy="22" r="2.6"/></g>
      <rect class="lid" x="11.5" y="15.5" width="13" height="13" rx="6.5"/><rect class="lid" x="23.5" y="15.5" width="13" height="13" rx="6.5"/>
      <path class="schnabel" d="M21.5 27 L26.5 27 L24 31 Z"/>
    </svg>
    <div style="flex:1"><div class="name">Eule</div><div class="status" id="status">schaut zu</div></div>
    <button class="klein" id="modus" title="Live-Mitlesen oder nur auf Frage helfen">⇄ Modus</button>
    <button class="klein" id="uebung" title="Neue Übungsdatei zum Rumspielen">🎯 Übung</button>
  </div>
  <div id="liste"><div id="leer">Schreib einfach los in einer Java-, C- oder C++-Datei.<br>Wenn du kurz Pause machst, schaue ich drüber und melde mich, falls mir was auffällt.<br><br>Du kannst mich hier auch jederzeit etwas fragen, oder dir eine Übung geben lassen: „Gib mir ne Übung zu Arrays sortieren“.</div></div>
  <form id="form">
    <textarea id="eingabe" rows="1" placeholder="Frag die Eule … (Enter = senden)"></textarea>
    <button type="submit" title="Senden">➤</button>
  </form>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const liste = document.getElementById('liste');
  const leer = document.getElementById('leer');
  const eule = document.getElementById('eule');
  const status = document.getElementById('status');
  const eingabe = document.getElementById('eingabe');
  const STATUS = { wach: 'live – schaut dir zu', denkt: 'denkt nach …', schlaeft: 'hilft nur auf Frage' };

  function esc(s) { return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]); }
  function zeilenLinks(html, datei) {
    // "Zeile 12", "Zeilen 3–5", "Zeile 4 und 9" -> jede Zahl wird anklickbar
    return html.replace(/(Zeilen?\\s+)(\\d+(?:\\s*(?:[-–,]|und|bis)\\s*\\d+)*)/g, (m, wort, zahlen) =>
      wort + zahlen.replace(/\\d+/g, n => '<a class="zeile" data-zeile="' + n + '" data-datei="' + esc(datei || '') + '">' + n + '</a>'));
  }
  const codes = [];
  function codeBlock(code, titel, knoepfe, klasse) {
    codes.push(code);
    const id = codes.length - 1;
    return '<div class="block ' + (klasse || '') + '"><div class="leiste"><span class="titel">' + titel + '</span>' +
      knoepfe.map(k => '<button data-aktion="' + k[0] + '" data-code="' + id + '"' + (k[2] || '') + '>' + k[1] + '</button>').join('') +
      '</div><pre><code>' + esc(code) + '</code></pre></div>';
  }
  function vorschlagBlock(n, i) {
    const v = (n.vorschlaege || [])[i];
    if (!v) return '';
    const fertig = (n.uebernommen || []).includes(i);
    const titel = v.art === 'ersetzen'
      ? 'Ersetzt Zeile' + (v.bis > v.von ? 'n ' + v.von + '–' + v.bis : ' ' + v.von)
      : (v.von === 0 ? 'Einfügen am Anfang' : 'Einfügen nach Zeile ' + v.von);
    codes.push(v.neu);
    const id = codes.length - 1;
    return '<div class="block vorschlag"><div class="leiste"><span class="titel">' + esc((v.datei ? v.datei + ': ' : '') + titel) + '</span>' +
      '<button class="haupt" data-aktion="uebernehmen" data-zeit="' + n.zeit + '" data-index="' + i + '"' + (fertig ? ' disabled' : '') + '>' + (fertig ? '✔ übernommen' : '✔ Übernehmen') + '</button>' +
      '<button data-aktion="kopieren" data-code="' + id + '">⧉</button>' +
      '</div><pre><code>' + esc(v.neu) + '</code></pre></div>';
  }
  function md(text, datei, n) {
    const bloecke = [];
    let s = text.replace(/\`\`\`([\\w+#-]*)\\n?([\\s\\S]*?)\`\`\`/g, (m, info, code) => {
      const v = /^vorschlag-(\\d+)$/.exec(info);
      bloecke.push(v ? { vorschlag: +v[1] } : { code: code.replace(/\\n$/, '') });
      return '\\u0000' + (bloecke.length - 1) + '\\u0000';
    });
    s = esc(s)
      .replace(/\`([^\`\\n]+)\`/g, '<code>$1</code>')
      .replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<b>$1</b>');
    s = zeilenLinks(s, datei);
    s = s.replace(/\\n*\\u0000(\\d+)\\u0000\\n*/g, (m, i) => {
      const b = bloecke[+i];
      if (b.vorschlag !== undefined) return n ? vorschlagBlock(n, b.vorschlag) : '';
      if (!n || n.rolle !== 'mentor') return '<pre><code>' + esc(b.code) + '</code></pre>';
      return codeBlock(b.code, 'Code', [['einfuegen', '⤵ Einfügen', ' title="An der Cursor-Position im Editor einfügen"'], ['kopieren', '⧉ Kopieren']]);
    });
    return s;
  }
  function anzeigen(n, animiert) {
    leer.style.display = 'none';
    const d = document.createElement('div');
    d.className = 'msg ' + n.rolle;
    let html = '';
    if (n.rolle === 'mentor' && n.dateiName) html += '<span class="datei">' + esc(n.dateiName) + '</span>';
    html += (n.rolle === 'mentor' || n.rolle === 'ich') ? md(n.text, n.datei, n) : esc(n.text);
    d.innerHTML = html;
    liste.appendChild(d);
    liste.scrollTop = liste.scrollHeight;
    if (animiert && n.rolle === 'mentor') { eule.classList.remove('spricht'); void eule.offsetWidth; eule.classList.add('spricht'); }
  }
  function stimmung(s) {
    eule.classList.remove('wach', 'denkt', 'schlaeft');
    eule.classList.add(s);
    status.textContent = STATUS[s] || '';
  }
  liste.addEventListener('click', e => {
    const k = e.target.closest('button[data-aktion]');
    if (k) {
      const akt = k.dataset.aktion;
      if (akt === 'uebernehmen') { k.disabled = true; k.textContent = '…'; vscode.postMessage({ typ: 'uebernehmen', zeit: +k.dataset.zeit, index: +k.dataset.index }); setTimeout(() => { if (k.textContent === '…') { k.disabled = false; k.textContent = '✔ Übernehmen'; } }, 3000); }
      else vscode.postMessage({ typ: akt, text: codes[+k.dataset.code] });
      return;
    }
    const a = e.target.closest('a.zeile');
    if (a) vscode.postMessage({ typ: 'springe', zeile: +a.dataset.zeile, datei: a.dataset.datei || undefined });
  });
  function senden() {
    const t = eingabe.value.trim();
    if (!t) return;
    vscode.postMessage({ typ: 'frage', text: t });
    eingabe.value = '';
    eingabe.style.height = '';
  }
  document.getElementById('modus').addEventListener('click', () => vscode.postMessage({ typ: 'befehl', befehl: 'schulterblick.modusUmschalten' }));
  document.getElementById('uebung').addEventListener('click', () => vscode.postMessage({ typ: 'befehl', befehl: 'schulterblick.neueUebung' }));
  document.getElementById('form').addEventListener('submit', e => { e.preventDefault(); senden(); });
  eingabe.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); senden(); } });
  eingabe.addEventListener('input', () => { eingabe.style.height = ''; eingabe.style.height = Math.min(eingabe.scrollHeight, 120) + 'px'; });
  window.addEventListener('message', ev => {
    const m = ev.data;
    if (m.typ === 'nachricht') anzeigen(m.nachricht, true);
    else if (m.typ === 'stimmung') stimmung(m.stimmung);
    else if (m.typ === 'uebernommen') {
      const k = liste.querySelector('button[data-aktion="uebernehmen"][data-zeit="' + m.zeit + '"][data-index="' + m.index + '"]');
      if (k) { k.disabled = true; k.textContent = '✔ übernommen'; }
    }
    else if (m.typ === 'alles') {
      liste.querySelectorAll('.msg').forEach(x => x.remove());
      leer.style.display = m.verlauf.length ? 'none' : '';
      m.verlauf.forEach(n => anzeigen(n, false));
      stimmung(m.stimmung);
    }
  });
  vscode.postMessage({ typ: 'bereit' });
</script>
</body>
</html>`;
  }
}
