// 工具声明：AI 装修效果图（自定义界面：生成 / 材质库 / 记录 / 图像模型）
import { Sofa as SofaAsIcon } from 'lucide-react';
import { createElement } from 'react';
import type { CustomTool } from '../kit/types';
import { RoomRender } from './Main';

const tool: CustomTool = {
  id: 'c35',
  name: 'AI 装修效果图',
  tagline: '上传房间照片，选材质和装修风格，用你自己填的图像模型生成装修效果图；可并排对比原图、换风格重新生成，每次的参数都有记录。',
  icon: SofaAsIcon,
  category: '内容生产',
  type: 'media',
  mode: 'custom',
  mainLabel: '效果图',
  needsLLM: true,
  params: [],
  Main: ({ ctx }) => createElement(RoomRender, { ctx }),
};

export default tool;
