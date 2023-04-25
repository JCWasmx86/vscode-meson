import * as Admzip from "adm-zip";
import * as which from "which";
import * as https from "https";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { Executable, LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";
import { SwiftMesonLspLanguageClient } from "./swift-mesonlsp";
import * as storage from "../storage";
import { LanguageServer } from "../types";

export abstract class LanguageServerClient {
  private static readonly clientOptions: LanguageClientOptions = {
    documentSelector: ["meson", { "scheme": "file", language: "meson" }]
  };
  private ls: LanguageClient | null = null;
  private readonly context: vscode.ExtensionContext;

  protected languageServerPath: vscode.Uri | null;
  readonly server: LanguageServer;

  static readonly repoURL: string;

  protected abstract get debugExe(): Executable;
  protected abstract get runExe(): Executable;

  protected constructor(server: LanguageServer, languageServerPath: vscode.Uri, context: vscode.ExtensionContext) {
    this.server = server;
    this.languageServerPath = languageServerPath;
    this.context = context;
  }

  private static cachedLanguageServer(server: LanguageServer, context: vscode.ExtensionContext): vscode.Uri | null {
    const uri = vscode.Uri.joinPath(storage.uri(storage.Location.LSP, context), `${server}${os.platform() === "win32" ? ".exe" : ""}`);

    return fs.existsSync(uri.fsPath) ? uri : null;
  }

  private static async computeFileHash(filePath: string): Promise<string> {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", hash.update);

    return new Promise<string>((resolve, reject) => {
      stream.on("error", reject);
      stream.on("end", () => {
        resolve(hash.digest("hex"));
      });
    });
  }

  private static async fetch(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      const request = https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          LanguageServerClient.fetch(response.headers.location!, dest)
            .then(resolve)
            .catch(reject);
        } else {
          response.pipe(file);

          file.on("finish", () => {
            file.close();
            resolve();
          });

          file.on("error", (err) => {
            vscode.window.showErrorMessage(`Error writing to file: ${err}`);
            reject(err);
          });
        }
      });

      request.on("error", (err) => {
        vscode.window.showErrorMessage(`Request error: ${err}`);
        reject(err);
      });
    });
  }

  private static async download(server: LanguageServer, context: vscode.ExtensionContext): Promise<vscode.Uri | null> {
    const lspDir = storage.uri(storage.Location.LSP, context).fsPath;
    const artifact = this.artifact();
    if (artifact === null)
      return null;

    fs.rmSync(lspDir, { recursive: true, force: true });
    fs.mkdirSync(lspDir, { recursive: true });

    let uri: vscode.Uri | null = null;
    const tmpPath = path.join(os.tmpdir(), `vscode-meson-${server}-${Date.now()}.zip`);

    try {
      LanguageServerClient.fetch(artifact.hash, tmpPath).then(() => {
        this.computeFileHash(tmpPath).then((hash) => {
          if (hash !== artifact.hash) {
            vscode.window.showErrorMessage(`Invalid hash: Expected ${artifact.hash}, got ${hash}.`);
            return;
          }

          const zip = new Admzip(tmpPath);
          zip.extractAllTo(lspDir);
          const binary = path.join(lspDir, server);
          if (os.platform() != "win32")
            fs.chmodSync(binary, 0o755);

          vscode.window.showInformationMessage("Language server was downloaded.");
          uri = vscode.Uri.from({ scheme: "file", path: binary });
        }).catch((err: Error) => {
          vscode.window.showErrorMessage(err.message);
        });
      }).catch((err: Error) => {
        vscode.window.showErrorMessage(err.message);
      });
    } catch (err) {
      vscode.window.showErrorMessage(JSON.stringify(err));
    }

    fs.unlinkSync(tmpPath);
    return uri;
  }

  private static resolveLanguageServerPath(server: LanguageServer, context: vscode.ExtensionContext): vscode.Uri | null {
    const config = vscode.workspace.getConfiguration("mesonbuild");
    if (config["languageServerPath"] !== null)
      return vscode.Uri.from({ scheme: "file", path: config["languageServerPath"] });

    const cached = LanguageServerClient.cachedLanguageServer(server, context);
    if (cached !== null)
      return cached;

    const binary = which.sync(server, { nothrow: true });
    if (binary !== null)
      return vscode.Uri.from({ scheme: "file", path: binary });

    return null;
  }

  protected static supportsSystem(): boolean {
    return true;
  }

  protected static artifact(): { url: string, hash: string } | null {
    return null;
  }

  static async create(server: LanguageServer, download: boolean, context: vscode.ExtensionContext): Promise<LanguageServerClient | null> {
    const serverToClass = (server: LanguageServer) => {
      switch (server) {
        case "Swift-MesonLSP":
          return SwiftMesonLspLanguageClient;
      }
    }

    const klass = serverToClass(server);
    if (!klass.supportsSystem()) {
      vscode.window.showErrorMessage("The configured language server does not support the current system.");
      return null;
    }

    let languageServerPath = LanguageServerClient.resolveLanguageServerPath(server, context);
    if (languageServerPath === null) {
      if (download) {
        languageServerPath = await LanguageServerClient.download(server, context);
        if (languageServerPath === null) {
          vscode.window.showErrorMessage("Failed to download the language server.");
          return null;
        }
      } else {
        vscode.window.showErrorMessage("Failed to find a language server on the system.");
        return null;
      }
    }

    return new klass(languageServerPath, context);
  }

  dispose() {
    if (this.ls !== null) {
      this.ls.stop();
      this.ls = null;
    }
  }

  restart(): void {
    this.dispose();
    this.languageServerPath = LanguageServerClient.resolveLanguageServerPath(this.server, this.context);
    if (this.languageServerPath === null) {
      vscode.window.showErrorMessage("Failed to restart the language server because a binary was not found and could not be downloaded");
    } else {
      this.start();
    }
  }

  start(): void {
    const serverOptions: ServerOptions = {
      run: this.runExe,
      debug: this.debugExe,
      transport: TransportKind.stdio
    };

    this.ls = new LanguageClient(this.server, `Meson Language Server (${this.server})`, serverOptions, LanguageServerClient.clientOptions, true);
    this.ls.start();
  }
}
