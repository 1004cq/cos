# ip2region 离线库（IPv4）

访客页 IP 归属使用官方 [ip2region](https://github.com/lionsoul2014/ip2region) 的 **IPv4 xdb**（省市级、约值，不到县）。

当前仓库文件：`data/ip2region_v4.xdb`  
（本份来自官方 master，xdb 头 `createdAt` 约 2026-08-14。）

Docker 构建会把整个 `data/` 打进镜像（见 `Dockerfile` 的 `COPY --from=builder /app/data ./data`）。  
也可只挂载数据文件，无需改代码：

```yaml
# docker-compose.yml 的 app 服务
volumes:
  - ./data/ip2region_v4.xdb:/app/data/ip2region_v4.xdb:ro
```

或设置环境变量 `IP2REGION_DB=/绝对路径/ip2region_v4.xdb`。

## 如何更新

在项目根目录：

```bash
npm run ip2region:update
```

等价于：

```bash
curl -fsSL -o data/ip2region_v4.xdb \
  https://github.com/lionsoul2014/ip2region/raw/master/data/ip2region_v4.xdb
```

然后重新构建并部署镜像。不需要 IPv6 xdb：无 IPv6 数据时页面显示「—」。
