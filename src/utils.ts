import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as vscode from "vscode";
import * as os from "os";
import * as child_process from "child_process";
import * as Admzip from "adm-zip";
import { createHash, BinaryLike } from "crypto";
import { Target } from "./meson/types";
import { ExtensionConfiguration } from "./types";
import { getMesonBuildOptions } from "./meson/introspection";
import { extensionPath } from "./extension";

export async function exec(
  command: string,
  args: string[],
  options: cp.ExecOptions = {}
): Promise<{ stdout: string; stderr: string, error?: cp.ExecException }> {
  return new Promise<{ stdout: string; stderr: string, error?: cp.ExecException }>((resolve, reject) => {
    cp.execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export function execStream(
  command: string,
  args: string[],
  options: cp.SpawnOptions
) {
  const spawned = cp.spawn(command, args, options);
  return {
    onLine(fn: (line: string, isError: boolean) => void) {
      spawned.stdout.on("data", (msg: Buffer) => fn(msg.toString(), false));
      spawned.stderr.on("data", (msg: Buffer) => fn(msg.toString(), true));
    },
    kill(signal?: NodeJS.Signals) {
      spawned.kill(signal || "SIGKILL");
    },
    finishP() {
      return new Promise<number>(res => {
        spawned.on("exit", code => res(code));
      });
    }
  };
}

export async function execFeed(
  command: string,
  args: string[],
  options: cp.ExecOptions = {},
  stdin: string
): Promise<{ stdout: string; stderr: string, error?: cp.ExecFileException }> {
  return new Promise<{ stdout: string; stderr: string, error?: cp.ExecFileException }>(resolve => {
    let p = cp.execFile(command, args, options, (error, stdout, stderr) => {
      resolve({ stdout, stderr, error: error ? error : undefined });
    });

    p.stdin?.write(stdin);
    p.stdin?.end();
  });
}

export function execAsTask(
  command: string,
  args: string[],
  options: vscode.ProcessExecutionOptions,
  revealMode = vscode.TaskRevealKind.Silent
) {
  const task = new vscode.Task(
    { type: "temp" },
    command,
    "Meson",
    new vscode.ProcessExecution(command, args, options)
  );
  task.presentationOptions.echo = false;
  task.presentationOptions.focus = false;
  task.presentationOptions.reveal = revealMode;
  return vscode.tasks.executeTask(task);
}

export async function parseJSONFileIfExists<T = object>(path: string) {
  try {
    const data = await fs.promises.readFile(path);
    return JSON.parse(data.toString()) as T;
  }
  catch (err) {
    return false;
  }
}

let _channel: vscode.OutputChannel;
export function getOutputChannel(): vscode.OutputChannel {
  if (!_channel) {
    _channel = vscode.window.createOutputChannel("Meson Build");
  }
  return _channel;
}

export function extensionRelative(filepath: string) {
  return path.join(extensionPath, filepath);
}

export function workspaceRelative(filepath: string) {
  return path.resolve(vscode.workspace.rootPath, filepath);
}

export async function getTargetName(target: Target) {
  const buildDir = workspaceRelative(extensionConfiguration("buildFolder"));
  const buildOptions = await getMesonBuildOptions(buildDir);
  const layoutOption = buildOptions.filter(o => o.name === "layout")[0];

  if (layoutOption.value === "mirror") {
    let relativePath = path.relative(vscode.workspace.rootPath, path.dirname(target.defined_in));

    // Meson requires the separator between path and target name to be '/'.
    relativePath = path.join(relativePath, target.name);
    return relativePath.split(path.sep).join(path.posix.sep);
  }
  else {
    return `meson-out/${target.name}`;
  }
}

export function hash(input: BinaryLike) {
  const hashObj = createHash("sha1");
  hashObj.update(input);
  return hashObj.digest("hex");
}

export function getConfiguration() {
  return vscode.workspace.getConfiguration("mesonbuild");
}

export function extensionConfiguration<K extends keyof ExtensionConfiguration>(
  key: K
) {
  return getConfiguration().get<ExtensionConfiguration[K]>(key);
}

export function extensionConfigurationSet<
  K extends keyof ExtensionConfiguration
>(
  key: K,
  value: ExtensionConfiguration[K],
  target = vscode.ConfigurationTarget.Global
) {
  return getConfiguration().update(key, value, target);
}

export function canDownloadLanguageServer(): boolean {
  const platform = os.platform()
  if (platform != "win32" && platform != "darwin") {
    return false
  }
  const arch = os.arch()
  return arch != "x64"
}

function createDownloadURL(): string {
  const platform = os.platform()
  const filename = platform == "win32" ? "Swift-MesonLSP-win64.zip" : "Swift-MesonLSP-macos12.zip"
  return `https://github.com/JCWasmx86/Swift-MesonLSP/releases/download/v1.6/${filename}`
}

function createHashForLanguageServer(): string {
  const platform = os.platform()
  return platform == "win32" ?
    "3707be8c4aabcbe366f1d7ada66da9f6def38ced8eaee5784fb1701360292c57"
      : "888929c9abeada1a16b50312146b33741255f88ddf5ff357fbe67dbe7a7a7c98"
}

export function findLanguageServer(): string | null {
  const platform = os.platform();
  if(platform != "win32" && platform != "darwin") {
    return null;
  }
  const arch = os.arch();
  if(arch != "x64") {
    return null;
  }
  const lspDir = path.join(getExtensionDir(), "lsp");
  const filename = platform == "win32" ? "Swift-MesonLSP.exe" : "Swift-MesonLSP";
  const fullpath = path.join(lspDir, filename);
  if(fs.existsSync(fullpath)) {
    return fullpath;
  }
  return null;
}

export async function downloadLanguageServer() {
  const lspDir = path.join(getExtensionDir(), "lsp");
  await rmdir(lspDir);
  await mkdirp(lspDir);
  const tmpPath = path.join(os.tmpdir(), `lsp-${Date.now()}.zip`);
  vscode.window.showErrorMessage("curl -L -q " + createDownloadURL() + " -o " + tmpPath);
  try {
    const x = child_process.spawnSync("curl", ["-L", "-q", createDownloadURL(), "-o", tmpPath], { maxBuffer: 1024*1024*1024*24 });
    if (x.status != 0) {
      vscode.window.showErrorMessage(x.output.toString());
      return;
    }
    const hash = await computeFileHash(tmpPath);
    const expected = createHashForLanguageServer();
    vscode.window.showErrorMessage(hash);
    if (hash != expected) {
      vscode.window.showErrorMessage(`Bad hash: Expected ${expected}, got ${hash}!`);
      return;
    }
    const zip = new Admzip(tmpPath);
    zip.extractAllTo(lspDir);
    if (os.platform() != "win32") {
      fs.chmodSync(path.join(lspDir, "Swift-MesonLSP"), 0o755);
    }
    await unlink(tmpPath);
    vscode.window.showErrorMessage("Done");
  } catch (err) {
    vscode.window.showErrorMessage(JSON.stringify(err));
    return;
  }
  /*await new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(tmpPath);
    https.get(createDownloadURL(), (response) => {
      response.pipe(file);
      file.on("finish", async () => {
        file.close();
        const hash = await computeFileHash(tmpPath);
        const sha256 = createHashForLanguageServer();
        if (hash === sha256) {
          const input = fs.createReadStream(tmpPath);
          const unzip = zlib.createUnzip();
          unzip.on("error", reject);
          const output = unzip.on("end", resolve);
          const extract = output.pipe(createFileExtractor(lspDir));
          extract.on("error", reject);
          input.pipe(unzip).pipe(extract);
        } else {
          reject(new Error(`Invalid hash for downloaded file (expected ${sha256}, got ${hash})`));
        }
      });
    }).on("error", reject);
  });*/
}

const getExtensionDir = (): string => {
  return path.join(os.homedir(), ".vscode-meson");
};

const computeFileHash = async (filePath: string): Promise<string> => {
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
};

const createFileExtractor = (targetDir: string) => {
  const extract = new (require("stream").Writable)();
  extract._write = (chunk, encoding, callback) => {
    const entryPath = path.join(targetDir, chunk.path);
    if (chunk.type === "Directory") {
      mkdirp(entryPath);
    } else {
      const file = fs.createWriteStream(entryPath);
      file.on("finish", callback);
      chunk.pipe(file);
    }
  };
  return extract;
};

const rmdir = async (dir: string): Promise<void> => {
  if (fs.existsSync(dir)) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await rmdir(entryPath);
      } else {
        await unlink(entryPath);
      }
    }
    fs.rmdirSync(dir);
  }
};

