// 主界面：生成 / 材质库 / 记录 / 图像模型 四个页签。生成页左边选参数，右边并排对比原图和效果图。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Plus, Trash2, Wand2, FolderOpen, RefreshCw, ScanSearch, Upload, RotateCcw } from 'lucide-react';
import type { RunContext } from '../kit/types';
import { defaultOutputDir, fs, pickFiles, pickFolder, reveal } from '../kit/platform';
import { useDroppedFiles } from '../kit/parts';
import {
  BUILTIN_MATERIALS, ROOMS, STATES, STYLES, addMaterial, addRecord, describeRecord, imageReady, recommendPositions, removeMaterial, validateMaterial,
  type ImageConfig, type Material, type RenderRecord,
} from './core';
import { recognizeRoom, renderOnce, type RenderInput } from './flow';
import { bytesToDataUrl, dataUrlToBytes, preparePhoto, shrinkToDataUrl, swatchDataUrl, swatchPng, type Photo } from './image';
import { realImageFn, realVisionFn } from './real';
import { loadImageConfig, loadMaterials, loadOutDir, loadRecords, saveImageConfig, saveMaterials, saveOutDir, saveRecords } from './store';
import { DEFAULT_IMAGE_CONFIG } from './core';
import './tool.css';

type Ctx = Pick<RunContext, 'readFile' | 'writeFile' | 'writeText' | 'mkdir' | 'join' | 'llm'>;
type Tab = 'make' | 'materials' | 'records' | 'model';
interface Shot { id: string; styleId: string; materialName: string; url: string; path: string; record: RenderRecord }

const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp'];
const PREVIEW = import.meta.env.DEV && typeof location !== 'undefined' && location.pathname.endsWith('/preview.html');
const newId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const matThumb = (m: Material) => m.image ?? (m.builtin ? swatchDataUrl(m.builtin) : '');

