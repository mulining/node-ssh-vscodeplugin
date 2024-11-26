import inquirer from "inquirer";
import ssh2Utils from './ssh2Utils.js';
import path from 'path';
import fs from 'fs';
// import fileSelectorUtils from './fileSelectorUtils.js';

/**
 * 2023-11-25 
 * 交易便捷部署工具
 * 使用指南：
 * 1. 请先配置当前文件 process.env.LOCAL_PATH 本体工程根目录, 精确到 TEClient, eg: E:/myPrograges/ztkj/TEClient
 * 2. 配置 serverConfigs 服务器配置, 支持配置多台服务器, 每台服务器支持配置多条 remotePaths(精确到 TEClient)
 * 3. 请先配置 。/file_config.json, 预设你要部署的文件(相对于 TEClient/ 位置来说的, 不需要给出完整路径)
 * 4. 命令行执行 node index.js 命令, 按提示选择你想部署的文件, 回车即可！
 */
// const process.env.LOCAL_PATH = "E:/myPrograges/ztkj";
// 设置全局环境变量
process.env.LOCAL_PATH = "E:/myPrograges/ztkj";
// 服务器配置列表，可添加多个服务器配置信息
const serverConfigs = [
  {
    host: "172.24.28.179",
    port: 22,
    username: "mulin",
    password: "123456",
    remotePaths: [
      '/home/TEClient/dir1/',
      '/home/TEClient/dir2/',
      // 可以添加更多远程目录路径
    ]
  },
  // {
  //     host: '192.168.43.97',
  //     port: 22,
  //     username: 'mulin_s',
  //     password: '2023',
  //     remotePaths: []
  // }
];

// const questions = [
//   {
//     type: 'checkbox',
//     name: 'fileList',
//     message: '请选择你要上传的文件',
//     choices: [
//       {
//         name: "file",
//         value: "file",
//       },
//       {
//         name: "file2",
//         value: "file2",
//       },
//       {
//         name: "file3",
//         value: "file3",
//       }
//     ]
//   },
//   {
//     type: 'confirm',
//     name: 'confirm',
//     message: '确认上传?',
//     default: false,
//     // when: answers => answers.fileList === "file" || answers.fileList === "file2" || answers.fileList === "file3",
//   }
// ];

const currentModuleUrl = import.meta.url;
// 将URL路径转换为本地文件系统路径
let currentDirPath = path.dirname(new URL(currentModuleUrl).pathname);
if (currentDirPath.startsWith('/')) {
  currentDirPath = currentDirPath.slice(1);
}

// 从配置文件中读取文件列表
function readFileConfig() {
  const configFilePath = path.join(currentDirPath, 'file_config.json');
  try {
      const fileConfig = fs.readFileSync(configFilePath, 'utf8');
      return JSON.parse(fileConfig);
  } catch (err) {
      console.error('- 读取配置文件时出错:', err);
      return [];
  }
}

// 更新配置文件
function setFileConfig(configData) {
  const configFilePath = path.join(currentDirPath, 'file_config.json');
  try {
    fs.writeFileSync(configFilePath, JSON.stringify(configData), 'utf8');
    console.log('- 偏好已保存！');
  } catch (err) {
    console.error('- 保存配置文件时出错:', err);
  }
}

// 使用Inquirer.js进行文件选择并上传
async function main() {
  // 直接从配置文件读取文件列表
  const localFileConfig = readFileConfig();
  if(!localFileConfig || !localFileConfig.fileList) {
    console.log('- 缺少预设文件列表配置，请先配置 file_config.json !');
    return;
  }

  console.log(localFileConfig)
  const questions = [
    {
      type: "checkbox",
      name: "selectedFiles",
      message: "请选择要上传的文件：",
      choices: localFileConfig.fileList,
      default: localFileConfig.defaultSelectedFiles
    },
  ];
  const answers = await inquirer.prompt(questions);
  console.log(answers);
  // if(answers.confirm) {
  //   console.log(answers.fileList);
  // } else {
  //   console.log("已取消选择");
  //   return;
  // }
  if (!answers.selectedFiles?.length) {
    console.log("已取消！");
    return;
  }

  const selectedFiles = answers.selectedFiles;
  // 将用户的选择存储到缓存文件中
  const cacheData = {
    ...localFileConfig,
    defaultSelectedFiles: answers.selectedFiles
  };
  setFileConfig(cacheData);
  const errorLogPath = path.join(currentDirPath, 'upload_errors.log');
  fs.unlink(errorLogPath, (err) => {}); // 移除日志
  console.time('upload');
  for (let i = 0; i < serverConfigs.length; i++) {
    const serverConfig = serverConfigs[i];
    console.log(`- 正在链接目标服务器: ${serverConfig.host}:${serverConfig.port} (计划上传${selectedFiles.length}个文件)...`);
    const conn = await ssh2Utils.connectSSH(serverConfig);
    const MAX_RETRIES = 1; // 定义最大重试次数
    let failList = [];
    try {
        for (let j = 0; j < selectedFiles.length; j++) {
          const serverConfig = serverConfigs[i];
          let localFilePath = selectedFiles[j];
            // const remoteFilePath = `${serverConfig.remotePath}${localFilePath}`;
          // localFilePath = `${process.env.LOCAL_PATH}/${localFilePath}`;
          console.log(
            "- 准备:本地文件：",
            `${process.env.LOCAL_PATH}/${localFilePath}`,
            "拷贝到远程：",
            serverConfig.remotePaths
          );
          // 创建远程目录（如果不存在）// 上传文件到服务器的多个指定目录
          await ssh2Utils.createRemoteDirIfNotExists(conn, localFilePath, serverConfig.remotePaths);
          let retries = 0;
          let uploadSuccess = false;
          while (!uploadSuccess && retries < MAX_RETRIES) {
              try {
                  // 上传文件到服务器
                  await ssh2Utils.uploadFileToServer(conn, localFilePath, serverConfig.remotePaths);
                  uploadSuccess = true;
              } catch (err) {
                  retries++;
                  if (retries === MAX_RETRIES) {
                      const errorMessage = `${new Date().toISOString()} 上传文件 ${localFilePath} 到服务器 ${serverConfig.host} 经过 ${MAX_RETRIES} 次重试后仍失败：${err.message}\n`;
                      failList.push(errorMessage);
                      fs.appendFileSync(errorLogPath, errorMessage); // 写入日志
                      console.error(`- ${errorMessage}`);
                  } else {
                      console.log(`- 上传文件 ${localFilePath} 到服务器 ${serverConfig.host} 失败，正在进行第 ${retries + 1} 次重试...`);
                  }
              }
          }
        }
    } catch (err) {
      failList.push(errorMessage);
      const errorLogPath = path.join(currentDirPath, 'upload_errors.log');
      const errorMessage = `上传文件到服务器 ${serverConfig.host} 时出错：${err.message}，时间：${new Date().toISOString()}\n`;
      fs.appendFileSync(errorLogPath, errorMessage);
      console.error(errorMessage);
    } finally {
      // 关闭SSH连接
      console.log('----------------------------------------------------------------');
      console.log(`- 目标服务器: ${serverConfig.host}:${serverConfig.port} 上传完成！ 本次共上传 ${selectedFiles.length} 个文件，成功${selectedFiles.length - failList.length}个文件，失败${failList.length}个文件。`);
      console.log('- 作业完成，关闭 ssh 链接！');
      console.log('----------------------------------------------------------------');
        await ssh2Utils.closeSSHConnection(conn);
    }
  }
  console.timeEnd('upload');
}

main();
