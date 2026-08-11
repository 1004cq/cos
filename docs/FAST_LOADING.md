# 图库秒开 / 视频封面 / CDN 说明

> 陈庆.我爱你 · 私人图库（COS 私有桶）

## 架构红线

1. **原片无损**：禁止前端 ffmpeg/canvas 重编码原片（上传时截海报除外）
2. **PUT 永远 COS 源站**（`*.cos.<region>.myqcloud.com`）；`COS_CDN_DOMAIN` **仅用于 GET**
3. **禁止把中文站域 / IDN（含 `xn--`）配成 CDN**，否则签名 Host 错 → 灰块/404
4. **图库网格只用 `thumbUrl` / `posterUrl`**，禁止原图或整段 video 铺列表
5. **私有桶签名**；`imageMogr2` / `ci-process=snapshot` / 水印参数必须进签名 Query

---

## A. 图片秒开

- `getSignedUrl(key, ttl, { thumb: true })` → `imageMogr2/thumbnail/{w}x{w}>/format/jpg`
- `/api/gallery`：图片必签 `thumbUrl`；列表 TTL **3600s**；响应 `Cache-Control: public, max-age=30`
- 灯箱：先显示 `thumbUrl`，再探测加载 `url` 原图；失败保留缩略/占位
- `COS_THUMB_WIDTH` / 后台 `cos.thumbWidth`（默认约 480）

## B. 视频封面（消灭灰块）

1. **上传**：浏览器 `capturePosterBlobFromFile` → PUT jpg → `posterKey` 随 `POST /api/media`
2. **无海报时**：服务端 `generateAndStoreVideoPoster`（数据万象 `ci-process=snapshot`）写入 `*-poster.jpg`
3. **补历史**：`POST /api/admin/media/backfill-posters`（需登录，`limit`≤50）
4. **MediaCover**：`posterUrl` → `thumbUrl` → 深灰+▶（**列表不 preload 视频**）
5. **详情**：点进灯箱再挂 `url` + `playsInline`；iOS 可先 muted 再播

## C. 约 20 人并发

- `SIGN_CONCURRENCY = 6`
- 媒体流量走 **COS/CDN**，不要用 Next 带宽硬扛
- `/api/gallery/cover-src`：按 IP 限流；**有 poster 则 302 到签名海报**；禁止无 Range 整文件中转
- 网格有海报后**不应依赖** cover-src

## D. CDN / COS

| 场景 | Host |
|------|------|
| 上传 PUT | 始终 `cos.<region>.myqcloud.com`（或加速上传域，但勿用中文站域） |
| 阅读 GET | 若配置了英文 CDN 则换 host；空则源站 |

### 推荐绑定方式

1. 在腾讯云 CDN / COS 加速域名中绑定 **ASCII 英文域**（如 `cdn.example.com`）
2. 回源到私有桶，开启回源鉴权
3. 后台「COS 设置」填写该英文域，或 `COS_CDN_DOMAIN=cdn.example.com`
4. **不要**填 `陈庆.我爱你` / `xn--…`（会被 `isUnsafeCdnHost` 忽略）

## E. 水印（可选）

- 环境变量 `COS_WATERMARK=1` 时，图库展示链（缩略/海报）拼数据万象文字水印
- 默认文案「陈庆.我爱你」；参数进签名
- **管理端原图下载不强制水印**（`/api/sign` 默认不加）
- **无法防录屏**，仅降低随手保存传播

---

## 腾讯云需开通（否则缩略/截帧失败）

1. 存储桶绑定 **数据万象 CI**
2. 开通 **图片处理**（imageMogr2）与 **媒体处理 / 视频截帧**（snapshot）
3. CORS：允许站点 Origin（**不要尾斜杠**），如 `https://xn--w4r.xn--55qx5d`
4. 防盗链 Referer 白名单含站点域；预签名请求一般可过，仍建议配对

## 运维命令

```bash
# 补全无封面视频（管理员已登录的 cookie / 会话环境）
curl -X POST https://你的站/api/admin/media/backfill-posters \
  -H 'Content-Type: application/json' \
  -d '{"limit":50}'
```

部署后：`git pull` → `docker compose build app && docker compose up -d app`
