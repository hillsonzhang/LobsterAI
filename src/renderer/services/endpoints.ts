/**
 * 集中管理所有业务 API 端点。
 * 后续新增的业务接口也应在此文件中配置。
 */

import { configService } from './config';

const isTestMode = () => {
  return configService.getConfig().app?.testMode === true;
};

// 自动更新（custom fork: 使用自定义 COS 地址）
export const getUpdateCheckUrl = () =>
  'https://rpa-1308871128.cos-website.ap-guangzhou.myqcloud.com/update.json';

export const getFallbackDownloadUrl = () =>
  'https://rpa-1308871128.cos.ap-guangzhou.myqcloud.com';

// Skill 商店
export const getSkillStoreUrl = () => isTestMode()
  ? 'https://api-overmind.youdao.com/openapi/get/luna/hardware/lobsterai/test/skill-store'
  : 'https://api-overmind.youdao.com/openapi/get/luna/hardware/lobsterai/prod/skill-store';
