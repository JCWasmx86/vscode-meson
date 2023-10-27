import * as os from "os";
import * as vscode from "vscode";

import { LanguageServerClient } from "../lsp";
import { Executable } from "vscode-languageclient/node";

export class SwiftMesonLspLanguageClient extends LanguageServerClient {
  private static artifacts: { [key: string]: { name: string; hash: string } } = {
    "win32-x64": {
      name: "Swift-MesonLSP-win64.zip",
      hash: "02f0f8e13662715fd8b83a9facd8d0c80e9c0dd94343e1a708b55e4b9cdf5a18",
    },
    "darwin-x64": {
      name: "Swift-MesonLSP-macos12.zip",
      hash: "fcc4c44274a66a12361abb83c576c5a1592cec237dc65e861d00bfb5a7ea7daf",
    },
    "linux-x64": {
      name: "Swift-MesonLSP.zip",
      hash: "81e0903e433b6402289cce823a756196c54ec816e32c568e7ccdf476a14c7c74",
    },
  };

  static override repoURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP";
  static override setupURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP/tree/main/Docs";
  static override version: string = "3.0.21";

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
    if (arch !== "x64") return null;

    const artifact = SwiftMesonLspLanguageClient.artifacts[`${platform}-${arch}`];
    return {
      url: `${SwiftMesonLspLanguageClient.repoURL}/releases/download/v${SwiftMesonLspLanguageClient.version}/${artifact.name}`,
      hash: artifact.hash,
    };
  }

  static override supportsSystem(): boolean {
    const arch = os.arch();
    if (arch != "x64") return false;

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
