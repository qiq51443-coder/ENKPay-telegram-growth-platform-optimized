import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// 上传根目录
// Render Persistent Disk 挂载点：/opt/render/project/src/uploads
// 本地开发时自动回退到项目根目录下的 uploads 文件夹
export const UPLOAD_ROOT = process.env.UPLOAD_DIR
  || path.join(__dirname, '../../uploads');

export type UploadCategory = 'logos' | 'nft' | 'charity' | 'misc' | 'coin-icons' | 'invite' | 'miniapp-bg';

/**
 * 确保所有上传子目录存在
 * 在 startServer() 最开头调用，保证 Persistent Disk 挂载后目录结构完整
 */
export function ensureUploadDirs(): void {
  const categories: UploadCategory[] = ['logos', 'nft', 'charity', 'misc', 'coin-icons', 'invite', 'miniapp-bg'];
  categories.forEach(cat => {
    const dir = path.join(UPLOAD_ROOT, cat);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✓ Upload directory created: ${dir}`);
    }
  });
  console.log(`✓ Upload root: ${UPLOAD_ROOT}`);
}

/**
 * 将服务器磁盘绝对路径转换为公开可访问的 URL 相对路径
 * 例如: /opt/render/project/src/uploads/logos/abc.png → /uploads/logos/abc.png
 */
export function toPublicUrl(absolutePath: string): string {
  const relative = path.relative(UPLOAD_ROOT, absolutePath);
  return `/uploads/${relative.replace(/\\/g, '/')}`;
}

/**
 * 仅允许图片格式的文件过滤器
 */
const imageFileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const allowedExts = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`不支持的文件格式 "${ext}"，仅允许：PNG / JPG / JPEG / SVG / WebP / GIF`));
  }
};

/**
 * 创建指定分类的 multer diskStorage 实例
 */
function createDiskStorage(category: UploadCategory): multer.StorageEngine {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(UPLOAD_ROOT, category);
      // 确保目录存在（防御性处理）
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    },
  });
}

// Logo 上传：最大 2MB
export const logoUpload = multer({
  storage: createDiskStorage('logos'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

// NFT 图片上传：最大 5MB
export const nftUpload = multer({
  storage: createDiskStorage('nft'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// 公益项目封面上传：最大 5MB
export const charityUpload = multer({
  storage: createDiskStorage('charity'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// 通用图片上传：最大 5MB
export const miscUpload = multer({
  storage: createDiskStorage('misc'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// 币种图标上传：最大 5MB
export const coinIconUpload = multer({
  storage: createDiskStorage('coin-icons'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// 邀请卡图片上传：最大 10MB（支持 GIF 动态图）
export const inviteUpload = multer({
  storage: createDiskStorage('invite'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// 迷你 App 背景图上传：最大 10MB（支持 GIF 动态图）
export const miniappBgUpload = multer({
  storage: createDiskStorage('miniapp-bg'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});
