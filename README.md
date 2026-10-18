# 相册 · 无损照片/视频相册系统

> **定位**：高安全、原画质、可管理的个人媒体相册。  
> 支持腾讯云 COS 与 S3 兼容存储（AWS S3 / Cloudflare R2 / MinIO 等）。

**English version below** ↓

---

## 功能特性

- **无损存储**：照片与视频按原始字节保存，不做转码或压缩
- **多厂商存储**：腾讯云 COS（完整数据万象支持）+ S3 兼容（R2 / MinIO / AWS）
- **Apple Photos 风格前台**：时间轴、密度切换、捏合缩放、灯箱预览、视频播放
- **管理后台**：批量上传、相册管理、媒体库、封面设置、分享链接、访问统计
- **强安全模型**：私有桶 + 短时效签名 URL + 登录限流 + 密钥加密存储
- **大文件支持**：单次 PUT + Multipart 分片上传（>100MB 自动切换）
- **性能优化**：图库分页 + 无限滚动、缩略图签名缓存、网格虚拟滚动

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) + TypeScript |
| UI | Tailwind CSS + Lucide React |
| 数据库 | PostgreSQL + Prisma |
| 认证 | NextAuth.js (Credentials + JWT) |
| 存储 | 腾讯云 COS / S3 兼容（AWS SDK） |
| 部署 | Docker Compose / Vercel |

---

## 快速开始

### 1. 克隆与安装

```bash
git clone https://github.com/1004cq/cos.git
cd cos
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，至少填写：

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/cos"
NEXTAUTH_SECRET="your-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"

# 腾讯云 COS（默认）
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=
COS_REGION=

# 可选：独立密钥加密密钥（生产强烈建议）
SETTINGS_ENCRYPT_KEY=
```

也可在后台「存储设置」中配置，支持运行时切换厂商。

### 3. 初始化数据库

```bash
npx prisma db push
npx prisma generate
npm run db:seed   # 可选，创建初始管理员
```

### 4. 启动

```bash
npm run dev
```

访问 `http://localhost:3000` 查看前台，`/admin/login` 进入后台。

---

## 存储厂商

在后台 **设置 → 存储** 中切换：

| 厂商 | 状态 | 说明 |
|------|------|------|
| 腾讯云 COS | ✅ 完整 | 数据万象缩略图、样式、水印、STS |
| S3 兼容 | ✅ 可用 | AWS S3 / Cloudflare R2 / MinIO，缩略图降级为原图或 poster |
| 阿里云 OSS | 🚧 占位 | 尚未实现 |

对象键统一规则：`media/YYYY/MM/DD/{timestamp}-{random}.{ext}`

---

## 安全要点

- 存储桶必须设为**私有读写**
- 所有媒体访问必须经过后端签名（`/api/sign` 或图库接口）
- 生产环境务必配置 `NEXTAUTH_SECRET` 或 `SETTINGS_ENCRYPT_KEY`
- 建议开启 COS/CDN 防盗链（Referer 白名单 + 拒绝空 Referer）
- 建议开启用量封顶与流量告警

---

## 部署

### Docker Compose（推荐自有 VPS）

```bash
docker compose up -d --build
```

### Vercel

连接 GitHub 仓库，配置环境变量后部署即可。

---

## 项目结构

```
app/                  # Next.js App Router 页面与 API
components/           # 前台与后台组件
lib/
  storage/            # 多厂商存储抽象（COS / S3 / OSS 占位）
  cos.ts              # 腾讯云 COS 核心实现
prisma/               # 数据库 Schema
```

---

## 许可证

私有项目，仅供个人使用。

---

<div align="center">

**English**

</div>

---

# Gallery · Lossless Photo & Video Album

> A high-security, original-quality, manageable personal media album.  
> Supports Tencent Cloud COS and S3-compatible storage (AWS S3 / Cloudflare R2 / MinIO, etc.).

---

## Features

- **Lossless storage**: Photos and videos are stored as original bytes (no transcoding or compression)
- **Multi-provider storage**: Tencent Cloud COS (full CI support) + S3-compatible (R2 / MinIO / AWS)
- **Apple Photos-style frontend**: Timeline, density switching, pinch-to-zoom, lightbox, video playback
- **Admin backend**: Batch upload, album management, media library, cover setting, share links, visit stats
- **Strong security model**: Private bucket + short-lived signed URLs + login rate limiting + encrypted secrets
- **Large file support**: Single PUT + Multipart upload (auto-switch for files > 100MB)
- **Performance**: Gallery pagination + infinite scroll, thumbnail sign cache, virtualized grid

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 15 (App Router) + TypeScript |
| UI | Tailwind CSS + Lucide React |
| Database | PostgreSQL + Prisma |
| Auth | NextAuth.js (Credentials + JWT) |
| Storage | Tencent Cloud COS / S3-compatible (AWS SDK) |
| Deploy | Docker Compose / Vercel |

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/1004cq/cos.git
cd cos
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill at least:

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/cos"
NEXTAUTH_SECRET="your-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"

# Tencent Cloud COS (default)
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=
COS_REGION=

# Optional: dedicated encryption key (strongly recommended in production)
SETTINGS_ENCRYPT_KEY=
```

You can also configure storage in the admin panel at runtime.

### 3. Initialize Database

```bash
npx prisma db push
npx prisma generate
npm run db:seed   # optional, creates initial admin
```

### 4. Run

```bash
npm run dev
```

Visit `http://localhost:3000` for the gallery, `/admin/login` for the admin panel.

---

## Storage Providers

Switch in **Admin → Settings → Storage**:

| Provider | Status | Notes |
|----------|--------|-------|
| Tencent Cloud COS | ✅ Full | CI thumbnails, styles, watermark, STS |
| S3-compatible | ✅ Ready | AWS S3 / Cloudflare R2 / MinIO; thumbnails degrade to original or poster |
| Alibaba Cloud OSS | 🚧 Stub | Not implemented yet |

Object key pattern: `media/YYYY/MM/DD/{timestamp}-{random}.{ext}`

---

## Security Notes

- Bucket must be **private**
- All media access must go through backend signing (`/api/sign` or gallery API)
- Production **must** set `NEXTAUTH_SECRET` or `SETTINGS_ENCRYPT_KEY`
- Enable COS/CDN referer whitelist + reject empty referer
- Enable usage caps and traffic alerts

---

## Deployment

### Docker Compose (recommended for VPS)

```bash
docker compose up -d --build
```

### Vercel

Connect the GitHub repo, set environment variables, and deploy.

---

## Project Structure

```
app/                  # Next.js App Router pages & API routes
components/           # Frontend & admin components
lib/
  storage/            # Multi-provider storage abstraction (COS / S3 / OSS stub)
  cos.ts              # Tencent Cloud COS core implementation
prisma/               # Database schema
```

---

## License

Private project, for personal use only.
