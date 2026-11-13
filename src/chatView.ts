import * as vscode from "vscode";
import { randomBytes } from "crypto";

export type Rolle = "mentor" | "ich" | "info" | "fehler";
export type Stimmung = "wach" | "denkt" | "schlaeft";

export interface ChatNachricht {
  rolle: Rolle;
  text: string;
  /** URI der Datei, auf die sich "Zeile N" bezieht */
  datei?: string;
  dateiName?: string;
  zeit: number;
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
    private onFrage: (text: string) => void,
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

  private async empfangen(m: { typ: string; text?: string; datei?: string; zeile?: number; befehl?: string }) {
    if (m.typ === "bereit") {
      this.view?.webview.postMessage({ typ: "alles", verlauf: this.verlauf, stimmung: this.stimmung });
      this.gelesen();
    } else if (m.typ === "befehl" && m.befehl?.startsWith("schulterblick.")) {
      void vscode.commands.executeCommand(m.befehl);
    } else if (m.typ === "frage" && m.text?.trim()) {
      this.onFrage(m.text.trim());
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
  function md(text, datei) {
    const bloecke = [];
    let s = text.replace(/\`\`\`[\\w+#-]*\\n?([\\s\\S]*?)\`\`\`/g, (m, code) => { bloecke.push(code.replace(/\\n$/, '')); return '\\u0000' + (bloecke.length - 1) + '\\u0000'; });
    s = esc(s)
      .replace(/\`([^\`\\n]+)\`/g, '<code>$1</code>')
      .replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<b>$1</b>');
    s = zeilenLinks(s, datei);
    s = s.replace(/\\u0000(\\d+)\\u0000\\n?/g, (m, i) => '<pre><code>' + esc(bloecke[+i]) + '</code></pre>');
    return s;
  }
  function anzeigen(n, animiert) {
    leer.style.display = 'none';
    const d = document.createElement('div');
    d.className = 'msg ' + n.rolle;
    let html = '';
    if (n.rolle === 'mentor' && n.dateiName) html += '<span class="datei">' + esc(n.dateiName) + '</span>';
    html += (n.rolle === 'mentor' || n.rolle === 'ich') ? md(n.text, n.datei) : esc(n.text);
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
