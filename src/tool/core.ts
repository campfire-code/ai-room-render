// 纯函数：不依赖界面和本机能力，便于单元测试。
// 提示词拼装、识别结果解析、图像接口请求体（multipart）与响应解析、材质库与记录的增删、输出尺寸选择。

export interface Opt { id: string; zh: string; en: string }
export interface StyleOpt extends Opt { traits: string }

export const ROOMS: Opt[] = [
  { id: 'living', zh: '客厅', en: 'living room' },
  { id: 'dining', zh: '餐厅', en: 'dining room' },
  { id: 'kitchen', zh: '厨房', en: 'kitchen' },
  { id: 'bedroom', zh: '卧室', en: 'bedroom' },
  { id: 'bathroom', zh: '卫生间', en: 'bathroom' },
  { id: 'entrance', zh: '玄关', en: 'entryway' },
  { id: 'balcony', zh: '阳台', en: 'balcony' },
  { id: 'study', zh: '书房', en: 'home study' },
];

export const STATES: (Opt & { instruction: string })[] = [
  { id: 'bare', zh: '毛坯', en: 'unfinished shell', instruction: 'The room is currently a bare shell (no wall or floor finishes, exposed pipes). Complete all wall, floor and ceiling finishes and add suitable furniture and lighting.' },
  { id: 'old', zh: '旧房', en: 'old, worn', instruction: 'The room is currently an old renovated room. Renovate it: replace the existing wall and floor finishes and update the furniture and lighting.' },
  { id: 'finished', zh: '精装', en: 'already finished', instruction: 'The room is already finished. Restyle the finishes and soft furnishings while keeping the room itself.' },
];

export const STYLES: StyleOpt[] = [
  { id: 'modern', zh: '现代极简', en: 'modern minimalist', traits: 'clean lines, neutral palette, uncluttered surfaces, hidden storage, simple furniture.' },
  { id: 'luxury', zh: '轻奢', en: 'light luxury', traits: 'refined metal accents, soft velvet and leather, polished stone, elegant lighting, restrained glamour.' },
  { id: 'chinese', zh: '新中式', en: 'new Chinese', traits: 'modern interpretation of Chinese design, dark wood, symmetrical layout, lattice details, calm earthy colors.' },
  { id: 'nordic', zh: '北欧', en: 'Scandinavian', traits: 'light wood, white walls, cozy textiles, bright natural light, functional simple furniture.' },
  { id: 'american', zh: '美式经典', en: 'classic American', traits: 'warm traditional furniture, wainscoting, rich wood tones, comfortable upholstered seating.' },
  { id: 'italian', zh: '意式极简', en: 'Italian minimalist', traits: 'sleek low-profile furniture, premium stone and leather, monochrome tones, linear lighting.' },
  { id: 'wabi', zh: '日式侘寂', en: 'Japanese wabi-sabi', traits: 'natural imperfect textures, plaster walls, raw wood, muted earth tones, quiet and sparse.' },
  { id: 'industrial', zh: '工业风', en: 'industrial loft', traits: 'exposed concrete and brick, black metal frames, leather and reclaimed wood, track lighting.' },
];

export const POSITIONS: Opt[] = [
  { id: 'feature', zh: '背景墙', en: 'feature wall' },
  { id: 'floor', zh: '地面', en: 'floor' },
  { id: 'wall', zh: '墙面', en: 'walls' },
  { id: 'counter', zh: '台面', en: 'countertop' },
  { id: 'overall', zh: '整体搭配', en: 'main visible surfaces' },
];

const REC_POSITIONS: Record<string, string[]> = {
  living: ['feature', 'floor', 'overall'], dining: ['feature', 'floor', 'overall'], kitchen: ['counter', 'wall', 'floor'],
  bedroom: ['feature', 'floor', 'wall'], bathroom: ['wall', 'floor', 'counter'], entrance: ['floor', 'wall', 'feature'],
  balcony: ['floor', 'wall', 'overall'], study: ['feature', 'floor', 'wall'],
};
/** 按房间推荐应用位置（排在前面的最合适） */
export function recommendPositions(roomId: string): Opt[] {
  const ids = REC_POSITIONS[roomId] ?? [];
  return [...ids.map((i) => POSITIONS.find((p) => p.id === i)!), ...POSITIONS.filter((p) => !ids.includes(p.id))];
}

