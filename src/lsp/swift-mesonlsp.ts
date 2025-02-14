import * as os from "os";
import * as vscode from "vscode";

import { LanguageServerClient } from "../lsp";
import { Executable } from "vscode-languageclient/node";

export class SwiftMesonLspLanguageClient extends LanguageServerClient {
  private static artifacts: { [key: string]: { name: string; hash: string } } = {
    "win32-x64": {
      name: "Swift-MesonLSP-win64.zip",
      hash: "32054d79988613dd304705817a31cf05cc48e486b95952a9e6b78e111b540322",
    },
    "darwin-x64": {
      name: "Swift-MesonLSP-macos12.zip",
      hash: "f7d12dcecf60f0d61993f952dd3d43ab33abe5b87cc5c72ec7904805e3f902a1",
    },
    "darwin-arm64": {
      name: "Swift-MesonLSP-macos12.zip",
      hash: "024457775bbaa55ce1a0c1ba65a8f92c4c7879ee42c7d7259f131bbb02fb3fa2",
    },
    "linux-x64": {
      name: "Swift-MesonLSP.zip",
      hash: "77f3b01b59992d1e4e2775c05dc74d60a4cd34a99085a6fd9663ef0d698c3270",
    },
  };

  static override repoURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP";
  static override setupURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP/tree/main/Docs";
  static override version: string = "3.0.22";

  get runExe(): Executable {
    return {
      command: this.languageServerPath!.fsPath,
      args: ["--lsp"],
    };
  }

  get debugExe(): Executable {
    return {
      command: this.languageServerPath!.fsPath,
      args: ["--lsp"],
    };
  }

  constructor(languageServerPath: vscode.Uri, context: vscode.ExtensionContext, referenceVersion: string) {
    super("Swift-MesonLSP", languageServerPath, context, referenceVersion);
  }

  static override artifact(): { url: string; hash: string } | null {
    const arch = os.arch();
    const platform = os.platform();
    const slug = `${platform}-${arch}`;

    if (arch !== "x64" && slug != "darwin-arm64") return null;

    const artifact = SwiftMesonLspLanguageClient.artifacts[slug];
    return {
      url: `${SwiftMesonLspLanguageClient.repoURL}/releases/download/v${SwiftMesonLspLanguageClient.version}/${artifact.name}`,
      hash: artifact.hash,
    };
  }

  static override supportsSystem(): boolean {
    const arch = os.arch();
    if (arch != "x64" && arch != "arm64") return false;

    const platform = os.platform();
    switch (platform) {
      case "darwin":
        // x64 and ARM are supported thanks to universal binaries.
        return true;
      case "linux":
      case "win32":
        // Currently no support for ARM on other operating systems.
        return arch == "x64";
      default:
        return false;
    }
  }
}
