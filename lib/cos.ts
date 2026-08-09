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
 */
export function getUploadPresignedUrl(
  key: string,
  contentType: string,
  expires = 600 // 10 分钟
): Promise<{ url: string }> {
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
 * 所有前台展示图片/视频都必须走这个方法
 */
export function getSignedUrl(key: string, expires = 3600): Promise<string> {
  return new Promise((resolve, reject) => {
    cos.getObjectUrl(
      {
        Bucket,
        Region,
        Key: key,
        Method: 'GET',
        Sign: true,
        Expires: expires,
      },
      (err, data) => {
        if (err) return reject(err);

        let url = data.Url;

        // 如果配置了 CDN / 自定义域名，替换 host
        if (CDN) {
          try {
            const u = new URL(url);
            u.host = CDN;
            // 如果是中文域名，浏览器会自动处理，这里保持原样即可
            url = u.toString();
          } catch (e) {
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

export { cos, Bucket, Region };