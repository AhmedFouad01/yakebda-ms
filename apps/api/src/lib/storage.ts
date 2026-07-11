import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

/**
 * YKMS-02G — تجريد التخزين.
 * واجهة StorageAdapter متوافقة مستقبلًا مع التخزين السحابي (S3/GCS).
 * حاليًا LocalStorageAdapter يكتب إلى مجلد آمن ويولّد رابطًا عامًا.
 * لا نثق باسم الملف الأصلي، ولا نسمح بأنواع تنفيذية، ولا path traversal.
 */

export interface StoredFile {
  url: string; // الرابط العام النسبي (يخدمه express static)
  key: string; // المفتاح الداخلي (المسار النسبي)
  size: number;
  mime: string;
}

export interface StorageAdapter {
  save(input: { data: Buffer; mime: string; prefix?: string }): Promise<StoredFile>;
  delete(key: string): Promise<void>;
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const ALLOWED_IMAGE_MIME = Object.keys(MIME_EXT);
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB خام قبل المعالجة

export function validateImage(mime: string, size: number): string | null {
  if (!ALLOWED_IMAGE_MIME.includes(mime)) return "نوع الصورة غير مسموح (JPG/PNG/WebP فقط)";
  if (size <= 0) return "الملف فارغ";
  if (size > MAX_IMAGE_BYTES) return "حجم الصورة يتجاوز 3 ميجابايت";
  return null;
}

export class LocalStorageAdapter implements StorageAdapter {
  private root: string;
  private publicBase: string;

  constructor(root: string, publicBase = "/uploads") {
    this.root = root;
    this.publicBase = publicBase;
  }

  async save({ data, mime, prefix = "products" }: { data: Buffer; mime: string; prefix?: string }): Promise<StoredFile> {
    const ext = MIME_EXT[mime];
    if (!ext) throw new Error("نوع غير مدعوم");
    // اسم عشوائي — لا نثق باسم المستخدم إطلاقًا (منع traversal/تنفيذ)
    const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
    const safePrefix = prefix.replace(/[^a-z0-9_-]/gi, "");
    const dir = path.join(this.root, safePrefix);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, name);
    // تأكيد أن المسار داخل الجذر (دفاع إضافي)
    if (!path.resolve(filePath).startsWith(path.resolve(this.root))) {
      throw new Error("مسار غير صالح");
    }
    await fs.writeFile(filePath, data);
    const key = `${safePrefix}/${name}`;
    return { url: `${this.publicBase}/${key}`, key, size: data.length, mime };
  }

  async delete(key: string): Promise<void> {
    const clean = key.replace(/^\/+/, "").replace(/\.\./g, "");
    const filePath = path.join(this.root, clean);
    if (!path.resolve(filePath).startsWith(path.resolve(this.root))) return;
    await fs.rm(filePath, { force: true });
  }
}

// مفردة افتراضية للتطوير المحلي.
let adapter: StorageAdapter | null = null;
export function getStorage(): StorageAdapter {
  if (!adapter) {
    const root = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
    adapter = new LocalStorageAdapter(root);
  }
  return adapter;
}

export function setStorage(a: StorageAdapter): void {
  adapter = a;
}
