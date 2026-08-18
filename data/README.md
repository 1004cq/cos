# 可选：自定义 ip2region 离线库

默认使用 npm 包 `ip2region-ts` 自带的 `ip2region.xdb`。

更新方式（任选其一）：

1. `npm update ip2region-ts`
2. 下载官方文件覆盖本目录：
   https://github.com/lionsoul2014/ip2region/raw/master/data/ip2region.xdb
   保存为 `data/ip2region.xdb`
3. 或设置环境变量 `IP2REGION_DB=/绝对路径/ip2region.xdb`
