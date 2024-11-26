# ssh-publish

> 该插件用于快速项目部署, 支持单文件/指定目录的形式部署

## 使用指南：
1. 请先配置当前文件 process.env.LOCAL_PATH 本体工程根目录, 精确到 TEClient, eg: E:/myPrograges/ztkj/TEClient
2. 配置 serverConfigs 服务器配置, 支持配置多台服务器, 每台服务器支持配置多条 remotePaths(精确到 TEClient)
3. 请先配置 。/file_config.json, 预设你要部署的文件(相对于 TEClient/ 位置来说的, 不需要给出完整路径)
4. 命令行执行 node index.js 命令, 按提示选择你想部署的文件, 回车即可！

