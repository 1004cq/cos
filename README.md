# 陈庆.我爱你 个人无损照片/视频相册系统

> 域名：`陈庆.我爱你`  
> 仓库：`cos`  
> 目标：把大量原画质照片和视频放到自己的网站上，别人能方便查看，管理员有后台可以上传/管理，同时做好防刷流量保护。

## 项目目标

1. **无损存储**：照片和视频以原始质量保存在腾讯云 COS，不压缩、不转码（除非主动开启）。
2. **管理员后台**：登录后可批量上传图片/视频、创建相册、编辑信息、删除、设置封面等。
3. **前台展示**：美观的时间轴 / 相册浏览界面，支持大图预览、视频播放、下载原图。
4. **防盗刷**：
   - 存储桶私有读写
   - 短时效签名 URL
   - Referer 防盗链（白名单 `陈庆.我爱你`）
   - CDN 鉴权 + 用量封顶（可选但强烈推荐）
5. **域名**：使用 `陈庆.我爱你`（支持中文域名）

---

## 推荐技术栈（Cursor 可直接实现）

### 方案 A（推荐，现代化全栈）
- **前端 + 后端**：Next.js 15 (App Router) + TypeScript
- **UI**：Tailwind CSS + shadcn/ui + Lucide Icons
- **数据库**：PostgreSQL（或 SQLite 起步）+ Prisma
- **认证**：NextAuth.js（简单账号密码即可）
- **存储**：腾讯云 COS SDK（`cos-nodejs-sdk-v5`）
- **部署**：Vercel / 自己的 VPS + Docker / 腾讯云 CloudBase

### 方案 B（更轻量）
- **后端**：Node.js + Express / Fastify 或 Python FastAPI
- **前端**：Vue3 + Vite 或纯静态 + 管理后台
- **数据库**：SQLite / MySQL

### 核心功能模块

| 模块 | 功能说明 |
|------|----------|
| 用户认证 | 管理员登录（后续可扩展多用户） |
| 媒体上传 | 支持拖拽、批量上传，直传 COS（预签名） |
| 相册管理 | 创建/编辑/删除相册，设置封面 |
| 媒体管理 | 列表、搜索、标签、删除、恢复 |
| 前台浏览 | 时间轴、相册页、灯箱预览、视频播放 |
| 分享 | 生成带密码 / 过期时间的分享链接 |
| 签名服务 | 后端生成短时效 COS / CDN 签名 URL |
| 防盗刷 | Referer 校验 + 签名校验 |

---

## 腾讯云 COS 配置方案（必须严格执行）

### 1. 存储桶设置
- 权限：**私有读写**（绝对不要公有读）
- 地域：选择离用户近的（如广州、上海、香港）
- 开启**版本控制**（可选，防止误删）

### 2. 防盗链（必做）
路径：存储桶 → 安全管理 → 防盗链设置

```
状态：开启
类型：白名单
空 Referer：拒绝
Referer：
陈庆.我爱你
*.陈庆.我爱你
```

### 3. 签名 URL 策略
- 所有媒体访问链接必须由后端生成**临时签名**
- 推荐有效期：30 分钟 ~ 2 小时
- 使用 COS SDK 的 `getObjectUrl` 或手动计算签名

### 4. CDN 推荐配置（强烈建议）
1. 创建 CDN 加速域名，源站指向 COS
2. 加速域名绑定 `陈庆.我爱你` 或子域名
3. 开启：
   - 防盗链（同 COS）
   - URL 鉴权（TypeA / TypeC，密钥可自定义）
   - 用量封顶（设置合理阈值，超限返回 404）
   - HTTPS

### 5. 费用控制建议
- 开启云监控告警（外网下行流量）
- CDN 用量封顶
- 定期检查账单

---

## 数据库设计建议（Prisma 示例）

```prisma
model User {
  id        String   @id @default(cuid())
  username  String   @unique
  password  String   // 哈希后存储
  createdAt DateTime @default(now())
}

model Album {
  id          String   @id @default(cuid())
  title       String
  description String?
  coverKey    String?  // COS object key
  isPublic    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  media       Media[]
}

model Media {
  id          String   @id @default(cuid())
  albumId     String?
  album       Album?   @relation(fields: [albumId], references: [id])
  key         String   // COS 对象键，如 photos/2026/08/xxx.jpg
  filename    String
  mimeType    String
  size        Int
  width       Int?
  height      Int?
  duration    Float?   // 视频时长（秒）
  takenAt     DateTime?
  createdAt   DateTime @default(now())
  tags        String[] // 简单标签
}
```

