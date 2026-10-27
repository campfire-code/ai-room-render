// 设置、材质库、记录保存在本机应用数据目录的 settings.json（kit 的 settingsStore）。
import { settingsStore } from '../kit/platform';
import { DEFAULT_IMAGE_CONFIG, type ImageConfig, type Material, type RenderRecord } from './core';

const K = { image: 'image.c35', mats: 'materials.c35', recs: 'records.c35', out: 'outdir.c35' };

async function get<T>(key: string): Promise<T | undefined> {
  try { return (await (await settingsStore()).get<T>(key)) ?? undefined; } catch { return undefined; }
}
async function set(key: string, v: unknown): Promise<boolean> {
  try { const st = await settingsStore(); await st.set(key, v); await st.save(); return true; } catch { return false; }
}

export const loadImageConfig = async (): Promise<ImageConfig> => ({ ...DEFAULT_IMAGE_CONFIG, ...((await get<Partial<ImageConfig>>(K.image)) ?? {}) });
export const saveImageConfig = (c: ImageConfig) => set(K.image, c);
export const loadMaterials = async (): Promise<Material[]> => { const v = await get<Material[]>(K.mats); return Array.isArray(v) ? v.filter((m) => m && m.id && m.name) : []; };
export const saveMaterials = (l: Material[]) => set(K.mats, l);
export const loadRecords = async (): Promise<RenderRecord[]> => { const v = await get<RenderRecord[]>(K.recs); return Array.isArray(v) ? v : []; };
export const saveRecords = (l: RenderRecord[]) => set(K.recs, l);
export const loadOutDir = () => get<string>(K.out);
export const saveOutDir = (p: string) => set(K.out, p);
