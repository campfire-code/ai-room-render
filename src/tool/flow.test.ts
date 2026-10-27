import { describe, expect, it } from 'vitest';
import { createImageFn, createVisionFn, type FetchFn, type ImageFn } from './api';
import { DEFAULT_IMAGE_CONFIG, BUILTIN_MATERIALS, type ImageConfig } from './core';
import { recognizeRoom, renderOnce, type FlowDeps, type RenderInput } from './flow';

const cfg: ImageConfig = { ...DEFAULT_IMAGE_CONFIG, baseUrl: 'https://img.example.com/v1', apiKey: 'k-secret', model: 'img-model' };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const jsonRes = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });

function fsDeps(image: ImageFn) {
  const files = new Map<string, Uint8Array | string>();
  const deps: FlowDeps = {
    image, now: (() => { let t = 0; return () => new Date(new Date(2026, 9, 27, 10, 0, 0).getTime() + (t++) * 4200); })(), newId: () => 'id1',
    writeFile: async (p, d) => void files.set(p, d), writeText: async (p, t) => void files.set(p, t), mkdir: async () => {}, join: async (...p) => p.join('/'),
  };
  return { deps, files };
}

const input: RenderInput = {
  sourceName: '客厅.jpg', photo: { filename: 'room.jpg', type: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8]), w: 4000, h: 3000 },
  material: BUILTIN_MATERIALS[0], materialRef: { filename: 'm.png', type: 'image/png', bytes: PNG },
  roomId: 'living', stateId: 'bare', styleId: 'nordic', positionId: 'feature', keepStructure: true, extra: '', outDir: '/out',
};

describe('recognizeRoom', () => {
  it('第一次解析失败时重试并强调只输出 JSON', async () => {
    const calls: string[] = [];
    const replies = ['我觉得是客厅', '{"indoor":true,"room":"living","state":"bare","note":"n"}'];
    const r = await recognizeRoom(async (_u, p) => (calls.push(p), replies.shift()!), 'data:image/jpeg;base64,AA');
    expect(r).toMatchObject({ ok: true, roomId: 'living', stateId: 'bare' });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('只输出一个 JSON');
  });
  it('两次都失败时返回失败而不是抛错', async () => {
    expect((await recognizeRoom(async () => '不知道', 'x')).ok).toBe(false);
  });
});

describe('renderOnce（假图像函数）', () => {
  it('保存图片和参数文件，记录里有提示词但没有密钥', async () => {
    const seen: unknown[] = [];
    const { deps, files } = fsDeps(async (c) => (seen.push(c), { bytes: PNG, mime: 'image/png', ext: 'png' }));
    const r = await renderOnce(deps, cfg, input);
    expect(r.path).toBe('/out/客厅-北欧-示例·白底灰纹大理石纹-20261027-100004.png');
    expect(files.get(r.path)).toBe(PNG);
    const json = files.get(r.path.replace(/\.png$/, '.json')) as string;
    expect(JSON.parse(json)).toMatchObject({ model: 'img-model', mode: 'edits', size: '1536x1024', styleId: 'nordic', seconds: 4.2 });
    expect(json).not.toContain('k-secret');
    expect((seen[0] as { prompt: string }).prompt).toContain('reference swatch');
    expect((seen[0] as { material: unknown }).material).not.toBeNull();
  });
  it('没配置或缺照片时给出中文错误，并且不调用接口', async () => {
    let n = 0;
    const { deps } = fsDeps(async () => (n++, { bytes: PNG, mime: 'image/png', ext: 'png' }));
    await expect(renderOnce(deps, DEFAULT_IMAGE_CONFIG, input)).rejects.toThrow('还没有设置图像模型');
    await expect(renderOnce(deps, cfg, { ...input, photo: null })).rejects.toThrow('请先上传房间照片');
    expect(n).toBe(0);
  });
  it('文生图模式不需要照片，也不发材质图', async () => {
    const seen: { room: unknown; material: unknown; size: string }[] = [];
    const { deps } = fsDeps(async (c) => (seen.push(c), { bytes: PNG, mime: 'image/png', ext: 'png' }));
    await renderOnce(deps, { ...cfg, mode: 'generations' }, { ...input, photo: null });
    expect(seen[0]).toMatchObject({ room: null, material: null, size: '1024x1024' });
  });
  it('换风格重生成：同一张照片不同风格得到不同提示词和文件', async () => {
    const { deps, files } = fsDeps(async () => ({ bytes: PNG, mime: 'image/png', ext: 'png' }));
    const a = await renderOnce(deps, cfg, input);
    const b = await renderOnce(deps, cfg, { ...input, styleId: 'wabi' });
    expect(a.record.prompt).not.toBe(b.record.prompt);
    expect(b.path).toContain('日式侘寂');
    expect(files.size).toBe(4);
  });
});

