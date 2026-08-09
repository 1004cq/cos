# 陈庆.我爱你 · 个人无损照片/视频相册系统

> **域名**：`陈庆.我爱你`  
> **仓库**：https://github.com/1004cq/cos  
> **定位**：高安全、原画质、可管理的个人媒体相册，专为腾讯云 COS 设计。

---

## 一、项目目标

1. **无损存储**：照片、视频以原始文件完整保存在腾讯云 COS，不做任何有损处理。
2. **管理员后台**：安全登录后可批量上传、建相册、管理媒体、设置封面。
3. **前台友好展示**：时间轴 + 相册浏览，支持大图预览、视频播放、原图下载。
4. **强力防盗刷**：
   - COS 私有读写
   - 短时效签名 URL（核心）
   - Referer 白名单（`陈庆.我爱你`）
   - CDN 鉴权 + 用量封顶（推荐）
5. **中文域名原生支持**：`陈庆.我爱你`

---

## 二、系统架构（完善版）

### 2.1 总体架构图（Mermaid）

```mermaid
graph TB
    subgraph Client
        A[用户浏览器 / 手机]
        B[管理员后台]
    end

    subgraph Application[应用层 - Next.js]
        C[前台页面<br/>时间轴 / 相册 / 灯箱]
        D[管理后台<br/>上传 / 相册 / 媒体管理]
        E[API Routes<br/>认证 / 预签名 / 签名URL / CRUD]
    end

    subgraph Security[安全层]
        F[NextAuth 登录态]
        G[签名 URL 生成服务]
        H[Referer + CDN 鉴权]
    end

    subgraph Storage
        I[(PostgreSQL<br/>元数据)]
        J[腾讯云 COS<br/>原文件私有存储]
        K[腾讯云 CDN<br/>加速 + 防盗刷]
    end

    A --> C
    B --> D
    C --> E
    D --> E
    E --> F
    E --> G
    G --> J
    E --> I
    J --> K
    K --> A
    H --> K
```

### 2.2 分层架构说明

| 层级 | 职责 | 技术实现 |
|------|------|----------|
| **表现层** | 用户看到的页面、交互 | Next.js App Router + Tailwind + shadcn/ui |
| **应用层** | 业务逻辑、权限校验、流程编排 | API Routes + Server Actions |
| **领域层** | 相册、媒体、用户等核心模型 | Prisma Model + 业务服务 |
| **基础设施层** | 存储、认证、外部服务 | COS SDK、NextAuth、PostgreSQL |
| **安全层** | 防盗刷、鉴权、签名 | 私有桶 + 临时签名 + Referer + CDN 鉴权 |

### 2.3 核心数据流

#### 上传流程（预签名直传，推荐）
```
管理员 → 请求预签名 → 后端用 COS SDK 生成 PUT 预签名 URL
     → 前端直接 PUT 文件到 COS（不经过自己服务器）
     → 上传成功后把 key / 文件信息提交后端入库
```

#### 访问流程（所有媒体必须走签名）
```
用户请求某张图 → 前端调用 /api/sign → 后端验证登录/分享权限
              → 生成短时效 GET 签名 URL（30min~2h）
              → 前端用签名 URL 加载图片/视频
```

### 2.4 安全架构重点

1. **存储层**：COS 桶永久设置为「私有读写」，永不公开。
2. **访问层**：任何媒体链接都必须带后端签发的临时签名，过期即失效。
3. **来源校验**：COS + CDN 同时开启 Referer 白名单（只允许 `陈庆.我爱你` 及其子域名）。
4. **CDN 增强**（强烈推荐）：
   - URL 鉴权（TypeA/C）
   - 用量封顶（防止账单爆炸）
   - HTTPS 强制
5. **密钥安全**：`COS_SECRET_KEY` 只存在服务端环境变量，永不下发前端。

---

## 三、推荐技术栈（最终确定）

**主推方案：Next.js 全栈**

- **框架**：Next.js 15（App Router）+ TypeScript
- **样式**：Tailwind CSS + shadcn/ui + Lucide React
- **数据库**：PostgreSQL + Prisma ORM（本地开发可用 SQLite）
- **认证**：NextAuth.js（Credentials Provider 即可）
- **对象存储**：腾讯云 COS（官方 `cos-nodejs-sdk-v5`）
- **部署推荐**：
  1. Vercel（最简单）
  2. 自己 VPS + Docker Compose（更可控）
  3. 腾讯云 CloudBase / EdgeOne

---

## 四、数据库设计（Prisma）

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  username  String   @unique
  password  String   // bcrypt 哈希
  createdAt DateTime @default(now())
}

model Album {
  id          String   @id @default(cuid())
  title       String
  description String?
  coverKey    String?  // COS object key
  isPublic    Boolean  @default(false)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  media       Media[]
}

