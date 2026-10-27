// 流程：识别房间、生成并保存一张效果图。读写文件和接口调用都从外部传入，测试时用假函数。
import type { ImageFn, InputImage, VisionFn } from './api';
import { buildPrompt, buildRecognizePrompt, outputName, parseRecognition, recordJson, resolveSize, imageReady, type ImageConfig, type Material, type PromptInput, type Recognition, type RenderRecord } from './core';

/** 识别房间；回复解析失败时重试一次（强调只输出 JSON）。接口错误直接抛出。 */
export async function recognizeRoom(vision: VisionFn, imageDataUrl: string): Promise<Recognition> {
  const prompt = buildRecognizePrompt();
  let r = parseRecognition(await vision(imageDataUrl, prompt));
  if (!r.ok) r = parseRecognition(await vision(imageDataUrl, prompt + '\n注意：只输出一个 JSON 对象，不要有任何其他文字。'));
  return r;
}

export interface FlowDeps {
  image: ImageFn;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  writeText(path: string, text: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  join(...p: string[]): Promise<string>;
  now(): Date;
  newId(): string;
}

export interface RenderInput {
  sourceName: string;
  photo: (InputImage & { w: number; h: number }) | null;
  material: Material;
  /** 材质参考图（用户上传的贴图，或内置示例材质的程序纹理）；不发送时传 null */
  materialRef: InputImage | null;
  roomId: string;
  stateId: string;
  styleId: string;
  positionId: string;
  keepStructure: boolean;
  extra: string;
  roomNote?: string;
  outDir: string;
}

export interface RenderResult { record: RenderRecord; bytes: Uint8Array; mime: string; path: string }

/** 生成一张效果图并保存（图片 + 同名 .json 参数文件）。记录里不含密钥。 */
export async function renderOnce(deps: FlowDeps, cfg: ImageConfig, input: RenderInput, seq = 0): Promise<RenderResult> {
  if (!imageReady(cfg)) throw new Error('还没有设置图像模型：请到「图像模型」页填写接口地址、密钥和模型名');
  if (cfg.mode === 'edits' && !input.photo) throw new Error('请先上传房间照片');
  const hasRef = cfg.mode === 'edits' && !!input.materialRef;
  const pi: PromptInput = {
    mode: cfg.mode, roomId: input.roomId, stateId: input.stateId, styleId: input.styleId, positionId: input.positionId,
    material: input.material, hasMaterialRef: hasRef, keepStructure: input.keepStructure, extra: input.extra, roomNote: input.roomNote,
  };
  const prompt = buildPrompt(pi);
  const size = resolveSize(cfg, input.photo?.w ?? 0, input.photo?.h ?? 0);
  const t0 = deps.now();
  const out = await deps.image({ prompt, size, room: input.photo, material: hasRef ? input.materialRef : null });
  const t1 = deps.now();
  await deps.mkdir(input.outDir);
  const name = outputName({ roomId: input.roomId, styleId: input.styleId, materialName: input.material.name }, t1, out.ext, seq);
  const path = await deps.join(input.outDir, name);
  await deps.writeFile(path, out.bytes);
  const record: RenderRecord = {
    id: deps.newId(), at: t1.toISOString(), sourceName: input.sourceName, roomId: input.roomId, stateId: input.stateId, styleId: input.styleId,
    positionId: input.positionId, materialName: input.material.name, keepStructure: input.keepStructure, extra: input.extra, model: cfg.model,
    mode: cfg.mode, size, quality: cfg.quality, prompt, file: path, seconds: Math.max(0, Math.round((t1.getTime() - t0.getTime()) / 100) / 10),
  };
  await deps.writeText(path.replace(/\.[^.\\/]+$/, '') + '.json', recordJson(record));
  return { record, bytes: out.bytes, mime: out.mime, path };
}
