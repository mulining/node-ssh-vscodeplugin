import path from "path";
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
 * @param remotePaths 远程路径列表
 * @returns 
 */
export function mergePath(localPath: string, localBasePath: string ,remotePaths: string[]) {
    const isInclude = localPath.includes(localBasePath);
    if(!isInclude) {
        console.warn("该目录不是指定的根目录的文件！不能上传");
        return;
    }
    
    const subPath = localPath.replace(localBasePath, "");
    console.log("子路径：", subPath);
    console.log("远程路径列表：", remotePaths);
    const handleRemotePaths = remotePaths.map(basePath => {
        const filePath = path.join(basePath, subPath);
        return filePath.replaceAll('\\', '/');
    });
    console.log('生成的远程的路径：', handleRemotePaths);
    return handleRemotePaths;
}