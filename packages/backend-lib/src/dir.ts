import path from "path";

export function findBaseDir(): string {
  // find base directory containing "packages" directory
  const splitCwd = process.cwd().split(path.sep);
  let baseDirParts: string[] | null = null;
  for (let i = splitCwd.length - 1; i >= 0; i--) {
    const part = splitCwd[i];
    if (part === "packages") {
      baseDirParts = splitCwd.slice(0, i);
      break;
    }
  }
  if (baseDirParts === null) {
    baseDirParts = splitCwd;
  }
  const baseDir = path.resolve(path.sep, ...baseDirParts);
  return baseDir;
}