describe('createImageFn（假网络）', () => {
  const room = { filename: 'r.jpg', type: 'image/jpeg', bytes: new Uint8Array([1]) };
  it('edits：发到 /images/edits，响应 b64_json 解码为图片', async () => {
    let url = '', ct = '', auth = '';
    const f: FetchFn = async (u, init) => { url = u; ct = init.headers['Content-Type']; auth = init.headers.Authorization; return jsonRes({ data: [{ b64_json: b64(PNG) }] }); };
    const out = await createImageFn(cfg, f)({ prompt: 'p', size: '1024x1024', room, material: null });
    expect(url).toBe('https://img.example.com/v1/images/edits');
    expect(ct).toContain('multipart/form-data');
    expect(auth).toBe('Bearer k-secret');
    expect(Array.from(out.bytes)).toEqual(Array.from(PNG));
    expect(out.ext).toBe('png');
  });
  it('generations：发 JSON；响应是 url 时再下载', async () => {
    const urls: string[] = [];
    const f: FetchFn = async (u) => { urls.push(u); return u.endsWith('/images/generations') ? jsonRes({ data: [{ url: 'https://cdn.example.com/a.png' }] }) : new Response(PNG); };
    const out = await createImageFn({ ...cfg, mode: 'generations' }, f)({ prompt: 'p', size: '1024x1024', room: null, material: null });
    expect(urls).toEqual(['https://img.example.com/v1/images/generations', 'https://cdn.example.com/a.png']);
    expect(out.bytes).toHaveLength(PNG.length);
  });
  it('错误状态转成中文提示；改图模式缺照片报错', async () => {
    const f: FetchFn = async () => jsonRes({ error: { message: 'Invalid API key' } }, 401);
    await expect(createImageFn(cfg, f)({ prompt: 'p', size: 'auto', room, material: null })).rejects.toThrow(/401.*密钥不对.*Invalid API key/);
    await expect(createImageFn(cfg, f)({ prompt: 'p', size: 'auto', room: null, material: null })).rejects.toThrow('先上传房间照片');
  });
});

describe('createVisionFn（假网络）', () => {
  it('按图片消息格式调用 chat/completions，读取文本回复', async () => {
    let body: { model: string; messages: { content: { type: string }[] }[] } | undefined;
    const f: FetchFn = async (u, init) => { expect(u).toBe('https://llm.example.com/v1/chat/completions'); body = JSON.parse(init.body as string); return jsonRes({ choices: [{ message: { content: '{"room":"living"}' } }] }); };
    const out = await createVisionFn({ baseUrl: 'https://llm.example.com/v1/', apiKey: 'k', model: 'vl' }, f)('data:image/jpeg;base64,AA', 'q');
    expect(out).toBe('{"room":"living"}');
    expect(body!.messages[0].content.map((c) => c.type)).toEqual(['image_url', 'text']);
  });
  it('没配置时提示去设置；400 提示换多模态模型', async () => {
    await expect(createVisionFn({ baseUrl: '', apiKey: '', model: '' }, async () => jsonRes({}))('x', 'q')).rejects.toThrow('还没有设置大模型');
    await expect(createVisionFn({ baseUrl: 'https://a', apiKey: 'k', model: 'm' }, async () => jsonRes({}, 400))('x', 'q')).rejects.toThrow('多模态');
  });
});