const byId = <T extends Opt>(list: T[], id: string, what: string): T => {
  const x = list.find((o) => o.id === id);
  if (!x) throw new Error(`未知的${what}：${id}`);
  return x;
};

// ---------- 材质 ----------
export interface Material {
  id: string;
  name: string;
  desc: string;
  /** 用户上传的材质贴图或参考图（data: 地址，已缩小） */
  image?: string;
  /** 内置示例材质：用程序生成的纹理，值是纹理种类 */
  builtin?: SwatchKind;
}

export type SwatchKind = 'marble-white' | 'marble-dark' | 'oak' | 'terrazzo' | 'concrete' | 'slate-green';

export const BUILTIN_MATERIALS: Material[] = [
  { id: 'b-marble-white', name: '示例·白底灰纹大理石纹', desc: 'polished white stone with soft gray veining', builtin: 'marble-white' },
  { id: 'b-marble-dark', name: '示例·深灰金纹石材', desc: 'dark charcoal stone with thin golden veins, glossy finish', builtin: 'marble-dark' },
  { id: 'b-oak', name: '示例·浅橡木纹', desc: 'light oak wood grain, matte finish, long planks', builtin: 'oak' },
  { id: 'b-terrazzo', name: '示例·水磨石', desc: 'terrazzo with small multicolored stone chips on a pale cement base', builtin: 'terrazzo' },
  { id: 'b-concrete', name: '示例·清水混凝土', desc: 'smooth gray micro-cement concrete with subtle cloudy variation, matte', builtin: 'concrete' },
  { id: 'b-slate-green', name: '示例·墨绿哑光石', desc: 'deep green matte stone with fine mottling', builtin: 'slate-green' },
];

export function validateMaterial(name: string, desc: string, image: string | undefined, existing: Material[]): string | null {
  const n = name.trim();
  if (!n) return '请填写材质名称';
  if (n.length > 30) return '材质名称最多 30 个字';
  if (existing.some((m) => m.name === n)) return `已有同名材质「${n}」`;
  if (!image && !desc.trim()) return '材质贴图和描述至少填一项，模型才知道要用什么材质';
  if (desc.length > 400) return '材质描述最多 400 个字';
  return null;
}

export function addMaterial(list: Material[], m: { name: string; desc: string; image?: string }, id: string): Material[] {
  const err = validateMaterial(m.name, m.desc, m.image, list);
  if (err) throw new Error(err);
  return [...list, { id, name: m.name.trim(), desc: m.desc.trim(), ...(m.image ? { image: m.image } : {}) }];
}

/** 内置材质不能删 */
export function removeMaterial(list: Material[], id: string): Material[] {
  return list.filter((m) => m.id !== id || m.builtin);
}

// ---------- 提示词 ----------
export interface PromptInput {
  mode: 'edits' | 'generations';
  roomId: string;
  stateId: string;
  styleId: string;
  positionId: string;
  material: { name: string; desc: string };
  /** 是否随请求附上材质参考图（第二张图） */
  hasMaterialRef: boolean;
  keepStructure: boolean;
  extra?: string;
  /** 识别时得到的房间描述（文生图模式下用来代替照片） */
  roomNote?: string;
}

/** 拼装提示词。全部是纯字符串拼接，同样的输入得到同样的输出。 */
export function buildPrompt(i: PromptInput): string {
  const room = byId(ROOMS, i.roomId, '房间类型');
  const state = byId(STATES, i.stateId, '装修状态');
  const style = byId(STYLES, i.styleId, '装修风格');
  const pos = byId(POSITIONS, i.positionId, '应用位置');
  const parts: string[] = [];
  if (i.mode === 'edits') {
    parts.push(`Turn the first photo, a ${state.en} ${room.en}, into a finished, photorealistic interior design rendering.`);
    parts.push(state.instruction);
    if (i.keepStructure) parts.push('Keep the original room layout, camera angle, perspective, ceiling height, and the positions and sizes of walls, windows and doors exactly as in the photo. Do not add or remove windows or doors.');
  } else {
    parts.push(`A photorealistic interior design rendering of a finished ${room.en}, wide-angle view from the corner of the room.`);
    if (i.roomNote?.trim()) parts.push(`Room description: ${i.roomNote.trim().slice(0, 300)}`);
  }
  parts.push(`Decoration style: ${style.en} (${style.zh}) — ${style.traits}`);
  const mat = i.material.desc.trim() ? `${i.material.name}, ${i.material.desc.trim()}` : i.material.name;
  parts.push(`Apply this material to the ${pos.en}: ${mat}.`);
  if (i.hasMaterialRef && i.mode === 'edits') parts.push('The second image is a reference swatch of this material. Reproduce its color, pattern and texture faithfully, at a realistic scale.');
  parts.push('Natural lighting, realistic proportions, materials and reflections. No text, no watermark, no people.');
  if (i.extra?.trim()) parts.push(`Additional requirements: ${i.extra.trim().slice(0, 500)}`);
  return parts.join('\n');
}

