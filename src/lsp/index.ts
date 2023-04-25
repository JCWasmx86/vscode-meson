import * as Admzip from "adm-zip";
import * as which from "which";
import * as https from "https";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { ExtensionContext, WorkspaceConfiguration, workspace } from "vscode";
import { Executable, LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";

export abstract class LanguageServerClient {
  private config: WorkspaceConfiguration;
  private ls: LanguageClient | null = null;
  executableName: string;
  private context: ExtensionContext;
  private static clientOptions: LanguageClientOptions = {
    documentSelector: ["meson", { "scheme": "file", language: "meson" }]
  };
  abstract repoURL: string;
  abstract setupURI: vscode.Uri
  protected abstract get debugExe(): Executable;
  protected abstract get runExe(): Executable;

  constructor(executableName: string, context: ExtensionContext) {
    this.executableName = executableName;
    this.context = context;
    this.config = workspace.getConfiguration("mesonbuild");

    if (this.languageServerPath == null)
      return;

    this.startLanguageServer();
  }

  abstract supportsSystem(os: string, arch: string): boolean

  abstract get downloadInfo(): [url: string, hash: string] | null;

  abstract get requiresManualSetup(): boolean

  restart(): void {
    this.dispose();

    if (this.languageServerPath == null)
      return;
    this.startLanguageServer();
  }

  private startLanguageServer() {
    const serverOptions: ServerOptions = {
      run: this.runExe,
      debug: this.debugExe,
      transport: TransportKind.stdio
    };

    this.ls = new LanguageClient(this.executableName, `Meson Language Server (${this.executableName})`, serverOptions, LanguageServerClient.clientOptions, true);
    this.ls.start();
  }

  canDownloadLanguageServerAndLanguageServerIsNotFound(): boolean {
    return this.downloadInfo != null && this.findLanguageServer() == null;
  }

  get languageServerPath(): string | null {
    return this.config.languageServerPath || this.findLanguageServer() || which.sync(this.executableName, { nothrow: true });
  }

  async setupLanguageServer(): Promise<void> {
    const lspDir = path.join(this.getExtensionLSPDir(), this.executableName);
    const downloadInfo = this.downloadInfo;
    fs.rmSync(
      lspDir,
      {
        recursive: true,
        force: true
      }
    );
    fs.mkdirSync(
      lspDir,
      { recursive: true }
    );
    const tmpPath = path.join(os.tmpdir(), `lsp-${Date.now()}.zip`);
    try {
      this.downloadFile(downloadInfo[0], tmpPath).then(() => {
        this.computeFileHash(tmpPath).then(str => {
          const expected = downloadInfo[1];
          if (str != expected) {
            vscode.window.showErrorMessage(`Bad hash: Expected ${expected}, got ${str}!`);
            fs.unlinkSync(tmpPath);
            return;
          }
          const zip = new Admzip(tmpPath);
          zip.extractAllTo(lspDir);
          if (os.platform() != "win32")
            fs.chmodSync(path.join(lspDir, this.executableName), 0o755);
          vscode.window.showInformationMessage("Language server is setup correctly!");
          fs.unlinkSync(tmpPath);
          this.restart();
        }).catch((err: Error) => {
          vscode.window.showErrorMessage(err.message);
          fs.unlinkSync(tmpPath);
        });
      }).catch((err: Error) => {
        vscode.window.showErrorMessage(err.message);
        fs.unlinkSync(tmpPath);
      });

    } catch (err) {
      vscode.window.showErrorMessage(JSON.stringify(err));
      fs.unlinkSync(tmpPath);
      return;
    }
  }

  async computeFileHash(filePath: string): Promise<string> {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (data) => {
      hash.update(data);
    });
    return new Promise<string>((resolve, reject) => {
      stream.on("error", reject);
      stream.on("end", () => {
        resolve(hash.digest("hex"));
      });
    });
  }

  async downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      const request = https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          this.downloadFile(redirectUrl, dest)
            .then(() => resolve())
            .catch((err) => reject(err));
        } else {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
          file.on('error', (err) => {
            vscode.window.showErrorMessage(`Error writing to file: ${err}`);
            reject(err);
          });
        }
      });
      request.on('error', (err) => {
        vscode.window.showErrorMessage(`Request error: ${err}`);
        reject(err);
      });
    });
  }

  private findLanguageServer(): string | null {
    const platform = os.platform();
    const arch = os.arch();
    if (!this.supportsSystem(platform, arch))
      return null
    const executableName = this.executableName;
    const lspDir = path.join(this.getExtensionLSPDir(), this.executableName);
    const suffix = platform == "win32" ? ".exe" : "";
    const fullpath = path.join(lspDir, executableName + suffix);
    if (fs.existsSync(fullpath)) {
      return fullpath;
    }
    return null;
  }

  private getExtensionLSPDir(): string {
    return path.join(this.context.globalStorageUri.fsPath, "lsp");
  }

  dispose() {
    if (this.ls) {
      this.ls.stop();
      this.ls = null;
    }
  }
}
