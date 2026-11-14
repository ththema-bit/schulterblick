<p align="center"><img src="media/icon.png" width="96" alt="Eule"></p>

# Schulterblick

VS-Code-Erweiterung: Claude schaut dir als Mentor „Eule“ beim Programmieren lernen über die Schulter (Java, C, C++).
Die Eule verrät keine fertigen Lösungen. Sie zeigt auf die Stelle, stellt eine Leitfrage oder nennt das Konzept.

## Was sie kann

- **Live-Modus:** Wenn du eine Pause machst (Standard: 8 s) und seit dem letzten Mal genug geändert hast (Standard: 40 Zeichen), bekommt Claude **nur den Diff** seit dem letzten Blick. Die Sitzung läuft durchgehend weiter (`claude -p --resume`), dadurch kennt Claude den Rest schon. Hat sie nichts Wichtiges zu sagen, bleibt sie still.
- **Nur auf Frage:** Sie meldet sich nur, wenn du im Chat fragst. Umschalten per Klick auf **„Eule“** in der Statusleiste oder **⇄ Modus** im Chat.
- **Chat in der Seitenleiste** (Eulen-Symbol): Fragen stellen, Erklärungen holen. Die aktuelle Datei wird automatisch mitgeschickt. „Zeile 12“ in Antworten ist anklickbar.
- **Übungen:** „Gib mir ne Übung zu Arrays sortieren“ (oder Knopf **🎯 Übung**). Die Eule schreibt eine kurze, sofort lauffähige Übungsdatei mit TODOs. Die Datei wird im Ordner `schulterblick-uebungen/` deines Projekts angelegt und geöffnet. Startbefehl steht oben drin, z. B. `java ArraySortieren.java` im Terminal.
- **Code direkt in den Editor:** Jeder Code-Block im Chat hat **⤵ Einfügen** (an deiner Cursor-Position, Einrückung wird angepasst) und **⧉ Kopieren**.
- **Änderungsvorschläge übernehmen:** Bittest du um die Lösung („korrigier das“, „schreib das rein“), schlägt die Eule eine Änderung für bestimmte Zeilen vor. **✔ Übernehmen** schreibt sie an die richtige Stelle, auch wenn du inzwischen weitergetippt hast und die Zeilen verrutscht sind. Die neuen Zeilen leuchten kurz auf, Strg+Z macht es rückgängig. Ungefragt macht die Eule das nicht, du sollst ja selbst lernen.
- Compiler-Fehler und Warnungen, die VS Code schon kennt, gehen mit an Claude.

## Voraussetzungen

- VS Code 1.90 oder neuer
- [Claude Code](https://claude.com/claude-code) installiert und angemeldet. Im Terminal muss `claude` funktionieren. Es läuft über dein Claude-Abo, ein API-Schlüssel ist nicht nötig.
- Für Java/C/C++ die üblichen Compiler (JDK 17+, gcc/g++)

## Installieren

Voraussetzung zum Bauen: Node.js 18 oder neuer.

```bash
npm install
```

```bash
npm run package
```

```bash
code --install-extension schulterblick-0.1.0.vsix
```

Oder in VS Code: Erweiterungen → `…` → „Aus VSIX installieren…“.

Zum Entwickeln: Ordner in VS Code öffnen und F5 drücken („Schulterblick starten“). Es öffnet sich ein zweites VS-Code-Fenster mit der Erweiterung. Mit `npm run watch` wird bei jeder Änderung neu kompiliert.

## Einstellungen (`schulterblick.*`)

| Einstellung | Standard | Bedeutung |
|---|---|---|
| `modus` | `live` | `live` oder `aufFrage` |
| `pauseSekunden` | 8 | Tipp-Pause, nach der die Eule schaut |
| `minZeichen` | 40 | so viel muss sich mindestens geändert haben |
| `gespraechigkeit` | `normal` | `ruhig` (nur echte Fehler) / `normal` / `gespraechig` |
| `ueberMich` | – | z. B. „Ich lerne seit 2 Monaten Java für die Ausbildung“ |
| `modell` | `sonnet` | `haiku` ist am sparsamsten |
| `uebungsOrdner` | – | eigener Ordner für Übungen |
| `claudePfad` | `claude` | falls die CLI nicht im PATH liegt |

Befehle (Strg+Shift+P → „Schulterblick“): Neue Übung, Jetzt drüberschauen, Modus umschalten, Neue Sitzung (Eule vergisst alles).

## Testen

| Befehl | Was es prüft |
|---|---|
| `npm test` | Diff, Übungs- und Vorschlags-Parser, Stellensuche (ohne VS Code, ohne Claude) |
| `npm run test:live` | fragt die echte Claude-CLI: Fehler finden, Kontext merken, Korrektur vorschlagen, Übung erzeugen (kostet ein paar Anfragen) |
| `npm run test:vscode` | lädt ein echtes VS Code herunter und testet darin den ganzen Ablauf mit einer Ersatz-CLI (`test/vscode/fake-claude.js`). Unter Linux ohne Bildschirm: `xvfb-run -a npm run test:vscode` |

## Aufbau

- `src/extension.ts`: Änderungen sammeln, Pause-Timer, Diff bauen, Übungen anlegen, Befehle
- `src/mentor.ts`: Aufruf der Claude-CLI, eine durchgehende Sitzung, Warteschlange
- `src/diff.ts`: kleiner Zeilen-Diff ohne Abhängigkeiten
- `src/prompts.ts`: System-Prompt der Eule, Nachrichtenformat, Parser für Übungen und Änderungsvorschläge
- `src/chatView.ts`: Chat-Fenster mit Eule (Webview, Lyx-UI-Look)
- `src/test.ts`: Selbsttest ohne VS Code
- `test/vscode/`: Integrationstest in echtem VS Code
- `media/`: Icons und Schriften (Barlow Condensed, IBM Plex Mono, beide SIL Open Font License)

Die Mentor-Sitzungen laufen im Speicherordner der Erweiterung. Sie tauchen also nicht zwischen deinen normalen Claude-Code-Sitzungen im Projekt auf.
