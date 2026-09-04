import { promises as fs } from 'fs';
import { join } from 'path';
import { app } from 'electron';

/**
 * File system operations interface for dependency injection
 */
export interface FileSystemOperations {
  mkdir(path: string, options: { recursive: boolean }): Promise<void>;
  readFile(path: string, encoding: string): Promise<string>;
  writeFile(path: string, data: string, encoding: string): Promise<void>;
}

/**
 * Real file system operations
 */
const realFs: FileSystemOperations = {
  mkdir: (path, options) => fs.mkdir(path, options).then(() => undefined),
  readFile: (path, encoding) => fs.readFile(path, encoding as BufferEncoding),
  writeFile: (path, data, encoding) => fs.writeFile(path, data, encoding as BufferEncoding),
};

/**
 * Get user data path interface for dependency injection
 */
export interface AppPathProvider {
  getUserDataPath(): string;
}

/**
 * Real app path provider
 */
const realApp: AppPathProvider = {
  getUserDataPath: () => app.getPath('userData'),
};

/**
 * Storage configuration
 */
let fsOps: FileSystemOperations = realFs;
let appPath: AppPathProvider = realApp;

/**
 * Set custom file system operations (for testing)
 */
export function setFileSystemOperations(ops: FileSystemOperations): void {
  fsOps = ops;
}

/**
 * Set custom app path provider (for testing)
 */
export function setAppPathProvider(provider: AppPathProvider): void {
  appPath = provider;
}

/**
 * Reset to real implementations (for testing cleanup)
 */
export function resetToRealImplementations(): void {
  fsOps = realFs;
  appPath = realApp;
}

/**
 * Get the full path for a storage file in the app's userData directory
 * @param filename - Name of the file (e.g., 'history.json')
 * @returns Full path to the file
 */
export function getStoragePath(filename: string): string {
  const userDataPath = appPath.getUserDataPath();
  return join(userDataPath, 'remon-download', filename);
}

/**
 * Ensure the storage directory exists
 * Creates the directory recursively if it doesn't exist
 */
export async function ensureStorageDirectory(): Promise<void> {
  const userDataPath = appPath.getUserDataPath();
  const storageDir = join(userDataPath, 'remon-download');
  await fsOps.mkdir(storageDir, { recursive: true });
}

/**
 * Read and parse a JSON file from storage
 * @param filename - Name of the file (e.g., 'history.json')
 * @param fallback - Fallback value if file doesn't exist or is invalid
 * @returns Parsed JSON data or fallback
 */
export async function readJsonFile<T>(
  filename: string,
  fallback: T
): Promise<T> {
  try {
    const filePath = getStoragePath(filename);
    const fileContent = await fsOps.readFile(filePath, 'utf-8');

    // Return fallback if file is empty
    if (!fileContent || fileContent.trim() === '') {
      return fallback;
    }

    const parsed = JSON.parse(fileContent);
    return parsed as T;
  } catch (error) {
    // Return fallback if file doesn't exist
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }

    // Return fallback if JSON is invalid
    if (error instanceof SyntaxError) {
      console.warn(`[fileStorage] Invalid JSON in ${filename}, using fallback:`, error.message);
      return fallback;
    }

    // Propagate other errors (permission denied, disk errors, etc.)
    throw error;
  }
}

/**
 * Write data to a JSON file in storage
 * @param filename - Name of the file (e.g., 'history.json')
 * @param data - Data to write (will be JSON.stringified)
 */
export async function writeJsonFile<T>(
  filename: string,
  data: T
): Promise<void> {
  // Ensure directory exists before writing
  await ensureStorageDirectory();

  const filePath = getStoragePath(filename);
  const jsonString = JSON.stringify(data, null, 2);

  await fsOps.writeFile(filePath, jsonString, 'utf-8');
}