export function RoomRender({ ctx }: { ctx: Ctx }) {
  const [tab, setTab] = useState<Tab>('make');
  const [cfg, setCfg] = useState<ImageConfig>(DEFAULT_IMAGE_CONFIG);
  const [mats, setMats] = useState<Material[]>([]);
  const [records, setRecords] = useState<RenderRecord[]>([]);
  const [outDir, setOutDir] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [roomId, setRoomId] = useState('living');
  const [stateId, setStateId] = useState('bare');
  const [styleId, setStyleId] = useState('modern');
  const [posId, setPosId] = useState('feature');
  const [matId, setMatId] = useState(BUILTIN_MATERIALS[0].id);
  const [keep, setKeep] = useState(true);
  const [sendRef, setSendRef] = useState(true);
  const [extra, setExtra] = useState('');
  const [roomNote, setRoomNote] = useState('');
  const [recMsg, setRecMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [recBusy, setRecBusy] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [restyle, setRestyle] = useState('nordic');
  const seqRef = useRef(0);

  const allMats = useMemo(() => [...BUILTIN_MATERIALS, ...mats], [mats]);
  const material = allMats.find((m) => m.id === matId) ?? allMats[0];
  const positions = useMemo(() => recommendPositions(roomId), [roomId]);

  useEffect(() => {
    if (PREVIEW) {
      import('./demo').then(async (d) => {
        const room = d.demoRoom(), res = d.demoRender();
        const b = dataUrlToBytes(room);
        setPhoto({ name: '示例房间图.png', bytes: b.bytes, mime: b.mime, w: 900, h: 600, url: room });
        setCfg({ ...DEFAULT_IMAGE_CONFIG, baseUrl: 'https://img.example.com/v1', apiKey: 'sk-demo', model: 'image-model' });
        setStyleId('nordic'); setRestyle('modern'); setRoomId('living'); setStateId('bare'); setOutDir('~/下载/AI 装修效果图');
        const rec: RenderRecord = { id: 'd1', at: '2026-10-27T10:30:00Z', sourceName: '示例房间图.png', roomId: 'living', stateId: 'bare', styleId: 'nordic', positionId: 'feature', materialName: BUILTIN_MATERIALS[0].name, keepStructure: true, extra: '', model: 'image-model', mode: 'edits', size: '1536x1024', quality: 'auto', prompt: '（示例）', file: '/示例/客厅-北欧.png', seconds: 38.2 };
        setShots([{ id: 'd1', styleId: 'nordic', materialName: rec.materialName, url: res, path: rec.file, record: rec }]);
        setRecords([rec, { ...rec, id: 'd0', styleId: 'modern', materialName: BUILTIN_MATERIALS[2].name, positionId: 'floor', at: '2026-10-27T10:12:00Z', seconds: 41.5 }]);
        setRecMsg({ kind: 'ok', text: '识别结果：客厅 · 毛坯（可以改）' });
        setRoomNote('示例：左侧一扇窗，右侧一扇门');
      });
      return;
    }
    loadImageConfig().then(setCfg);
    loadMaterials().then(setMats);
    loadRecords().then(setRecords);
    loadOutDir().then(async (d) => setOutDir(d ?? (await defaultOutputDir('AI 装修效果图').catch(() => ''))));
  }, []);

  useEffect(() => { if (!positions.some((p) => p.id === posId)) setPosId(positions[0].id); }, [positions, posId]);
  useEffect(() => { if (restyle === styleId) setRestyle(STYLES.find((s) => s.id !== styleId)!.id); }, [styleId, restyle]);

  const loadPhoto = async (path: string) => {
    try {
      const name = path.split(/[\\/]/).pop() ?? path;
      if (!IMG_EXT.includes(name.split('.').pop()?.toLowerCase() ?? '')) throw new Error('只支持 JPG、PNG、WebP 照片（苹果 HEIC 请先转成 JPG）');
      const p = await preparePhoto(await ctx.readFile(path), name);
      setPhoto(p); setShots([]); setActive(0); setRecMsg(null); setMsg(null); setRoomNote('');
      return p;
    } catch (e) { setMsg({ kind: 'err', text: errText(e) }); return null; }
  };
  const hover = useDroppedFiles((paths) => { const p = paths.find((x) => IMG_EXT.includes(x.split('.').pop()?.toLowerCase() ?? '')); if (p) void loadPhoto(p); else setMsg({ kind: 'err', text: '请拖入 JPG、PNG 或 WebP 照片' }); });
  const choosePhoto = async () => { const [p] = await pickFiles(IMG_EXT, '房间照片'); if (p) await loadPhoto(p); };

  const recognize = async () => {
    if (!photo) return;
    setRecBusy(true); setRecMsg(null);
    try {
      const r = await recognizeRoom(realVisionFn, photo.url);
      if (!r.indoor || !r.ok) { setRecMsg({ kind: 'err', text: r.error ?? '识别失败，请手动选择' }); return; }
      if (r.roomId) setRoomId(r.roomId);
      if (r.stateId) setStateId(r.stateId);
      setRoomNote(r.note);
      const rn = ROOMS.find((x) => x.id === r.roomId)?.zh, sn = STATES.find((x) => x.id === r.stateId)?.zh;
      setRecMsg({ kind: 'ok', text: `识别结果：${[rn, sn].filter(Boolean).join(' · ')}（不对可以直接改）` });
    } catch (e) { setRecMsg({ kind: 'err', text: errText(e) }); }
    finally { setRecBusy(false); }
  };

  const generate = async (styleOverride?: string) => {
    const sid = styleOverride ?? styleId;
    setBusy(true); setMsg(null);
    try {
      const ref = sendRef && cfg.mode === 'edits' ? (material.image ? dataUrlToBytes(material.image) : material.builtin ? { bytes: await swatchPng(material.builtin), mime: 'image/png' } : null) : null;
      const input: RenderInput = {
        sourceName: photo?.name ?? '（无照片）',
        photo: photo ? { filename: 'room.jpg', type: photo.mime, bytes: photo.bytes, w: photo.w, h: photo.h } : null,
        material, materialRef: ref ? { filename: `material.${ref.mime === 'image/png' ? 'png' : 'jpg'}`, type: ref.mime, bytes: ref.bytes } : null,
        roomId, stateId, styleId: sid, positionId: posId, keepStructure: keep, extra, roomNote, outDir,
      };
      const r = await renderOnce({ image: realImageFn(cfg), writeFile: ctx.writeFile, writeText: ctx.writeText, mkdir: ctx.mkdir, join: ctx.join, now: () => new Date(), newId }, cfg, input, seqRef.current++ % 50);
      const shot: Shot = { id: r.record.id, styleId: sid, materialName: material.name, url: bytesToDataUrl(r.bytes, r.mime), path: r.path, record: r.record };
      setShots((s) => [...s, shot]); setActive(shots.length);
      const next = addRecord(records, r.record); setRecords(next); void saveRecords(next);
      setMsg({ kind: 'ok', text: `已生成，用时 ${r.record.seconds} 秒，已保存到 ${r.path}` });
    } catch (e) { setMsg({ kind: 'err', text: errText(e) }); }
    finally { setBusy(false); }
  };

  const pickOut = async () => { const d = await pickFolder(); if (d) { setOutDir(d); void saveOutDir(d); } };
  const cur = shots[active];
  const canGo = !busy && imageReady(cfg) && (cfg.mode === 'generations' || !!photo);

  const reuse = (r: RenderRecord) => {
    setRoomId(r.roomId); setStateId(r.stateId); setStyleId(r.styleId); setPosId(r.positionId); setKeep(r.keepStructure); setExtra(r.extra);
    const m = allMats.find((x) => x.name === r.materialName);
    if (m) setMatId(m.id);
    setTab('make'); setMsg({ kind: 'ok', text: m ? '已套用这条记录的参数' : `已套用参数，但材质「${r.materialName}」已不在材质库里，请重新选择` });
  };

  return (
    <div className="rr">
      <nav className="rr-tabs" role="tablist">
        {([['make', '生成'], ['materials', `材质库 (${allMats.length})`], ['records', `记录 (${records.length})`], ['model', '图像模型']] as [Tab, string][]).map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{l}{t === 'model' && !imageReady(cfg) ? ' ·未设置' : ''}</button>
        ))}
      </nav>

      {tab === 'make' && (
        <div className="rr-make">
          <section className="rr-form k-panel">
            <h4>1. 房间照片</h4>
            <button className={`rr-drop${hover ? ' hover' : ''}`} onClick={choosePhoto}>
              {photo ? <><img src={photo.url} alt="已选照片" /><span>{photo.name}，点击更换</span></> : <><Upload size={22} /><span>拖入或点击选择房间照片</span><small>JPG / PNG / WebP</small></>}
            </button>
            <div className="rr-row">
              <button className="k-btn" disabled={!photo || recBusy} onClick={recognize}><ScanSearch size={15} /> {recBusy ? '识别中…' : 'AI 识别房间'}</button>
              <span className="k-muted rr-hint">用「设置」页里填的多模态大模型识别；不想识别就手动选。</span>
            </div>
            {recMsg && <div className={`rr-note ${recMsg.kind}`} role="status">{recMsg.text}</div>}
            <div className="rr-two">
              <label className="k-field"><span className="k-label">房间用途</span><select className="k-input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>{ROOMS.map((r) => <option key={r.id} value={r.id}>{r.zh}</option>)}</select></label>
              <label className="k-field"><span className="k-label">装修状态</span><select className="k-input" value={stateId} onChange={(e) => setStateId(e.target.value)}>{STATES.map((r) => <option key={r.id} value={r.id}>{r.zh}</option>)}</select></label>
            </div>

            <h4>2. 材质</h4>
            <div className="rr-mats">
              {allMats.map((m) => (
                <button key={m.id} className={`rr-mat${m.id === matId ? ' on' : ''}`} onClick={() => setMatId(m.id)} title={m.desc || m.name}>
                  <img src={matThumb(m)} alt="" /><span>{m.name}</span>
                </button>
              ))}
              <button className="rr-mat add" onClick={() => setTab('materials')}><Plus size={18} /><span>添加材质</span></button>
            </div>
            <div className="rr-two">
              <label className="k-field"><span className="k-label">用在哪里（按房间推荐）</span><select className="k-input" value={posId} onChange={(e) => setPosId(e.target.value)}>{positions.map((p, i) => <option key={p.id} value={p.id}>{p.zh}{i === 0 ? '（推荐）' : ''}</option>)}</select></label>
              <label className="k-toggle rr-toggle"><input type="checkbox" checked={sendRef} onChange={(e) => setSendRef(e.target.checked)} disabled={cfg.mode !== 'edits'} /> 把材质图一起发给模型</label>
            </div>

            <h4>3. 风格</h4>
            <div className="rr-styles">{STYLES.map((s) => <button key={s.id} className={`rr-chip${s.id === styleId ? ' on' : ''}`} onClick={() => setStyleId(s.id)}>{s.zh}</button>)}</div>
            <label className="k-toggle rr-toggle"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> 保留原房间的结构（门窗、墙体、视角不变）</label>
            <label className="k-field"><span className="k-label">补充要求（选填）</span><input className="k-input" value={extra} maxLength={200} placeholder="例如：加一盏落地灯，沙发用浅灰色" onChange={(e) => setExtra(e.target.value)} /></label>

            <div className="rr-out"><span className="k-muted">保存到</span><code title={outDir}>{outDir || '（未选择）'}</code><button className="k-btn" onClick={pickOut}>选择文件夹</button></div>
            <button className="k-btn primary rr-go" disabled={!canGo} onClick={() => generate()}><Wand2 size={16} /> {busy ? '生成中，通常要 20～60 秒…' : '生成效果图'}</button>
            {!imageReady(cfg) && <div className="rr-note err">还没有设置图像模型，请先到「图像模型」页签填写。</div>}
            {cfg.mode === 'generations' && <div className="rr-note warn">当前是「只用文字生成」模式：不会参考你的照片，无法保持原房间结构。</div>}
          </section>

          <section className="rr-stage k-panel">
            <div className="rr-compare">
              <figure><figcaption>原图</figcaption>{photo ? <img src={photo.url} alt="原图" /> : <div className="rr-empty"><ImageIcon size={30} /><span>还没有照片</span></div>}</figure>
              <figure><figcaption>{cur ? `效果图 · ${STYLES.find((s) => s.id === cur.styleId)?.zh} · ${cur.materialName}` : '效果图'}</figcaption>
                {cur ? <img src={cur.url} alt="效果图" /> : <div className="rr-empty">{busy ? <><span className="k-spin" /><span>正在生成…</span></> : <><Wand2 size={30} /><span>生成后在这里和原图对比</span></>}</div>}
              </figure>
            </div>
            {msg && <div className={`rr-note ${msg.kind}`} role="status">{msg.text}</div>}
            {shots.length > 0 && (
              <>
                <div className="rr-shots">
                  {shots.map((s, i) => <button key={s.id} className={i === active ? 'on' : ''} onClick={() => setActive(i)}><img src={s.url} alt="" /><span>{STYLES.find((x) => x.id === s.styleId)?.zh}</span></button>)}
                </div>
                <div className="rr-row">
                  <button className="k-btn" onClick={() => cur && reveal(cur.path)}><FolderOpen size={15} /> 在文件夹中显示</button>
                  <span className="rr-grow" />
                  <select className="k-input rr-sel" aria-label="换成的风格" value={restyle} onChange={(e) => setRestyle(e.target.value)}>{STYLES.filter((s) => s.id !== styleId).map((s) => <option key={s.id} value={s.id}>{s.zh}</option>)}</select>
                  <button className="k-btn" disabled={!canGo} onClick={() => { setStyleId(restyle); void generate(restyle); }}><RefreshCw size={15} /> 换风格重新生成</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {tab === 'materials' && <Materials mats={mats} onChange={(l) => { setMats(l); void saveMaterials(l); }} use={(id) => { setMatId(id); setTab('make'); }} />}

      {tab === 'records' && (
        <section className="k-panel rr-records">
          {records.length === 0 ? <p className="k-muted">还没有记录。每次生成都会记下房间、风格、材质、模型、尺寸和完整提示词（不含密钥）。</p> : records.map((r) => (
            <details key={r.id} className="rr-rec">
              <summary><b>{describeRecord(r)}</b><span className="k-muted">{new Date(r.at).toLocaleString('zh-CN')} · {r.seconds} 秒</span></summary>
              <dl>
                <dt>原图</dt><dd>{r.sourceName}</dd>
                <dt>模型 / 方式</dt><dd>{r.model} · {r.mode === 'edits' ? '以照片为底图改图' : '只用文字生成'} · {r.size}{r.quality !== 'auto' ? ` · 质量 ${({ low: '低', medium: '中', high: '高' } as Record<string, string>)[r.quality] ?? r.quality}` : ''}</dd>
                <dt>保留结构</dt><dd>{r.keepStructure ? '是' : '否'}</dd>
                {r.extra && <><dt>补充要求</dt><dd>{r.extra}</dd></>}
                <dt>文件</dt><dd className="rr-path">{r.file}</dd>
                <dt>提示词</dt><dd><pre>{r.prompt}</pre></dd>
              </dl>
              <div className="rr-row">
                <button className="k-btn" onClick={() => reuse(r)}><RotateCcw size={14} /> 套用这些参数</button>
                <button className="k-btn" onClick={() => reveal(r.file)}><FolderOpen size={14} /> 显示文件</button>
                <button className="k-btn" onClick={() => { const n = records.filter((x) => x.id !== r.id); setRecords(n); void saveRecords(n); }}><Trash2 size={14} /> 删除记录</button>
              </div>
            </details>
          ))}
          {records.length > 0 && <button className="k-btn" onClick={() => { setRecords([]); void saveRecords([]); }}>清空记录（不删除图片）</button>}
        </section>
      )}

      {tab === 'model' && <ModelSettings cfg={cfg} onSave={(c) => { setCfg(c); void saveImageConfig(c); }} />}
    </div>
  );
}

function Materials({ mats, onChange, use }: { mats: Material[]; onChange: (l: Material[]) => void; use: (id: string) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [image, setImage] = useState<string | undefined>();
  const [err, setErr] = useState('');
  const all = [...BUILTIN_MATERIALS, ...mats];
  const pick = async () => {
    const [p] = await pickFiles(IMG_EXT, '材质贴图或参考图');
    if (!p) return;
    try { setImage(await shrinkToDataUrl(await fs.readFile(p), p.split(/[\\/]/).pop() ?? 'm.jpg')); setErr(''); } catch (e) { setErr(errText(e)); }
  };
  const add = () => {
    const e = validateMaterial(name, desc, image, all);
    if (e) return setErr(e);
    onChange(addMaterial(mats, { name, desc, image }, newId()));
    setName(''); setDesc(''); setImage(undefined); setErr('');
  };
  return (
    <div className="rr-matlib">
      <section className="k-panel">
        <h4>添加自己的材质</h4>
        <p className="k-muted">名称必填；材质贴图（或实物参考图）和文字描述至少填一项，两项都填效果最稳。贴图会缩小后保存在这台电脑上。</p>
        <label className="k-field"><span className="k-label">名称</span><input className="k-input" value={name} maxLength={30} placeholder="例如：深胡桃木" onChange={(e) => setName(e.target.value)} /></label>
        <label className="k-field"><span className="k-label">描述（建议写：颜色、纹理、光泽）</span><textarea className="k-textarea" rows={3} value={desc} maxLength={400} placeholder="例如：深色胡桃木纹，哑光，长条直纹" onChange={(e) => setDesc(e.target.value)} /></label>
        <div className="rr-row">
          <button className="k-btn" onClick={pick}><Upload size={15} /> {image ? '更换贴图' : '选择贴图 / 参考图'}</button>
          {image && <img className="rr-swatch" src={image} alt="已选贴图" />}
          <span className="rr-grow" />
          <button className="k-btn primary" onClick={add}><Plus size={15} /> 添加到材质库</button>
        </div>
        {err && <div className="rr-note err" role="alert">{err}</div>}
      </section>
      <section className="k-panel">
        <h4>全部材质</h4>
        <div className="rr-matgrid">
          {all.map((m) => (
            <div key={m.id} className="rr-matcard">
              <img src={matThumb(m)} alt="" />
              <b>{m.name}</b>
              <small className="k-muted">{m.builtin ? '内置示例（程序生成的纹理）' : m.image ? '自定义 · 带贴图' : '自定义 · 仅描述'}</small>
              <p>{m.builtin ? '提示词里已内置描述' : m.desc || '（无描述，只靠贴图）'}</p>
              <div className="rr-row"><button className="k-btn" onClick={() => use(m.id)}>用这个材质</button>{!m.builtin && <button className="k-icon-btn" aria-label={`删除${m.name}`} onClick={() => onChange(removeMaterial(mats, m.id))}><Trash2 size={15} /></button>}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ModelSettings({ cfg, onSave }: { cfg: ImageConfig; onSave: (c: ImageConfig) => void }) {
  const [d, setD] = useState(cfg);
  const [saved, setSaved] = useState(false);
  useEffect(() => setD(cfg), [cfg]);
  const up = (p: Partial<ImageConfig>) => { setD({ ...d, ...p }); setSaved(false); };
  return (
    <section className="k-panel rr-model">
      <h4>图像模型</h4>
      <p className="k-muted">填你自己的图像模型接口，兼容 OpenAI 图像接口格式（改图和文字生图两种接口，路径按 OpenAI 规则）即可。其他服务商是否兼容，请看它自己的文档。密钥只保存在这台电脑上。</p>
      <label className="k-field"><span className="k-label">接口地址</span><input className="k-input" value={d.baseUrl} placeholder="https://api.example.com/v1" onChange={(e) => up({ baseUrl: e.target.value.trim() })} /></label>
      <label className="k-field"><span className="k-label">密钥</span><input className="k-input" type="password" autoComplete="off" value={d.apiKey} placeholder="sk-..." onChange={(e) => up({ apiKey: e.target.value.trim() })} /></label>
      <label className="k-field"><span className="k-label">模型名</span><input className="k-input" value={d.model} placeholder="按服务商文档填写" onChange={(e) => up({ model: e.target.value.trim() })} /></label>
      <div className="rr-two">
        <label className="k-field"><span className="k-label">生成方式</span><select className="k-input" value={d.mode} onChange={(e) => up({ mode: e.target.value as ImageConfig['mode'] })}><option value="edits">以房间照片为底图改图（推荐）</option><option value="generations">只用文字生成（不参考照片）</option></select></label>
        <label className="k-field"><span className="k-label">输出尺寸</span><select className="k-input" value={d.size} onChange={(e) => up({ size: e.target.value as ImageConfig['size'] })}><option value="photo">按照片比例自动选</option><option value="1024x1024">方形 1024×1024</option><option value="1536x1024">横向 1536×1024</option><option value="1024x1536">竖向 1024×1536</option><option value="auto">由模型决定</option></select></label>
        <label className="k-field"><span className="k-label">质量</span><select className="k-input" value={d.quality} onChange={(e) => up({ quality: e.target.value as ImageConfig['quality'] })}><option value="auto">不指定</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
      </div>
      <div className="rr-row"><button className="k-btn primary" onClick={() => { onSave(d); setSaved(true); }}>保存</button>{saved && <span className="k-muted" role="status">已保存</span>}</div>
      <p className="k-muted">识别房间用的是「设置」页里填的大模型（需要支持看图的多模态模型），和这里的图像模型相互独立。每次生成会按服务商的规则计费。</p>
    </section>
  );
}
