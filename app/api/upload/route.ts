import { NextResponse } from 'next/server';
import { Client } from 'basic-ftp';
import { Readable } from 'stream';

export const runtime = 'nodejs';

// Randevu kartındaki "Resim ekle" için: telefon/bilgisayardan seçilen görsel buraya (multipart/form-data,
// alan adı "file") POST edilir; biz onu Hostinger'daki FTP klasörüne yazıp genel (public) URL'ini döndürüyoruz.
// Gerekli ortam değişkenleri (.env.local / Vercel proje ayarları — ASLA koda ya da sohbete yazılmaz):
//   HOSTINGER_FTP_HOST      — ör. ftp.alanadin.com
//   HOSTINGER_FTP_USER
//   HOSTINGER_FTP_PASSWORD
//   HOSTINGER_FTP_PORT      — ops., varsayılan 21
//   HOSTINGER_FTP_SECURE    — ops., FTPS gerekiyorsa "true" yap (çoğu Hostinger hesabında gerekmez)
//   HOSTINGER_FTP_DIR       — hedef klasör, ör. /public_html/rite-uploads
//   HOSTINGER_PUBLIC_BASE_URL — o klasörün dışarıdan erişilen tam adresi, ör. https://alanadin.com/rite-uploads
const MAX_BYTES = 8 * 1024 * 1024; // 8MB — istemci tarafında zaten küçültülüyor (bkz. BilgiKartEdit), bu son bir güvenlik sınırı
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

export async function POST(req: Request) {
  // HOSTINGER_FTP_HOST bazen "ftp://alanadin.com" ya da sonunda "/" ile girilebiliyor (Hostinger panelinden
  // kopyalanınca ya da elle yazılınca) — basic-ftp bunu ÇIPLAK bir host/IP bekliyor, şema/slash kalırsa
  // "getaddrinfo ENOTFOUND ftp://…" hatası veriyor. Burada temizleniyor ki kullanıcı nasıl yapıştırırsa yapıştırsın çalışsın.
  const host = (process.env.HOSTINGER_FTP_HOST || '').trim().replace(/^ftps?:\/\//i, '').replace(/\/+$/, '');
  const user = process.env.HOSTINGER_FTP_USER;
  const password = process.env.HOSTINGER_FTP_PASSWORD;
  const dir = process.env.HOSTINGER_FTP_DIR || '/';
  const publicBase = process.env.HOSTINGER_PUBLIC_BASE_URL;
  const port = process.env.HOSTINGER_FTP_PORT ? Number(process.env.HOSTINGER_FTP_PORT) : 21;
  if (!host || !user || !password || !publicBase) {
    return NextResponse.json({ error: 'Resim yükleme henüz ayarlanmamış (sunucuda Hostinger FTP bilgileri eksik).' }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });

  const buf = Buffer.from(await (file as File).arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ error: 'Boş dosya' }, { status: 400 });
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: 'Dosya çok büyük (en fazla 8MB)' }, { status: 400 });

  const origName = (file as File).name || 'resim.jpg';
  const ext = (origName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  if (!ALLOWED_EXT.has(ext)) return NextResponse.json({ error: 'Desteklenmeyen dosya türü (jpg/png/webp/gif olmalı)' }, { status: 400 });

  const name = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;

  // Bazı Hostinger hesapları düz FTP yerine FTPS (explicit TLS) istiyor — gerekirse HOSTINGER_FTP_SECURE=true ile açılabilir.
  const secure = /^(1|true|yes)$/i.test(process.env.HOSTINGER_FTP_SECURE || '');
  const client = new Client();
  try {
    await client.access({ host, user, password, port, secure });
    await client.ensureDir(dir);
    await client.uploadFrom(Readable.from(buf), name);
  } catch (e: any) {
    return NextResponse.json({ error: 'FTP yükleme hatası: ' + (e?.message || String(e)) }, { status: 502 });
  } finally {
    client.close();
  }

  const url = publicBase.replace(/\/+$/, '') + '/' + name;
  return NextResponse.json({ url });
}
