export interface ServerConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    remoteDirPaths: string[];
}

export interface SSH2Config {
    serverConfigs: ServerConfig[];
    localBasePath: string;
    localCompliePath?: string;
    cssFilePath?: string;
    directUploadFiles?: string[];
}

// 定义上传结果的接口
export interface UploadResult {
  filePath: string;          // 文件路径
  compiledPath?: string;     // 编译后的文件路径（如果有）
  status: 'success' | 'fail'; // 上传状态
  error?: string;            // 错误信息
  timestamp: number;         // 上传时间戳
  formattedTime: string;     // 上传时间（格式化）
}

export interface UploadSummary {
  total: number;             // 总文件数
  success: number;           // 成功数
  failed: number;            // 失败数
  results: UploadResult[];   // 详细结果
} 