// ---------- 识别结果 ----------
export interface Recognition { ok: boolean; indoor: boolean; roomId?: string; stateId?: string; note: string; error?: string }

// check-zh: 忽略（这是发给模型的提示词，不是界面文字）
export function buildRecognizePrompt(): string {
  const rooms = ROOMS.map((r) => `${r.id}（${r.zh}）`).join('、');
  const states = STATES.map((s) => `${s.id}（${s.zh}）`).join('、');
  return `请看这张照片，判断它是不是家庭室内空间，并识别房间用途和装修状态。只输出一个 JSON 对象，不要其他文字：
{"indoor": true或false, "room": "${ROOMS.map((r) => r.id).join('|')}", "state": "${STATES.map((s) => s.id).join('|')}", "note": "用一句话描述房间布局、门窗位置和主要现状"}
room 可选：${rooms}；state 可选：${states}。如果不是家庭室内（例如户外、商铺），indoor 填 false，room 和 state 留空字符串。`;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** 容错解析模型回复：允许带代码块或前后多余文字；room / state 可以是 id 或中文名 */
export function parseRecognition(text: string): Recognition {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return { ok: false, indoor: true, note: '', error: '模型回复里没有找到 JSON' };
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text.slice(a, b + 1));
  } catch {
    return { ok: false, indoor: true, note: '', error: '模型回复不是合法的 JSON' };
  }
  const find = (list: Opt[], v: unknown) => {
    const s = norm(v);
    if (!s) return undefined;
    return list.find((x) => x.id === s || x.zh === String(v).trim() || s.includes(x.id) || String(v).includes(x.zh))?.id;
  };
  const indoor = o.indoor !== false && norm(o.indoor) !== 'false';
  const roomId = find(ROOMS, o.room);
  const stateId = find(STATES, o.state);
  const note = String(o.note ?? '').trim().slice(0, 300);
  if (!indoor) return { ok: true, indoor: false, note, error: '这看起来不是家庭室内照片，请换一张' };
  if (!roomId && !stateId) return { ok: false, indoor, note, error: '没有识别出房间用途和装修状态，请手动选择' };
  return { ok: true, indoor, roomId, stateId, note };
}

// ---------- 图像接口请求与响应（OpenAI 图像接口格式） ----------
export interface ImageConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** edits：以房间照片为底图改图（推荐）；generations：只用文字生成，无法保持原房间结构 */
  mode: 'edits' | 'generations';
  /** 'photo' 按照片比例选；其余为固定值或 auto */
  size: 'photo' | '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
  /** auto 时不发送该字段 */
  quality: 'auto' | 'low' | 'medium' | 'high';
}
export const DEFAULT_IMAGE_CONFIG: ImageConfig = { baseUrl: '', apiKey: '', model: '', mode: 'edits', size: 'photo', quality: 'auto' };
export const imageReady = (c: ImageConfig) => Boolean(c.baseUrl && c.apiKey && c.model);

/** 按原图宽高比选输出尺寸（OpenAI 图像模型通用的三个标准尺寸） */
export function pickSize(w: number, h: number): '1024x1024' | '1536x1024' | '1024x1536' {
  if (!(w > 0 && h > 0)) return '1024x1024';
  const r = w / h;
  return r > 1.15 ? '1536x1024' : r < 0.87 ? '1024x1536' : '1024x1024';
}

export function resolveSize(c: ImageConfig, photoW: number, photoH: number): string {
  return c.size === 'photo' ? pickSize(photoW, photoH) : c.size;
}

