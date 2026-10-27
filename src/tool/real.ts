// 把真实的网络请求接到 api.ts 上（kit 的 httpFetch 与设置里的大模型）。
import { httpFetch } from '../kit/platform';
import { loadSettings } from '../kit/settings';
import { createImageFn, createVisionFn, type FetchFn, type ImageFn, type VisionFn } from './api';
import type { ImageConfig } from './core';

const fetchFn: FetchFn = (url, init) => httpFetch(url, init as RequestInit);

export const realImageFn = (cfg: ImageConfig): ImageFn => createImageFn(cfg, fetchFn, (u) => httpFetch(u));
export const realVisionFn: VisionFn = async (img, prompt) => createVisionFn((await loadSettings()).llm, fetchFn)(img, prompt);
