import { describe, expect, it } from 'vitest';
import {
  BUILTIN_MATERIALS, DEFAULT_IMAGE_CONFIG, STYLES, ROOMS, addMaterial, addRecord, b64ToBytes, buildMultipart, buildPrompt, buildRecognizePrompt, describeRecord,
  editsRequest, generationsRequest, imageErrorMessage, outputName, parseImagesResponse, parseRecognition, pickSize, recommendPositions, removeMaterial, resolveSize,
  sniffImageType, swatchRGBA, validateMaterial, type ImageConfig, type PromptInput, type RenderRecord,
} from './core';

const base: PromptInput = { mode: 'edits', roomId: 'living', stateId: 'bare', styleId: 'nordic', positionId: 'feature', material: { name: '示例石材', desc: 'white stone' }, hasMaterialRef: true, keepStructure: true };
const cfg: ImageConfig = { ...DEFAULT_IMAGE_CONFIG, baseUrl: 'https://img.example.com/v1/', apiKey: 'k-test', model: 'img-model' };

describe('提示词', () => {
  it('改图模式包含房间、状态、风格、材质、保留结构与参考图说明', () => {
    const p = buildPrompt(base);
    expect(p).toContain('unfinished shell living room');
    expect(p).toContain('Scandinavian');
    expect(p).toContain('feature wall: 示例石材, white stone');
    expect(p).toContain('second image is a reference swatch');
    expect(p).toContain('Keep the original room layout');
    expect(p).toContain('No text, no watermark');
  });
  it('不保留结构、没有参考图时去掉对应句子', () => {
    const p = buildPrompt({ ...base, keepStructure: false, hasMaterialRef: false });
    expect(p).not.toContain('Keep the original room layout');
    expect(p).not.toContain('reference swatch');
  });
  it('文生图模式不提照片，带上房间描述', () => {
    const p = buildPrompt({ ...base, mode: 'generations', roomNote: '南向大窗' });
    expect(p).not.toContain('first photo');
    expect(p).not.toContain('reference swatch');
    expect(p).toContain('Room description: 南向大窗');
  });
  it('额外要求原样加入并限长；材质无描述时只用名称', () => {
    const p = buildPrompt({ ...base, material: { name: '胡桃木', desc: ' ' }, extra: '加一盏落地灯' + 'x'.repeat(600) });
    expect(p).toContain('feature wall: 胡桃木.');
    expect(p).toContain('Additional requirements: 加一盏落地灯');
    expect(p.length).toBeLessThan(2000);
  });
  it('相同输入得到相同输出，8 种风格和 8 种房间都能拼', () => {
    expect(buildPrompt(base)).toBe(buildPrompt({ ...base }));
    expect(STYLES).toHaveLength(8);
    for (const s of STYLES) for (const r of ROOMS) expect(buildPrompt({ ...base, styleId: s.id, roomId: r.id })).toContain(s.zh);
  });
  it('未知选项抛错', () => {
    expect(() => buildPrompt({ ...base, styleId: 'nope' })).toThrow('未知的装修风格');
  });
  it('按房间推荐应用位置', () => {
    expect(recommendPositions('kitchen')[0].zh).toBe('台面');
    expect(recommendPositions('living')[0].zh).toBe('背景墙');
    expect(recommendPositions('x')).toHaveLength(5);
    expect(recommendPositions('kitchen')).toHaveLength(5);
  });
});

describe('识别结果解析', () => {
  it('解析 id、中文名、带代码块的回复', () => {
    expect(parseRecognition('{"indoor":true,"room":"bedroom","state":"old","note":"窗在左侧"}')).toMatchObject({ ok: true, roomId: 'bedroom', stateId: 'old', note: '窗在左侧' });
    expect(parseRecognition('好的：\n```json\n{"indoor":true,"room":"卫生间","state":"毛坯"}\n```')).toMatchObject({ ok: true, roomId: 'bathroom', stateId: 'bare' });
  });
  it('非室内返回提示；解析不了返回失败', () => {
    const r = parseRecognition('{"indoor":false,"room":"","state":""}');
    expect(r.ok && !r.indoor && r.error).toContain('不是家庭室内');
    expect(parseRecognition('我看不出来').ok).toBe(false);
    expect(parseRecognition('{坏的}').ok).toBe(false);
    expect(parseRecognition('{"indoor":true,"room":"太空舱","state":"?"}').ok).toBe(false);
  });
  it('只识别出一项时仍可用', () => {
    expect(parseRecognition('{"room":"书房"}')).toMatchObject({ ok: true, roomId: 'study', stateId: undefined });
  });
  it('识别提示词列出全部选项', () => {
    const p = buildRecognizePrompt();
    for (const r of ROOMS) expect(p).toContain(r.id);
    expect(p).toContain('JSON');
  });
});