export interface MultipartFile { field: string; filename: string; type: string; bytes: Uint8Array }

/** 手工拼 multipart/form-data（不依赖 FormData，便于测试，也避开 Tauri 请求对 FormData 的差异） */
export function buildMultipart(fields: Record<string, string>, files: MultipartFile[], boundary = `----campfire${Date.now().toString(16)}`): { body: Uint8Array; contentType: string } {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  for (const f of files) {
    chunks.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename.replace(/["\r\n]/g, '_')}"\r\nContent-Type: ${f.type}\r\n\r\n`), f.bytes, enc.encode('\r\n'));
  }
  chunks.push(enc.encode(`--${boundary}--\r\n`));
  const body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of chunks) { body.set(c, off); off += c.length; }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

export interface ImageParams { prompt: string; size: string; n?: number }

/** 文字生成：POST {baseUrl}/images/generations，JSON。GPT 图像模型不支持 response_format，所以不发送。 */
export function generationsRequest(c: ImageConfig, p: ImageParams): { url: string; headers: Record<string, string>; body: string } {
  return {
    url: c.baseUrl.replace(/\/+$/, '') + '/images/generations',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
    body: JSON.stringify({ model: c.model, prompt: p.prompt, n: p.n ?? 1, size: p.size, ...(c.quality !== 'auto' ? { quality: c.quality } : {}) }),
  };
}

/** 改图：POST {baseUrl}/images/edits，multipart；多张图用重复的 image[] 字段，第一张是房间照片，第二张（可选）是材质参考图 */
export function editsRequest(c: ImageConfig, p: ImageParams, images: { filename: string; type: string; bytes: Uint8Array }[], boundary?: string): { url: string; headers: Record<string, string>; body: Uint8Array } {
  const fields: Record<string, string> = { model: c.model, prompt: p.prompt, n: String(p.n ?? 1), size: p.size };
  if (c.quality !== 'auto') fields.quality = c.quality;
  const mp = buildMultipart(fields, images.map((im) => ({ field: 'image[]', ...im })), boundary);
  return { url: c.baseUrl.replace(/\/+$/, '') + '/images/edits', headers: { 'Content-Type': mp.contentType, Authorization: `Bearer ${c.apiKey}` }, body: mp.body };
}

export type ParsedImage = { kind: 'b64'; b64: string } | { kind: 'url'; url: string };

/** 解析响应：GPT 图像模型返回 data[0].b64_json；部分兼容服务返回 data[0].url */
export function parseImagesResponse(json: unknown): ParsedImage {
  const d = (json as { data?: { b64_json?: string; url?: string }[] } | null)?.data?.[0];
  if (d?.b64_json) return { kind: 'b64', b64: d.b64_json.replace(/^data:image\/\w+;base64,/, '') };
  if (d?.url) return { kind: 'url', url: d.url };
  throw new Error('接口没有返回图片（响应里没有图片数据，请确认接口兼容 OpenAI 图像接口格式）');
}

/** 接口错误转成中文提示 */
export function imageErrorMessage(status: number, body: string): string {
  const hint = status === 401 ? '密钥不对或已过期' : status === 403 ? '没有这个模型的使用权限' : status === 404 ? '接口地址或模型名不对' : status === 400 ? '参数被拒绝（可能是图片格式、尺寸，或内容被安全审核拦截）' : status === 429 ? '调用太频繁或额度用完' : status >= 500 ? '服务端出错，稍后重试' : '接口返回错误';
  let detail = body.slice(0, 200);
  try { const m = (JSON.parse(body) as { error?: { message?: string } }).error?.message; if (m) detail = m.slice(0, 200); } catch { /* 不是 JSON 就用原文 */ }
  return `图像接口调用失败（${status}，${hint}）${detail ? '：' + detail : ''}`;
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function sniffImageType(bytes: Uint8Array): { ext: string; mime: string } {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { ext: 'png', mime: 'image/png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { ext: 'jpg', mime: 'image/jpeg' };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return { ext: 'webp', mime: 'image/webp' };
  return { ext: 'png', mime: 'image/png' };
}

// ---------- 记录 ----------
export interface RenderRecord {
  id: string;
  at: string;
  sourceName: string;
  roomId: string;
  stateId: string;
  styleId: string;
  positionId: string;
  materialName: string;
  keepStructure: boolean;
  extra: string;
  model: string;
  mode: 'edits' | 'generations';
  size: string;
  quality: string;
  prompt: string;
  file: string;
  seconds: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 20) || 'x';
/** 输出文件名：房间-风格-材质-时间，同一秒内重复生成靠序号区分 */
export function outputName(r: { roomId: string; styleId: string; materialName: string }, d: Date, ext: string, seq = 0): string {
  const room = ROOMS.find((x) => x.id === r.roomId)?.zh ?? r.roomId;
  const style = STYLES.find((x) => x.id === r.styleId)?.zh ?? r.styleId;
  return `${room}-${style}-${safe(r.materialName)}-${stamp(d)}${seq ? `-${seq + 1}` : ''}.${ext}`;
}

export function addRecord(list: RenderRecord[], r: RenderRecord, max = 200): RenderRecord[] {
  return [r, ...list].slice(0, max);
}

/** 记录的一行中文说明 */
export function describeRecord(r: RenderRecord): string {
  const g = (l: Opt[], id: string) => l.find((x) => x.id === id)?.zh ?? id;
  return `${g(ROOMS, r.roomId)} · ${g(STATES, r.stateId)} · ${g(STYLES, r.styleId)} · ${r.materialName}（${g(POSITIONS, r.positionId)}）`;
}

/** 记录文件里不含密钥，只含参数；这里把记录转成可读 JSON */
export function recordJson(r: RenderRecord): string {
  return JSON.stringify(r, null, 2) + '\n';
}

// ---------- 示例材质纹理（程序生成，确定性） ----------
function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, s: number): number {
  let t = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) { t += amp * vnoise(x * f, y * f, s + o); amp /= 2; f *= 2; }
  return t;
}
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * Math.min(1, Math.max(0, t)));

/** 返回 size×size 的 RGBA 像素。同样的种类和尺寸永远得到同样的结果。 */
export function swatchRGBA(kind: SwatchKind, size: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px / size) * 4, y = (py / size) * 4;
      let c: number[];
      switch (kind) {
        case 'marble-white': case 'marble-dark': {
          const dark = kind === 'marble-dark';
          const w = Math.abs(Math.sin((x * 1.3 + y * 0.7 + fbm(x * 1.2, y * 1.2, 3) * 5) * 2.2));
          const vein = Math.pow(1 - w, dark ? 14 : 9);
          const base = dark ? [44, 46, 50] : [238, 237, 233];
          const vc = dark ? [201, 168, 98] : [120, 124, 130];
          c = mix(mix(base, base.map((v) => v * (dark ? 1.25 : 0.94)), fbm(x * 2, y * 2, 9)), vc, vein * 0.85);
          break;
        }
        case 'oak': {
          const g = fbm(x * 0.6, y * 9, 5) * 0.8 + Math.sin(y * 28 + fbm(x * 0.5, y * 3, 7) * 6) * 0.1;
          const plank = Math.floor((px / size) * 3);
          const tint = hash(plank, 0, 11) * 0.12;
          c = mix([196, 156, 108], [150, 110, 70], g + tint);
          if (Math.abs(((px / size) * 3) % 1) < 0.01) c = [90, 66, 44];
          break;
        }
        case 'terrazzo': {
          c = mix([226, 222, 214], [210, 206, 198], fbm(x * 3, y * 3, 2));
          const cx = Math.floor(x * 7), cy = Math.floor(y * 7);
          const hv = hash(cx, cy, 21);
          if (hv > 0.55) {
            const ox = hash(cx, cy, 22), oy = hash(cx, cy, 23);
            const d = Math.hypot(x * 7 - cx - ox, y * 7 - cy - oy);
            if (d < 0.18 + hash(cx, cy, 24) * 0.18) c = [[168, 92, 78], [80, 98, 112], [196, 168, 110], [60, 60, 64]][Math.floor(hash(cx, cy, 25) * 4)];
          }
          break;
        }
        case 'concrete':
          c = mix([150, 150, 148], [186, 186, 183], fbm(x * 1.5, y * 1.5, 4) * 1.2 - 0.1);
          break;
        default:
          c = mix([30, 70, 58], [52, 98, 82], fbm(x * 4, y * 4, 6));
      }
      const i = (py * size + px) * 4;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
    }
  }
  return out;
}