const mkdirp = async (dir: string): Promise<void> => {
  if (!fs.existsSync(dir)) {
    const parentDir = path.dirname(dir);
    if (parentDir !== dir) {
      await mkdirp(parentDir);
    }
    fs.mkdirSync(dir);
  }
};

const unlink = async (filePath: string): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

export function arrayIncludes<T>(array: T[], value: T) {
  return array.indexOf(value) !== -1;
}

export function isThenable<T>(x: vscode.ProviderResult<T>): x is Thenable<T> {
  return arrayIncludes(Object.getOwnPropertyNames(x), "then");
}

export async function genEnvFile(buildDir: string) {
  const envfile = path.join(buildDir, "meson-vscode.env")
  try {
    await exec(
      extensionConfiguration("mesonPath"), ["devenv", "-C", buildDir, "--dump", envfile, "--dump-format", "vscode"]);
  } catch {
    // Ignore errors, Meson could be too old to support --dump-format.
  }
}

export async function patchCompileCommands(buildDir: string) {
  const filePath = path.join(buildDir, "compile_commands.json");
  let db = await parseJSONFileIfExists(filePath);
  if (!db)
    return;

  // Remove ccache from compile commands because they confuse Intellisense:
  // https://github.com/microsoft/vscode-cpptools/issues/7616
  Object.values(db).forEach((entry) => {
    // FIXME: This should use proper shlex.split() and shlex.join()
    let cmd = entry["command"].split(" ");
    if (cmd[0].endsWith("ccache")) {
      cmd.shift();
      entry["command"] = cmd.join(" ");
    }
  });
  const vsCodeFilePath = path.join(buildDir, "vscode_compile_commands.json")
  fs.writeFileSync(vsCodeFilePath, JSON.stringify(db, null, "  "));

  // Since we have compile_commands.json, make sure we use it.
  try {
    const relFilePath = path.relative(vscode.workspace.rootPath, vsCodeFilePath);
    const conf = vscode.workspace.getConfiguration("C_Cpp");
    conf.update("default.compileCommands", relFilePath, vscode.ConfigurationTarget.Workspace);
  } catch {
      // Ignore, C/C++ extension might not be installed
  }
}
