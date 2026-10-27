// 接口调用：图像接口（OpenAI 图像接口格式）与看图识别（OpenAI 兼容的多模态对话接口）。
// 网络函数由外部传入，测试时换成假函数。
import { b64ToBytes, editsRequest, generationsRequest, imageErrorMessage, parseImagesResponse, sniffImageType, type ImageConfig } from './core';

export type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string | Uint8Array; signal?: AbortSignal }) => Promise<Response>;

export interface InputImage { filename: string; type: string; bytes: Uint8Array }
export interface ImageCall { prompt: string; size: string; room: InputImage | null; material: InputImage | null }
export interface ImageOut { bytes: Uint8Array; mime: string; ext: string }
export type ImageFn = (call: ImageCall) => Promise<ImageOut>;
/** 看图并返回模型回复文本 */
export type VisionFn = (imageDataUrl: string, prompt: string) => Promise<string>;

export const IMAGE_TIMEOUT_MS = 240_000;

export function createImageFn(cfg: ImageConfig, fetchFn: FetchFn, plainFetch?: (url: string) => Promise<Response>): ImageFn {
  return async (call) => {
    const signal = AbortSignal.timeout(IMAGE_TIMEOUT_MS);
    let req: { url: string; headers: Record<string, string>; body: string | Uint8Array };
    if (cfg.mode === 'edits') {
      if (!call.room) throw new Error('改图模式需要先上传房间照片');
      req = editsRequest(cfg, { prompt: call.prompt, size: call.size }, call.material ? [call.room, call.material] : [call.room]);
    } else {
      req = generationsRequest(cfg, { prompt: call.prompt, size: call.size });
    }
    const res = await fetchFn(req.url, { method: 'POST', headers: req.headers, body: req.body, signal });
    if (!res.ok) throw new Error(imageErrorMessage(res.status, await res.text().catch(() => '')));
    const img = parseImagesResponse(await res.json());
    let bytes: Uint8Array;
    if (img.kind === 'b64') bytes = b64ToBytes(img.b64);
    else {
      const dl = await (plainFetch ?? ((u: string) => fetchFn(u, { method: 'GET', headers: {}, body: '', signal })))(img.url);
      if (!dl.ok) throw new Error(`下载生成的图片失败（${dl.status}）`);
      bytes = new Uint8Array(await dl.arrayBuffer());
    }
    const t = sniffImageType(bytes);
    return { bytes, mime: t.mime, ext: t.ext };
  };
}

export interface VisionConfig { baseUrl: string; apiKey: string; model: string }

/** 直接按 OpenAI 的图片消息格式调 /chat/completions（kit 的 chat() 只支持纯文本） */
export function createVisionFn(cfg: VisionConfig, fetchFn: FetchFn): VisionFn {
  return async (imageDataUrl, prompt) => {
    if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) throw new Error('还没有设置大模型：请到「设置」里填写接口地址、密钥和模型名（需要支持看图的多模态模型），或者手动选择房间类型');
    const res = await fetchFn(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, temperature: 0.1, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: imageDataUrl } }, { type: 'text', text: prompt }] }] }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const hint = res.status === 401 ? '密钥不对或已过期' : res.status === 404 ? '接口地址或模型名不对' : res.status === 429 ? '调用太频繁或额度用完' : res.status === 400 ? '这个模型可能不支持看图，请换多模态模型' : '接口返回错误';
      throw new Error(`识别失败（${res.status}，${hint}）${body ? '：' + body.slice(0, 160) : ''}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const c = data.choices?.[0]?.message?.content;
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x: { text?: string }) => x?.text ?? '').join('') : '';
    if (!text) throw new Error('大模型没有返回内容');
    return text;
  };
}
