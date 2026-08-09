import COS from 'cos-nodejs-sdk-v5';

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID!,
  SecretKey: process.env.COS_SECRET_KEY!,
});

const Bucket = process.env.COS_BUCKET!;
const Region = process.env.COS_REGION!;
const CDN = process.env.COS_CDN_DOMAIN; // 例如：陈庆.我爱你

/**
 * 生成上传预签名 URL（PUT）
 * 前端拿到后直接 PUT 文件到 COS，不经过自己服务器
 *
 * 安全建议：
 * - 默认有效期 5 分钟，尽量短
 * - 强制签入 Content-Type，减少被滥用空间
 * - 后续可升级为 STS 临时密钥生成
 */
export function getUploadPresignedUrl(
  key: string,
  contentType: string,
  expires = 300 // 默认 5 分钟
): Promise<{ url: string }> {
  // 安全：只允许上传到 media/ 目录
  if (!key.startsWith('media/')) {
    return Promise.reject(new Error('非法的上传路径'));
  }

  return new Promise((resolve, reject) => {
    cos.getObjectUrl(
      {
        Bucket,
        Region,
        Key: key,
        Method: 'PUT',
        Sign: true,
        Expires: expires,
        Headers: {
          'Content-Type': contentType,
        },
      },
      (err, data) => {
        if (err) return reject(err);
        resolve({ url: data.Url });
      }
    );
  });
}

/**
 * 生成访问签名 URL（GET）
 * 所有前台展示图片/视频都必须走这个方法（通过 /api/sign 调用）
 *
 * 安全建议：
 * - 默认 30 分钟
 * - 最大不要超过 1 小时
 * - 优先走 CDN 域名
 */
export function getSignedUrl(key: string, expires = 1800): Promise<string> {
  if (!key.startsWith('media/')) {
    return Promise.reject(new Error('非法的对象键'));
  }

  // 限制最大有效期 1 小时
  const safeExpires = Math.min(Math.max(expires, 60), 3600);

  return new Promise((resolve, reject) => {
    cos.getObjectUrl(
      {
        Bucket,
        Region,
        Key: key,
        Method: 'GET',
        Sign: true,
        Expires: safeExpires,
      },
      (err, data) => {
        if (err) return reject(err);

        let url = data.Url;

        // 如果配置了 CDN / 自定义域名，替换 host
        if (CDN) {
          try {
            const u = new URL(url);
            u.host = CDN;
            url = u.toString();
          } catch {
            // 忽略替换失败，使用原始签名地址
          }
        }

        resolve(url);
      }
    );
  });
}

/**
 * 生成对象存储 key
 * 格式：media/年/月/日/时间戳-随机串.扩展名
 */
export function generateKey(filename: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'bin';
  const random = Math.random().toString(36).slice(2, 10);

  return `media/${y}/${m}/${d}/${Date.now()}-${random}.${ext}`;
}

/**
 * 删除 COS 对象（可选，管理端删除媒体时调用）
 */
export function deleteObject(key: string): Promise<void> {
  if (!key.startsWith('media/')) {
    return Promise.reject(new Error('非法的对象键'));
  }

  return new Promise((resolve, reject) => {
    cos.deleteObject(
      {
        Bucket,
        Region,
        Key: key,
      },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

export { cos, Bucket, Region };