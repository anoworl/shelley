// VSCode URL utilities

/**
 * Build VSCode remote URL for opening a file
 * @param filePath - Absolute path to the file
 * @param lineNumber - Optional line number to jump to
 * @returns VSCode URL or null if hostname is not available
 */
export function buildVSCodeUrl(filePath: string, lineNumber?: number | null): string | null {
  const hostname = window.__SHELLEY_INIT__?.hostname;
  if (!hostname || !filePath) return null;

  // Ensure absolute path
  if (!filePath.startsWith("/")) return null;

  // Format: vscode://vscode-remote/ssh-remote+HOST/path/to/file:LINE:COL
  const fileWithLine = lineNumber ? `${filePath}:${lineNumber}:1` : filePath;
  return `vscode://vscode-remote/ssh-remote+${hostname}${fileWithLine}`;
}

/**
 * Build VSCode remote URL for opening a folder
 * @param folderPath - Absolute path to the folder
 * @returns VSCode URL or null if hostname is not available
 */
export function buildVSCodeFolderUrl(folderPath: string): string | null {
  const hostname = window.__SHELLEY_INIT__?.hostname;
  if (!hostname || !folderPath) return null;

  if (!folderPath.startsWith("/")) return null;

  return `vscode://vscode-remote/ssh-remote+${hostname}${folderPath}?windowId=_blank`;
}