describe('尺寸', () => {
  it('按宽高比选标准尺寸', () => {
    expect(pickSize(4000, 3000)).toBe('1536x1024');
    expect(pickSize(3000, 4000)).toBe('1024x1536');
    expect(pickSize(1000, 1000)).toBe('1024x1024');
    expect(pickSize(0, 0)).toBe('1024x1024');
    expect(resolveSize(cfg, 4000, 3000)).toBe('1536x1024');
    expect(resolveSize({ ...cfg, size: 'auto' }, 4000, 3000)).toBe('auto');
  });
});

describe('图像接口请求', () => {
  it('generations：JSON 请求体，auto 质量不发送，不发 response_format', () => {
    const r = generationsRequest(cfg, { prompt: 'p', size: '1024x1024' });
    expect(r.url).toBe('https://img.example.com/v1/images/generations');
    expect(r.headers.Authorization).toBe('Bearer k-test');
    expect(JSON.parse(r.body)).toEqual({ model: 'img-model', prompt: 'p', n: 1, size: '1024x1024' });
    expect(JSON.parse(generationsRequest({ ...cfg, quality: 'high' }, { prompt: 'p', size: 'auto' }).body).quality).toBe('high');
  });
  it('edits：multipart，重复的 image[] 字段，第一张是房间照片', () => {
    const r = editsRequest(cfg, { prompt: '中文提示', size: '1536x1024' }, [{ filename: 'room.jpg', type: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) }, { filename: 'mat.png', type: 'image/png', bytes: new Uint8Array([9]) }], 'BND');
    expect(r.url).toBe('https://img.example.com/v1/images/edits');
    expect(r.headers['Content-Type']).toBe('multipart/form-data; boundary=BND');
    const s = new TextDecoder('latin1').decode(r.body);
    expect(s.indexOf('name="image[]"; filename="room.jpg"')).toBeLessThan(s.indexOf('name="image[]"; filename="mat.png"'));
    expect(s).toContain('name="model"\r\n\r\nimg-model');
    expect(s).toContain('name="size"\r\n\r\n1536x1024');
    expect(s).not.toContain('response_format');
    expect(s.endsWith('--BND--\r\n')).toBe(true);
    // 中文提示词按 UTF-8 编码
    expect(new TextDecoder().decode(r.body)).toContain('中文提示');
  });
  it('multipart 二进制内容原样保留，文件名中的引号被替换', () => {
    const { body } = buildMultipart({}, [{ field: 'f', filename: 'a"b.png', type: 'image/png', bytes: new Uint8Array([0, 255, 13, 10]) }], 'B');
    const idx = Array.from(body).findIndex((_, i) => body[i] === 0 && body[i + 1] === 255 && body[i + 2] === 13 && body[i + 3] === 10);
    expect(idx).toBeGreaterThan(0);
    expect(new TextDecoder('latin1').decode(body)).toContain('filename="a_b.png"');
  });
});