model Media {
  id          String    @id @default(cuid())
  albumId     String?
  album       Album?    @relation(fields: [albumId], references: [id], onDelete: SetNull)
  key         String    @unique  // COS 完整对象键
  filename    String
  mimeType    String
  size        Int
  width       Int?
  height      Int?
  duration    Float?    // 视频秒数
  takenAt     DateTime? // 拍摄时间（从 EXIF 提取）
  createdAt   DateTime  @default(now())
  tags        String[]  @default([])

  @@index([albumId])
  @@index([takenAt])
  @@index([createdAt])
}

model ShareLink {
  id        String   @id @default(cuid())
  token     String   @unique
  albumId   String?
  mediaIds  String[] // 可分享单个或多个
  password  String?  // 可选访问密码
  expiresAt DateTime?
  createdAt DateTime @default(now())
}
```

---

## 五、推荐目录结构

```
cos/
├── app/
│   ├── (public)/                 # 前台路由组
│   │   ├── page.tsx              # 首页时间轴
│   │   ├── album/[id]/page.tsx
│   │   └── share/[token]/page.tsx
│   ├── admin/                    # 管理后台（需登录）
│   │   ├── layout.tsx
│   │   ├── page.tsx              # 仪表盘
│   │   ├── login/page.tsx
│   │   ├── albums/
│   │   ├── media/
│   │   └── upload/page.tsx
│   ├── api/
│   │   ├── auth/[...nextauth]/
│   │   ├── upload/presign/route.ts
│   │   ├── media/
│   │   ├── albums/
│   │   └── sign/route.ts         # 生成临时访问签名
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                       # shadcn 组件
│   ├── media-card.tsx
│   ├── lightbox.tsx
│   ├── upload-zone.tsx
│   └── admin-sidebar.tsx
├── lib/
│   ├── cos.ts                    # COS 客户端 + 签名工具
│   ├── prisma.ts
│   ├── auth.ts
│   └── utils.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                   # 初始化管理员
├── public/
├── .env.example
├── next.config.ts
├── package.json
└── README.md
```

---

## 六、腾讯云 COS 必做配置清单

1. **存储桶权限**：私有读写（最重要）
2. **防盗链**：
   - 白名单模式
   - 拒绝空 Referer
   - 添加：`陈庆.我爱你` 和 `*.陈庆.我爱你`
3. **签名策略**：所有对外链接必须后端生成临时签名（建议 1 小时内）
4. **CDN（强烈建议）**：
   - 绑定域名 `陈庆.我爱你`
   - 开启 URL 鉴权
   - 开启用量封顶 + 告警
5. **监控**：云监控设置外网下行流量异常告警

---

## 七、实现优先级（给 Cursor）

### Phase 1：基础骨架（先跑起来）
1. 初始化 Next.js 15 + TypeScript + Tailwind + shadcn + Prisma
2. 配置 COS SDK（`lib/cos.ts`）和签名工具函数
3. 实现 NextAuth 管理员登录
4. 实现预签名上传接口 + 拖拽上传页面

### Phase 2：核心业务
5. 相册 CRUD
6. 媒体入库、列表、删除、关联相册
7. 前台时间轴 + 相册页 + 灯箱预览
8. `/api/sign` 签名接口（所有媒体访问必须经过它）

### Phase 3：完善体验与安全
9. 分享链接（支持密码 + 过期时间）
10. 批量操作、标签、简单搜索
11. 视频播放优化、响应式适配
12. 防盗刷相关配置文档与检查清单

### Phase 4：上线
13. 域名解析 + HTTPS
14. 生产环境变量、Docker 或 Vercel 部署
15. 监控与用量封顶最终确认

---

## 八、环境变量（.env.example）

```env
# 数据库
DATABASE_URL="postgresql://user:password@localhost:5432/cos?schema=public"

# 腾讯云 COS（必填）
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=your-bucket-1250000000
COS_REGION=ap-guangzhou
COS_CDN_DOMAIN=陈庆.我爱你

# NextAuth
NEXTAUTH_SECRET=请生成一串很长的随机字符串
NEXTAUTH_URL=https://陈庆.我爱你

# 首次启动创建的管理员
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请设置强密码
```

---

## 九、注意事项（必须遵守）

1. **永远不要**把 `COS_SECRET_KEY` 暴露到前端或 Git 仓库。
2. 大文件（尤其是视频）必须使用预签名直传，避免经过自己服务器。
3. 中文域名 `陈庆.我爱你` 在代码和 CDN 配置中可直接使用。
4. 建议先用测试存储桶验证签名与防盗链，确认无误后再切生产。
5. 定期备份数据库，并考虑开启 COS 跨区域复制或生命周期管理。

---

**当前状态**：架构已完善，可直接交给 Cursor 按 Phase 顺序实现。  
如需调整技术栈、增加功能或修改优先级，随时告诉我。