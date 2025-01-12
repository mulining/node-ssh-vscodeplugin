import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ServerConfig, SSH2Config } from './types';

/**
 * 小写路径的磁盘盘符
 * @param path E:/aaa/nbb/sss
 * @returns 
 */
export function convertDriveLetterToUppercase(path) {
  const pattern = /^([a-z]:)/;
  const match = path.match(pattern);
  if (match) {
    return path.replace(match[1], match[1].toUpperCase());
  }
  return path;
}

/**
 * 合并路径
 * @param localPath 本地路径 
 * @param localBasePath 本地基础路径
 * @param localCompliePath 本地编译路径
 * @param remotePaths 远程路径列表
 * @returns 
 */

export function mergePath(localPath: string, localBasePath: string, localCompliePath, remoteDirPaths: string[]): string[] {
  // 检查是否是编译后的路径
  let complieAbsolutePath = path.join(localBasePath, localCompliePath);
  complieAbsolutePath = convertDriveLetterToUppercase(complieAbsolutePath).replaceAll('\\', '/');
  const isCompiledPath = localPath.includes(complieAbsolutePath);
  
  // 根据不同情况选择基准路径
  let basePath = localBasePath;
  if (isCompiledPath) {
      // 如果是编译路径，基准路径应该是编译目录的父目录
      basePath = complieAbsolutePath;
  }

  // 获取相对路径
  let relativePath = path.relative(basePath, localPath);
  
  // 如果获取相对路径失败，返回空数组
  if (!relativePath) {
      console.warn(`无法获取相对路径: localPath=${localPath}, basePath=${basePath}`);
      return [];
  }

  // 统一使用正斜杠
  relativePath = relativePath.replaceAll('\\', '/');

  // 合并远程路径
  return remoteDirPaths.map(remotePath => {
      return path.posix.join(remotePath, relativePath);
  });
}

export function handleFileList(dirPath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const files: string[] = [];
        try {
            const readFiles = (dir: string) => {
                const items = fs.readdirSync(dir);
                items.forEach(item => {
                    const fullPath = path.join(dir, item);
                    if (fs.statSync(fullPath).isDirectory()) {
                        readFiles(fullPath);
                    } else {
                        const filePath = convertDriveLetterToUppercase(fullPath).replaceAll('\\', '/');
                        files.push(filePath);
                    }
                });
            };
            readFiles(dirPath);
            resolve(files);
        } catch (error) {
            reject(error);
        }
    });
}

const FILE_EXTENSION_MAP: Record<string, string> = {
  '.vue': '.vue.js',
  '.ts': '.js',
  '.tsx': '.js',
  '.scss': '.css',
  '.less': '.css',
  '.sass': '.css',
  '.html': '.html',
  '.css': '.css',
  '.js': '.js',
  '.json': '.json',
  '.png': '.png',
  '.jpg': '.jpg',
  '.jpeg': '.jpeg',
  '.gif': '.gif',
  '.svg': '.svg',
  '.ico': '.ico',
  '.txt': '.txt',
  '.md': '.md',
  '.xml': '.xml',
  '.yaml': '.yaml',
  '.yml': '.yml',
  '.csv': '.csv',
};

/**
 * 获取编译后的文件路径
 * @param localPath 源文件路径
 * @param localBasePath 本地基础路径
 * @returns 编译后的文件路径，如果没有编译目录则返回空字符串
 */
export function getCompiledDirPath(localPath: string): string {
  const config = getConfigs();
  if (!config.localCompliePath) {
    console.warn("未配置指定的编译目录！");
    return '';
  }

  // 获取相对路径
  const relativePath = localPath.replace(config.localBasePath, '');
  
  // 先获取在编译目录下的对应路径
  const compiledBasePath = path.join(config.localCompliePath, relativePath);
  const parsedPath = path.parse(compiledBasePath);
  
  // 获取编译后的文件后缀
  const ext = path.extname(localPath);
  const compiledExt = FILE_EXTENSION_MAP[ext] || ext;
  
  // 只修改文件后缀
  let compiledPath = path.join(parsedPath.dir, parsedPath.name + compiledExt);
  compiledPath = convertDriveLetterToUppercase(compiledPath).replaceAll('\\', '/');
  console.log('编译后的文件路径：', compiledPath);
  return compiledPath;
}

export function getConfigs(): SSH2Config {
    const configuration = vscode.workspace.getConfiguration('ssh2UploadPlugin');
    const currentConfig = {
      serverConfigs: configuration.get<ServerConfig[]>('serverConfigs') || [],
      localBasePath: configuration.get<string>('localBasePath') || '',
      localCompliePath: configuration.get<string>('localCompliePath') || '',
      cssFilePath: configuration.get<string>('cssFilePath') || '',
      directUploadFiles: configuration.get<string[]>('directUploadFiles') || []
  };

  return currentConfig;
}
 
export function updateConfigs(key: string, value: any) {
    const configuration = vscode.workspace.getConfiguration('ssh2UploadPlugin');
    configuration.update(key, value, true);
}
