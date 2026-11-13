// Anbindung an die Claude-Code-CLI. Alle Anfragen laufen über EINE Sitzung
// (--session-id beim ersten Mal, danach --resume), dadurch kennt Claude den
// bisherigen Code und das bisherige Gespräch und bekommt nur noch Diffs.
// Kein Import von "vscode", damit sich das auch ohne VS Code testen lässt.

import { spawn } from "child_process";
import { randomUUID } from "crypto";

export interface MentorOptionen {
  claudePfad: string;
  modell: string;
  arbeitsordner: string;
  systemPromptDatei: string;
}

export interface MentorZustand {
  sessionId: string;
  gestartet: boolean;
}

export class Mentor {
  private kette: Promise<unknown> = Promise.resolve();
  private laufend = 0;

  constructor(
    private opt: () => MentorOptionen,
    public zustand: MentorZustand,
    private zustandGeaendert: (z: MentorZustand) => void,
  ) {}

  get beschaeftigt(): boolean {
    return this.laufend > 0;
  }

  neueSitzung(): void {
    this.zustand = { sessionId: randomUUID(), gestartet: false };
    this.zustandGeaendert(this.zustand);
  }

  /** Stellt eine Anfrage in die Warteschlange (immer nur eine gleichzeitig). */
  fragen(prompt: string): Promise<string> {
    this.laufend++;
    const p = this.kette.then(() => this.ausfuehren(prompt, true));
    this.kette = p.catch(() => undefined).finally(() => this.laufend--);
    return p;
  }

  private async ausfuehren(prompt: string, nochmalErlaubt: boolean): Promise<string> {
    const o = this.opt();
    const args = [
      "-p",
      "--output-format", "json",
      "--tools", "",
      "--system-prompt-file", o.systemPromptDatei,
    ];
    if (o.modell.trim()) args.push("--model", o.modell.trim());
    args.push(this.zustand.gestartet ? "--resume" : "--session-id", this.zustand.sessionId);

    try {
      const antwort = await aufrufen(o.claudePfad, args, prompt, o.arbeitsordner);
      if (!this.zustand.gestartet) {
        this.zustand = { ...this.zustand, gestartet: true };
        this.zustandGeaendert(this.zustand);
      }
      return antwort;
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      // Sitzung weg (gelöscht/anderer Rechner) oder ID schon vergeben -> neu anfangen
      if (nochmalErlaubt && /no conversation found|already in use/i.test(msg)) {
        this.neueSitzung();
        return this.ausfuehren(prompt, false);
      }
      throw e;
    }
  }
}

function quoteWin(a: string): string {
  if (a === "") return '""';
  return /[\s"&|<>^()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a;
}

function aufrufen(befehl: string, args: string[], stdin: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const win = process.platform === "win32";
    // Unter Windows ist "claude" ein .cmd-Skript, das braucht eine Shell.
    const kind = win
      ? spawn(quoteWin(befehl), args.map(quoteWin), { cwd, shell: true, windowsHide: true })
      : spawn(befehl, args, { cwd });

    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      kind.kill();
      reject(new Error("Claude hat nach 3 Minuten nicht geantwortet."));
    }, 180_000);

    kind.stdout.on("data", (d) => (out += d));
    kind.stderr.on("data", (d) => (err += d));
    kind.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        new Error(
          e.code === "ENOENT"
            ? `Claude-CLI nicht gefunden („${befehl}“). Ist Claude Code installiert? Sonst Einstellung schulterblick.claudePfad setzen.`
            : e.message,
        ),
      );
    });
    kind.on("close", (code) => {
      clearTimeout(timer);
      let json: { result?: string; is_error?: boolean } | undefined;
      try {
        json = JSON.parse(out.trim().split("\n").pop() ?? "");
      } catch {
        /* kein JSON */
      }
      if (json && !json.is_error && typeof json.result === "string") {
        resolve(json.result.trim());
      } else {
        const grund = (json?.result || err || out || `Exit-Code ${code}`).trim();
        reject(new Error(grund.slice(0, 500)));
      }
    });

    kind.stdin.end(stdin, "utf8");
  });
}