---

## 核心实现流程

### 上传流程（推荐预签名直传）
1. 前端请求后端获取预签名上传 URL
2. 前端直接 PUT 文件到 COS（不经过服务器，省流量和带宽）
3. 上传成功后，前端把 key、filename、size 等信息提交给后端入库

### 访问流程
1. 用户请求某张图/视频
2. 后端验证权限后，生成带签名的临时 URL（有效期短）
3. 前端用这个临时 URL 展示/播放

### 管理员后台页面建议
- `/admin/login`
- `/admin` 仪表盘（总数量、最近上传）
- `/admin/albums` 相册管理
- `/admin/media` 媒体库（支持搜索、筛选、批量操作）
- `/admin/upload` 上传页面（拖拽 + 进度）

---

## 目录结构建议（Next.js）

```
cos/
├── app/
│   ├── (public)/          # 前台页面
│   │   ├── page.tsx       # 首页时间轴
│   │   ├── album/[id]/
│   │   └── share/[token]/
│   ├── admin/             # 管理后台
│   │   ├── login/
│   │   ├── albums/
│   │   ├── media/
│   │   └── upload/
│   ├── api/
│   │   ├── auth/
│   │   ├── upload/presign/
│   │   ├── media/
│   │   └── sign/          # 生成签名URL
│   └── layout.tsx
├── components/
├── lib/
│   ├── cos.ts             # COS 客户端 & 签名工具
│   ├── prisma.ts
│   └── auth.ts
├── prisma/
│   └── schema.prisma
├── public/
├── .env.example
├── README.md
└── package.json
```

---

## 环境变量示例（.env）

```env
# 数据库
DATABASE_URL="postgresql://..."

# 腾讯云 COS
COS_SECRET_ID=你的SecretId
COS_SECRET_KEY=你的SecretKey
COS_BUCKET=你的桶名-appid
COS_REGION=ap-guangzhou
COS_CDN_DOMAIN=陈庆.我爱你          # 或 CDN 域名

# 认证
NEXTAUTH_SECRET=随机长字符串
NEXTAUTH_URL=https://陈庆.我爱你

# 管理员初始账号（首次启动创建）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的强密码
```

---

## 实现优先级（给 Cursor 的任务拆分）

### Phase 1：基础骨架
1. 初始化 Next.js + TypeScript + Tailwind + Prisma
2. 配置 COS SDK 和签名工具函数
3. 实现管理员登录
4. 实现预签名上传接口 + 简单上传页面

### Phase 2：核心业务
5. 相册 CRUD
6. 媒体列表、删除、关联相册
7. 前台时间轴 + 相册浏览 + 灯箱
8. 签名 URL 生成接口（所有媒体访问走这里）

### Phase 3：完善与安全
9. 分享链接（带密码 / 过期）
10. 批量操作、标签、搜索
11. 防盗刷相关配置文档落地
12. 响应式优化 + 视频播放体验

### Phase 4：部署
13. 域名解析 + HTTPS
14. 生产环境变量与 Docker / Vercel 部署
15. 监控与用量封顶配置

---

## 注意事项

1. **永远不要把 COS SecretKey 暴露到前端**。
2. 大文件（视频）一定用预签名直传，不要经过自己的服务器。
3. 中文域名 `陈庆.我爱你` 在代码和配置中直接使用即可，现代浏览器和 CDN 都支持。
4. 建议先用测试桶验证签名和防盗链，再切生产。
5. 定期备份数据库和 COS（开启跨区域复制或生命周期）。

---

## 后续可扩展方向

- 人脸识别 / AI 自动打标签（可接入 Immich 的 ML 或腾讯云 AI）
- 多用户支持
- 原图下载权限控制
- 移动端 App 自动备份（参考 Immich）
- 与现有 `gt.cq.cn` 整合

---

**仓库地址**：https://github.com/1004cq/cos  

现在这个 README 已经包含完整技术方案。  
你可以直接把这个仓库丢给 Cursor，让它按 Phase 顺序开始实现。

有任何需要调整的地方（技术栈、功能优先级、UI 风格等），随时告诉我，我继续完善文档。