describe('图像接口响应', () => {
  it('解析 b64_json（含 data: 前缀）和 url', () => {
    expect(parseImagesResponse({ data: [{ b64_json: 'QUJD' }] })).toEqual({ kind: 'b64', b64: 'QUJD' });
    expect(parseImagesResponse({ data: [{ b64_json: 'data:image/png;base64,QUJD' }] })).toEqual({ kind: 'b64', b64: 'QUJD' });
    expect(parseImagesResponse({ data: [{ url: 'https://x/y.png' }] })).toEqual({ kind: 'url', url: 'https://x/y.png' });
    expect(() => parseImagesResponse({ data: [] })).toThrow('没有返回图片');
    expect(() => parseImagesResponse(null)).toThrow();
  });
  it('错误信息带状态提示和接口原因', () => {
    expect(imageErrorMessage(401, '')).toContain('密钥不对');
    expect(imageErrorMessage(400, JSON.stringify({ error: { message: 'bad size' } }))).toContain('bad size');
    expect(imageErrorMessage(429, 'x')).toContain('额度');
  });
  it('base64 解码与图片类型识别', () => {
    expect(Array.from(b64ToBytes('QUJD'))).toEqual([65, 66, 67]);
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 1])).ext).toBe('png');
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 1])).ext).toBe('jpg');
    expect(sniffImageType(new Uint8Array([0x52, 0x49, 0, 0, 0, 0, 0, 0, 0x57])).ext).toBe('webp');
  });
});

describe('材质库', () => {
  it('校验：名称必填、不重名、贴图或描述至少一项', () => {
    const l = BUILTIN_MATERIALS;
    expect(validateMaterial(' ', 'x', undefined, l)).toContain('名称');
    expect(validateMaterial(l[0].name, 'x', undefined, l)).toContain('同名');
    expect(validateMaterial('新材质', '', undefined, l)).toContain('至少填一项');
    expect(validateMaterial('新材质', '', 'data:image/png;base64,AA', l)).toBeNull();
    expect(validateMaterial('新材质', 'x'.repeat(401), undefined, l)).toContain('400');
  });
  it('添加后可删除，内置材质删不掉', () => {
    const l = addMaterial(BUILTIN_MATERIALS, { name: ' 我的木纹 ', desc: ' 深色胡桃木 ' }, 'u1');
    expect(l.at(-1)).toEqual({ id: 'u1', name: '我的木纹', desc: '深色胡桃木' });
    expect(removeMaterial(l, 'u1')).toHaveLength(BUILTIN_MATERIALS.length);
    expect(removeMaterial(l, 'b-oak')).toHaveLength(l.length);
    expect(() => addMaterial(l, { name: '我的木纹', desc: 'x' }, 'u2')).toThrow('同名');
  });
  it('内置示例材质不含品牌，名称都标「示例」', () => {
    expect(BUILTIN_MATERIALS.every((m) => m.name.startsWith('示例') && m.builtin)).toBe(true);
  });
});

describe('示例纹理', () => {
  it('每种纹理确定、不透明、彼此不同', () => {
    const kinds = BUILTIN_MATERIALS.map((m) => m.builtin!);
    const px = kinds.map((k) => swatchRGBA(k, 24));
    for (const p of px) {
      expect(p).toHaveLength(24 * 24 * 4);
      expect(p.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true);
    }
    expect(Array.from(swatchRGBA('oak', 24))).toEqual(Array.from(swatchRGBA('oak', 24)));
    expect(new Set(px.map((p) => p.join(','))).size).toBe(kinds.length);
  });
});

describe('记录', () => {
  const rec = (id: string): RenderRecord => ({ id, at: '2026-10-27T10:00:00Z', sourceName: 'a.jpg', roomId: 'living', stateId: 'bare', styleId: 'nordic', positionId: 'feature', materialName: '示例石材', keepStructure: true, extra: '', model: 'm', mode: 'edits', size: '1024x1024', quality: 'auto', prompt: 'p', file: '/o/a.png', seconds: 3 });
  it('新记录排最前并限制数量', () => {
    let l: RenderRecord[] = [];
    for (let i = 0; i < 5; i++) l = addRecord(l, rec(String(i)), 3);
    expect(l.map((r) => r.id)).toEqual(['4', '3', '2']);
  });
  it('说明文字与文件名', () => {
    expect(describeRecord(rec('1'))).toBe('客厅 · 毛坯 · 北欧 · 示例石材（背景墙）');
    const d = new Date(2026, 9, 27, 9, 5, 7);
    expect(outputName({ roomId: 'living', styleId: 'nordic', materialName: '示例/石材 A' }, d, 'png')).toBe('客厅-北欧-示例石材A-20261027-090507.png');
    expect(outputName({ roomId: 'living', styleId: 'nordic', materialName: 'x' }, d, 'jpg', 1)).toBe('客厅-北欧-x-20261027-090507-2.jpg');
  });
});
