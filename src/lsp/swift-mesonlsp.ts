import * as os from "os";
import * as vscode from "vscode";

import { LanguageServerClient } from "../lsp";
import { Executable } from "vscode-languageclient/node";

export class SwiftMesonLspLanguageClient extends LanguageServerClient {
  private static artifacts: { [key: string]: { name: string, hash: string } } = {
    "win32-x64": { name: "Swift-MesonLSP-win64.zip", hash: "093ab6be0f78c255454ad0e14151db61f4e515be7e0c2315373359ea05439471" },
    "darwin-x64": { name: "Swift-MesonLSP-macos12.zip", hash: "5642fdcc6205f18f83b140fb6b03fc8eb5f6e3513e04e4545ad4882bc34438ad" },
  };

  repoURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP";
  setupURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP/tree/main/Docs";

  get runExe(): Executable {
    return {
      command: this.languageServerPath!.fsPath,
      args: ["--lsp"]
    }
  }

  get debugExe(): Executable {
    return {
      command: this.languageServerPath!.fsPath,
      args: ["--lsp"]
    }
  }

  constructor(languageServerPath: vscode.Uri, context: vscode.ExtensionContext) {
    super("Swift-MesonLSP", languageServerPath, context);
  }

  static override artifact(): { url: string, hash: string } | null {
    // Only need to check Linux
    const arch = os.arch();
    const platform = os.platform();
    if (arch !== "x64" || platform === "linux")
      return null;

    const artifact = SwiftMesonLspLanguageClient.artifacts[`${platform}-${arch}`];
    return {
      url: `${SwiftMesonLspLanguageClient.repoURL}/releases/download/v2.1/${artifact.name}`,
      hash: artifact.hash
    };
  }

  static override supportsSystem(): boolean {
    const arch = os.arch();
    if (arch != "x64")
      return false;

    const platform = os.platform();
    switch (platform) {
      case "darwin":
      case "linux":
      case "win32":
        return true;
      default:
        return false;
    }
  }
}
