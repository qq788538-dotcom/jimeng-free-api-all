import _ from "lodash";

import APIException from "@/lib/exceptions/APIException.ts";
import EX from "@/api/consts/exceptions.ts";
import util from "@/lib/util.ts";
import { getCredit, receiveCredit, request, uploadFile } from "./core.ts";
import logger from "@/lib/logger.ts";
import browserService from "@/lib/browser-service.ts";

const DEFAULT_ASSISTANT_ID = 513695;
export const DEFAULT_MODEL = "jimeng-video-3.0";
const DEFAULT_DRAFT_VERSION = "3.2.8";
const SEEDANCE_DRAFT_VERSION = "3.3.9";

const MODEL_DRAFT_VERSIONS: { [key: string]: string } = {
  "jimeng-video-3.0-pro": "3.2.8",
  "jimeng-video-3.0": "3.2.8",
  "jimeng-video-3.0-fast": "3.2.8",
  "jimeng-video-s2.0": "3.2.8",
  "jimeng-video-2.0-pro": "3.2.8",
  "seedance-2.0": SEEDANCE_DRAFT_VERSION,
  "seedance-2.0-pro": SEEDANCE_DRAFT_VERSION,
  "seedance-2.0-fast": SEEDANCE_DRAFT_VERSION,
  "jimeng-seedance-2.0": SEEDANCE_DRAFT_VERSION,
  "jimeng-video-seedance-2.0": SEEDANCE_DRAFT_VERSION,
  "jimeng-video-seedance-2.0-fast": SEEDANCE_DRAFT_VERSION,
  "jimeng-video-3.5-pro": "3.3.4",
};

const MODEL_MAP = {
  "jimeng-video-3.0-pro": "dreamina_ic_generate_video_model_vgfm_3.0_pro",
  "jimeng-video-3.0": "dreamina_ic_generate_video_model_vgfm_3.0",
  "jimeng-video-3.0-fast": "dreamina_ic_generate_video_model_vgfm_3.0_fast",
  "jimeng-video-s2.0": "dreamina_ic_generate_video_model_vgfm_lite",
  "jimeng-video-2.0-pro": "dreamina_ic_generate_video_model_vgfm1.0",
  "seedance-2.0": "dreamina_seedance_40_pro",
  "seedance-2.0-pro": "dreamina_seedance_40_pro",
  "seedance-2.0-fast": "dreamina_seedance_40",
  "jimeng-seedance-2.0": "dreamina_seedance_40_pro",
  "jimeng-video-seedance-2.0": "dreamina_seedance_40_pro",
  "jimeng-video-seedance-2.0-fast": "dreamina_seedance_40",
  "jimeng-video-3.5-pro": "dreamina_ic_generate_video_model_vgfm_3.5_pro",
};

const SEEDANCE_BENEFIT_TYPE_MAP: { [key: string]: string } = {
  "seedance-2.0": "dreamina_video_seedance_20_pro",
  "seedance-2.0-pro": "dreamina_video_seedance_20_pro",
  "seedance-2.0-fast": "dreamina_seedance_20_fast",
  "jimeng-seedance-2.0": "dreamina_video_seedance_20_pro",
  "jimeng-video-seedance-2.0": "dreamina_video_seedance_20_pro",
  "jimeng-video-seedance-2.0-fast": "dreamina_seedance_20_fast",
};

export function getModel(model: string) {
  return MODEL_MAP[model] || MODEL_MAP[DEFAULT_MODEL];
}

// 视频支持的比例列表
const VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

/**
 * 从提示词中检测视频比例
 * 支持格式: 16:9, 16：9, 比例16:9, 横屏, 竖屏 等
 */
function detectVideoAspectRatio(prompt: string): string {
  // 正则匹配比例格式 (支持中英文冒号)
  const ratioRegex = /(\d+)\s*[:：]\s*(\d+)/g;
  const matches = [...prompt.matchAll(ratioRegex)];

  for (const match of matches) {
    const key = `${match[1]}:${match[2]}`;
    if (VIDEO_ASPECT_RATIOS.includes(key)) {
      logger.info(`从提示词中检测到视频比例: ${key}`);
      return key;
    }
  }

  // 支持中文关键词
  if (/横屏|横版|宽屏/.test(prompt)) {
    logger.info(`从提示词中检测到横屏关键词，使用 16:9`);
    return "16:9";
  }
  if (/竖屏|竖版|手机/.test(prompt)) {
    logger.info(`从提示词中检测到竖屏关键词，使用 9:16`);
    return "9:16";
  }
  if (/方形|正方/.test(prompt)) {
    logger.info(`从提示词中检测到方形关键词，使用 1:1`);
    return "1:1";
  }

  return "16:9"; // 默认 16:9 (User preference or standard default)
}

/**
 * 从提示词中检测视频时长
 * 支持格式: 5秒, 10秒, 5s, 10s
 * @returns 5 或 10，未检测到返回 null
 */
function detectVideoDuration(prompt: string): number | null {
  // 匹配中文秒数
  if (/10\s*[秒sS]/.test(prompt)) {
    logger.info(`从提示词中检测到时长: 10秒`);
    return 10;
  }
  if (/5\s*[秒sS]/.test(prompt)) {
    logger.info(`从提示词中检测到时长: 5秒`);
    return 5;
  }
  return null; // 未检测到
}

/**
 * 通过 get_local_item_list 获取高清视频下载URL
 */
async function fetchHighQualityVideoUrl(itemId: string, refreshToken: string): Promise<string | null> {
  try {
    logger.info(`尝试获取高质量视频下载URL，item_id: ${itemId}`);

    const result = await request("post", "/mweb/v1/get_local_item_list", refreshToken, {
      data: {
        item_id_list: [itemId],
        pack_item_opt: {
          scene: 1,
          need_data_integrity: true,
        },
        is_for_video_download: true,
      },
    });

    const responseStr = JSON.stringify(result);

    // 策略1: 结构化字段提取
    const itemList = result.item_list || result.local_item_list || [];
    if (itemList.length > 0) {
      const item = itemList[0];
      const videoUrl =
        item?.video?.transcoded_video?.origin?.video_url ||
        item?.video?.download_url ||
        item?.video?.play_url ||
        item?.video?.url;
      if (videoUrl) return videoUrl;
    }

    // 策略2: 正则匹配高清URL (dreamnia.jimeng.com)
    const hqUrlMatch = responseStr.match(/https:\/\/v[0-9]+-dreamnia\.jimeng\.com\/[^"\s\\]+/);
    if (hqUrlMatch?.[0]) return hqUrlMatch[0];

    // 策略3: jimeng.com 域名视频URL
    const jimengUrlMatch = responseStr.match(/https:\/\/v[0-9]+-[^"\\]*\.jimeng\.com\/[^"\s\\]+/);
    if (jimengUrlMatch?.[0]) return jimengUrlMatch[0];

    // 策略4: 回退到任意视频URL
    const anyVideoUrlMatch = responseStr.match(/https:\/\/v[0-9]+-[^"\\]*\.(vlabvod|jimeng)\.com\/[^"\s\\]+/);
    if (anyVideoUrlMatch?.[0]) return anyVideoUrlMatch[0];

    return null;
  } catch (error) {
    logger.warn(`获取高质量视频下载URL失败: ${error.message}`);
    return null;
  }
}

/**
 * 生成视频
 *
 * @param _model 模型名称
 * @param prompt 提示词
 * @param options 选项
 * @param refreshToken 刷新令牌
 * @returns 视频URL
 */
export async function generateVideo(
  _model: string,
  prompt: string,
  {
    ratio = "16:9",
    resolution = "720p",
    duration = 10,
    filePaths = [],
  }: {
    ratio?: string;
    resolution?: string;
    duration?: number;
    filePaths?: string[];
  },
  refreshToken: string
) {
  const model = getModel(_model);

  // 比例逻辑：优先使用 ratio 参数，如果 ratio 是默认且 detecting logic kicks in, use detected.
  // 简化：如果 ratio 是 "custom" 或者在列表中，优先使用。
  // 实际上，为了保持和 images.ts 一致，我们优先信任参数。
  // 但为了保留 prompt feature：
  // 如果 ratio 没传 (undefined) -> default "16:9"。
  // 我们这里 assume caller handles default logic or we do.
  // 这里我们信任 ratio 参数 (caller passed it).
  let videoAspectRatio = ratio;
  if (!VIDEO_ASPECT_RATIOS.includes(videoAspectRatio)) {
    const detected = detectVideoAspectRatio(prompt);
    // 如果 parameters 指定了无效值，或者 caller didn't specify (using default), we might fallback to detected
    // 但这里 defaults "16:9" defined in destructuring.
    // So checking if it matches default is tricky.
    // 简单起见：如果 prompt 显式包含比例，覆盖默认值 "16:9"？
    // 不，参数 > prompt。Prompt detection is useful when params are NOT supported/provided by client.
    // API clients passing params explicitly expect them to work.
    // If client sends 16:9 (default) but prompt says 9:16, ambiguity.
    // 策略: 仅当 ratio 为默认值时尝试 detection?
    // 鉴于这是 API，我们应该严格遵守参数。如果用户没传参数 (default "16:9")，但 prompt 写了 "9:16"，理想情况下 Client 应该解析 prompt 并传参。
    // 但为了兼容旧习惯，如果用户没传显式参数（依赖默认），且 prompt 有明确指示，用 prompt。
    // 这里无法区分 "user passed 16:9" vs "default 16:9".
    // 我们保留 detective logic but verify usage.
    // 实际上原代码仅靠 detection，现在有了 parameter。
    // 建议：如果 detection 发现了 ratio，使用 detection。否则使用 parameter/default。
    // Wait, that overrides parameter? No.
    // 正确做法：Caller (Route) extracts params. If caller didn't extract, it uses default.
    // 我们就优先使用 parameter。

    // 但是如果参数是 "16:9" (默认) 而 prompt 是 "9:16"，是否用 prompt?
    // Risk: User wants 16:9 but prompt has "9:16" text for other reasons.
    // Decision: Use parameter 'ratio' as truth.
    videoAspectRatio = "16:9";
  }
  // 实际上，如果参数不在 VIDEO_ASPECT_RATIOS 中 (e.g. invalid), fallback to detected or default.
  if (!VIDEO_ASPECT_RATIOS.includes(ratio)) {
    const detected = detectVideoAspectRatio(prompt);
    if (VIDEO_ASPECT_RATIOS.includes(detected)) videoAspectRatio = detected;
    else videoAspectRatio = "16:9";
  } else {
    videoAspectRatio = ratio;
  }

  // 分辨率处理: Seedance 2.0 只支持 720p
  const isSeedanceModel = _model.includes("seedance");
  let finalResolution = resolution;
  if (isSeedanceModel && resolution !== "720p") {
    finalResolution = "720p";
    logger.info(`Seedance 2.0 只支持 720p，已自动调整`);
  }

  // 时长处理: 2.0系列只支持5秒，3.0系列支持5秒和10秒，Seedance 2.0支持4-15秒
  const is3xModel = _model.includes("3.0");
  let finalDuration = duration;

  if (isSeedanceModel) {
    // Seedance 2.0: 支持4-15秒
    if (duration < 4) {
      finalDuration = 4;
      logger.info(`Seedance 2.0 最短4秒，已自动调整`);
    } else if (duration > 15) {
      finalDuration = 15;
      logger.info(`Seedance 2.0 最长15秒，已自动调整`);
    } else {
      finalDuration = duration;
    }
  } else if (!is3xModel) {
    // 2.0系列强制5秒
    finalDuration = 5;
    if (duration !== 5) {
      logger.info(`2.0系列模型只支持5秒，已自动调整`);
    }
  } else {
    // 3.0系列: 检测提示词中的时长
    const detectedDuration = detectVideoDuration(prompt);
    if (detectedDuration !== null && duration === 10) {
      // 如果参数是默认值且 prompt 中有显式指定，使用 prompt 中的值
      finalDuration = detectedDuration;
    }
  }

  const durationMs = finalDuration * 1000;

  logger.info(
    `使用模型: ${_model} 映射模型: ${model} 分辨率: ${finalResolution} 比例: ${videoAspectRatio} 时长: ${durationMs}ms (${finalDuration}秒)`
  );

  // 检查积分
  const { totalCredit } = await getCredit(refreshToken);
  if (totalCredit <= 0) await receiveCredit(refreshToken);

  // 处理首帧和尾帧图片
  let first_frame_image = undefined;
  let end_frame_image = undefined;

  if (filePaths && filePaths.length > 0) {
    // 统计图片类型而不是显示完整内容
    const imageTypes = filePaths.map((p) =>
      p.startsWith("data:") ? "base64" : p.startsWith("http") ? "url" : "file"
    );
    logger.info(
      `接收到 ${filePaths.length} 张图片用于首尾帧，类型: ${JSON.stringify(
        imageTypes
      )}`
    );
    let uploadIDs: string[] = [];

    for (let i = 0; i < filePaths.length; i++) {
      // ... (Upload Logic similar to previous) ...
      const filePath = filePaths[i];
      if (!filePath) continue;
      try {
        const pathDesc = filePath.startsWith("data:")
          ? `base64图片`
          : filePath.substring(0, 80);
        const uploadResult = await uploadFile(refreshToken, filePath);
        if (uploadResult && uploadResult.image_uri) {
          uploadIDs.push(uploadResult.image_uri);
        }
      } catch (e) {
        logger.error(`上传失败: ${e.message}`);
        if (i === 0)
          throw new APIException(EX.API_REQUEST_FAILED, "首帧上传失败");
      }
    }

    // ... Assign frames ...
    if (uploadIDs[0]) {
      first_frame_image = {
        format: "",
        height: 1024, // Placeholder, 实际应根据 ratio
        id: util.uuid(),
        image_uri: uploadIDs[0],
        name: "",
        platform_type: 1,
        source_from: "upload",
        type: "image",
        uri: uploadIDs[0],
        width: 1024,
      };
    }
    if (uploadIDs[1]) {
      end_frame_image = {
        format: "", // ... Same structure
        height: 1024,
        id: util.uuid(),
        image_uri: uploadIDs[1],
        name: "",
        platform_type: 1,
        source_from: "upload",
        type: "image",
        uri: uploadIDs[1],
        width: 1024,
      };
    }
  }

  const componentId = util.uuid();
  const draftVersion = MODEL_DRAFT_VERSIONS[_model] || DEFAULT_DRAFT_VERSION;
  const metricsExtra = JSON.stringify({
    enterFrom: "click",
    isDefaultSeed: 1,
    promptSource: "custom",
    isRegenerate: false,
    originSubmitId: util.uuid(),
  });

  // 根据模型类型确定积分计费类型
  const benefitType = isSeedanceModel
    ? (SEEDANCE_BENEFIT_TYPE_MAP[_model] || "dreamina_video_seedance_20_pro")
    : "basic_video_operation_vgfm_v_three";

  // 构建请求参数 - Seedance 和普通视频使用不同的结构
  let requestData: any;

  if (isSeedanceModel) {
    // Seedance 2.0 专用请求结构
    // 构建 material_list 和 meta_list（用于图片参考）
    const materialList: any[] = [];
    const metaList: any[] = [];

    if (first_frame_image) {
      const matId = util.uuid();
      materialList.push({
        type: "image",
        id: matId,
        image_uri: first_frame_image.image_uri,
        uri: first_frame_image.uri,
        source_from: "upload",
        platform_type: 1,
        aigc_image: {
          image_uri: first_frame_image.image_uri,
          uri: first_frame_image.uri,
          width: first_frame_image.width,
          height: first_frame_image.height,
        },
      });
      metaList.push({
        type: "image",
        id: util.uuid(),
        material_id: matId,
      });
    }

    // Seedance 使用 prompt 放在 meta_list 的 text 类型中
    if (prompt) {
      metaList.push({
        type: "text",
        id: util.uuid(),
        content: prompt,
      });
    }

    requestData = {
      params: {
        aigc_features: "app_lip_sync",
        web_version: "7.5.0",
        da_version: draftVersion,
        web_component_open_flag: 1,
      },
      data: {
        extend: {
          root_model: model,
          m_video_commerce_info: {
            benefit_type: benefitType,
            resource_id: "generate_video",
            resource_id_type: "str",
            resource_sub_type: "aigc",
          },
          m_video_commerce_info_list: [
            {
              benefit_type: benefitType,
              resource_id: "generate_video",
              resource_id_type: "str",
              resource_sub_type: "aigc",
            },
          ],
        },
        submit_id: util.uuid(),
        metrics_extra: metricsExtra,
        draft_content: JSON.stringify({
          type: "draft",
          id: util.uuid(),
          min_version: draftVersion,
          min_features: ["AIGC_Video_UnifiedEdit"],
          is_from_tsn: true,
          version: draftVersion,
          main_component_id: componentId,
          component_list: [
            {
              type: "video_base_component",
              id: componentId,
              min_version: "1.0.0",
              aigc_mode: "workbench",
              metadata: {
                type: "",
                id: util.uuid(),
                created_platform: 3,
                created_platform_version: "",
                created_time_in_ms: String(Date.now()),
                created_did: "",
              },
              generate_type: "gen_video",
              abilities: {
                type: "",
                id: util.uuid(),
                gen_video: {
                  type: "",
                  id: util.uuid(),
                  text_to_video_params: {
                    type: "",
                    id: util.uuid(),
                    video_gen_inputs: [
                      {
                        type: "",
                        id: util.uuid(),
                        min_version: draftVersion,
                        prompt: "",
                        video_mode: 2,
                        fps: 24,
                        duration_ms: durationMs,
                        idip_meta_list: [],
                        unified_edit_input: {
                          type: "",
                          id: util.uuid(),
                          material_list: materialList,
                          meta_list: metaList,
                        },
                      },
                    ],
                    video_aspect_ratio: videoAspectRatio,
                    seed: Math.floor(Math.random() * 1000000000),
                    model_req_key: model,
                    priority: 0,
                  },
                  video_task_extra: metricsExtra,
                },
              },
              process_type: 1,
            },
          ],
        }),
        http_common_info: {
          aid: Number(DEFAULT_ASSISTANT_ID),
        },
      },
    };
  } else {
    // 普通视频模型请求结构
    requestData = {
      params: {
        aigc_features: "app_lip_sync",
        web_version: "6.6.0",
        da_version: draftVersion,
      },
      data: {
        extend: {
          root_model: model,
          m_video_commerce_info: {
            benefit_type: benefitType,
            resource_id: "generate_video",
            resource_id_type: "str",
            resource_sub_type: "aigc",
          },
          m_video_commerce_info_list: [
            {
              benefit_type: benefitType,
              resource_id: "generate_video",
              resource_id_type: "str",
              resource_sub_type: "aigc",
            },
          ],
        },
        submit_id: util.uuid(),
        metrics_extra: metricsExtra,
        draft_content: JSON.stringify({
          type: "draft",
          id: util.uuid(),
          min_version: "3.0.5",
          is_from_tsn: true,
          version: draftVersion,
          main_component_id: componentId,
          component_list: [
            {
              type: "video_base_component",
              id: componentId,
              min_version: "1.0.0",
              metadata: {
                type: "",
                id: util.uuid(),
                created_platform: 3,
                created_platform_version: "",
                created_time_in_ms: Date.now(),
                created_did: "",
              },
              generate_type: "gen_video",
              aigc_mode: "workbench",
              abilities: {
                type: "",
                id: util.uuid(),
                gen_video: {
                  id: util.uuid(),
                  type: "",
                  text_to_video_params: {
                    type: "",
                    id: util.uuid(),
                    model_req_key: model,
                    priority: 0,
                    seed: Math.floor(Math.random() * 100000000) + 2500000000,
                    video_aspect_ratio: videoAspectRatio,
                    video_gen_inputs: [
                      {
                        duration_ms: durationMs,
                        first_frame_image: first_frame_image,
                        end_frame_image: end_frame_image,
                        fps: 24,
                        id: util.uuid(),
                        min_version: "3.0.5",
                        prompt: prompt,
                        resolution: finalResolution,
                        type: "",
                        video_mode: 2,
                      },
                    ],
                  },
                  video_task_extra: metricsExtra,
                },
              },
            },
          ],
        }),
        http_common_info: {
          aid: Number(DEFAULT_ASSISTANT_ID),
        },
      },
    };
  }

  let aigc_data: any;

  if (isSeedanceModel) {
    // Seedance 请求通过浏览器代理发送（绕过 bdms 风控）
    logger.info("[Seedance] 通过浏览器代理发送生成请求...");
    const queryParams = new URLSearchParams({
      aid: String(DEFAULT_ASSISTANT_ID),
      device_platform: "web",
      region: "cn",
      da_version: draftVersion,
      web_component_open_flag: "1",
      web_version: "7.5.0",
      aigc_features: "app_lip_sync",
    });
    const generateUrl = `https://jimeng.jianying.com/mweb/v1/aigc_draft/generate?${queryParams.toString()}`;

    const browserResult = await browserService.fetch(
      refreshToken,
      generateUrl,
      {
        method: "POST",
        body: requestData.data,
      }
    );

    logger.info(`[Seedance] 浏览器代理响应状态: ${browserResult.status}`);
    logger.info(`[Seedance] 响应数据摘要: ${JSON.stringify(browserResult.data).substring(0, 300)}`);

    const responseData = browserResult.data;
    if (responseData.ret && responseData.ret !== "0") {
      throw new APIException(
        EX.API_REQUEST_FAILED,
        `[Seedance请求失败]: ${responseData.errmsg} (错误码: ${responseData.ret})`
      );
    }
    aigc_data = responseData.data?.aigc_data || responseData.aigc_data;
  } else {
    // 普通视频模型使用 axios 直接请求
    const result = await request(
      "post",
      "/mweb/v1/aigc_draft/generate",
      refreshToken,
      requestData
    );
    aigc_data = result.aigc_data;
  }

  const historyId = aigc_data.history_record_id;
  if (!historyId)
    throw new APIException(EX.API_IMAGE_GENERATION_FAILED, "记录ID不存在");

  // 轮询获取结果
  let status = 20,
    failCode,
    item_list = [];
  let retryCount = 0;
  const maxRetries = 60; // 20 mins

  await new Promise((resolve) => setTimeout(resolve, 5000));

  logger.info(`开始轮询视频生成结果，历史ID: ${historyId}`);

  while (status === 20 && retryCount < maxRetries) {
    try {
      const requestUrl = "/mweb/v1/get_history_by_ids";
      const requestData = { history_ids: [historyId] };

      let result;
      result = await request("post", requestUrl, refreshToken, {
        data: requestData,
      });

      const responseStr = JSON.stringify(result);
      // Quick extraction
      const videoUrlMatch = responseStr.match(
        /https:\/\/v[0-9]+-artist\.vlabvod\.com\/[^"\s]+/
      );
      if (videoUrlMatch && videoUrlMatch[0]) return videoUrlMatch[0];

      // Parse history
      let historyData;
      if (result.history_list?.length)
        historyData = result.history_list[0];

      if (!historyData) {
        retryCount++;
        await new Promise((r) =>
          setTimeout(r, Math.min(2000 * retryCount, 30000))
        );
        continue;
      }

      status = historyData.status;
      failCode = historyData.fail_code;
      item_list = historyData.item_list || [];

      // Extraction Check
      let tempVideoUrl =
        item_list?.[0]?.video?.transcoded_video?.origin?.video_url ||
        item_list?.[0]?.video?.play_url ||
        item_list?.[0]?.video?.download_url ||
        item_list?.[0]?.video?.url;

      if (tempVideoUrl) return tempVideoUrl; // Found it

      if (status === 30) {
        throw new APIException(
          EX.API_IMAGE_GENERATION_FAILED,
          `生成失败: ${failCode}`
        );
      }

      if (status === 20) {
        await new Promise((r) =>
          setTimeout(r, 2000 * Math.min(retryCount + 1, 5))
        );
      }
    } catch (e) {
      logger.error(`轮询出错: ${e.message}`);
      retryCount++;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // Timeout
  if (retryCount >= maxRetries) {
    throw new APIException(EX.API_IMAGE_GENERATION_FAILED, "视频生成超时");
  }

  // 尝试通过 get_local_item_list 获取高质量视频下载URL
  const itemId = item_list?.[0]?.item_id
    || item_list?.[0]?.id
    || item_list?.[0]?.local_item_id
    || item_list?.[0]?.common_attr?.id;

  if (itemId) {
    try {
      const hqVideoUrl = await fetchHighQualityVideoUrl(String(itemId), refreshToken);
      if (hqVideoUrl) {
        logger.info(`视频生成成功（高质量），URL: ${hqVideoUrl}`);
        return hqVideoUrl;
      }
    } catch (error) {
      logger.warn(`获取高质量视频URL失败，将使用预览URL: ${error.message}`);
    }
  }

  // 回退：提取预览视频URL
  let finalUrl =
    item_list?.[0]?.video?.transcoded_video?.origin?.video_url ||
    item_list?.[0]?.video?.play_url ||
    item_list?.[0]?.video?.download_url ||
    item_list?.[0]?.video?.url;

  if (!finalUrl) {
    throw new APIException(EX.API_IMAGE_GENERATION_FAILED, "未能获取视频URL");
  }

  return finalUrl;
}

/**
 * 带自动降级重试的视频生成
 * 如果积分不足，自动降低分辨率和时长重试
 */
export async function generateVideoWithRetry(
  _model: string,
  prompt: string,
  options: {
    ratio?: string;
    resolution?: string;
    duration?: number;
    filePaths?: string[];
  },
  refreshToken: string
): Promise<string> {
  // 特殊处理：Seedance 2.0 只支持 720p
  const isSeedanceModel = _model.includes("seedance");

  // 降级策略: 先降分辨率，再降时长
  const resolutionLevels = isSeedanceModel ? ["720p"] : ["1080p", "720p", "480p"];
  const durationLevels = isSeedanceModel ? [15, 10, 5, 4] : [10, 5];

  let currentResIndex = Math.max(
    0,
    resolutionLevels.indexOf(options.resolution || "720p")
  );
  let currentDurIndex = Math.max(
    0,
    durationLevels.indexOf(options.duration || (isSeedanceModel ? 10 : 10))
  );

  while (currentResIndex < resolutionLevels.length) {
    while (currentDurIndex < durationLevels.length) {
      try {
        const currentOptions = {
          ...options,
          resolution: resolutionLevels[currentResIndex],
          duration: durationLevels[currentDurIndex],
        };
        logger.info(
          `尝试生成视频，分辨率: ${currentOptions.resolution}，时长: ${currentOptions.duration}秒`
        );
        return await generateVideo(
          _model,
          prompt,
          currentOptions,
          refreshToken
        );
      } catch (error) {
        // 检查是否为积分不足错误
        const isInsufficientCredits =
          error.code === EX.API_IMAGE_GENERATION_INSUFFICIENT_POINTS[0] ||
          (error.message &&
            (error.message.includes("积分不足") ||
              error.message.includes("2039") ||
              error.message.includes("1006")));

        if (!isInsufficientCredits) {
          // 其他错误直接抛出
          throw error;
        }

        // 先尝试降低时长
        if (currentDurIndex < durationLevels.length - 1) {
          currentDurIndex++;
          logger.warn(
            `积分不足，自动降级到 ${durationLevels[currentDurIndex]}秒时长重试...`
          );
          continue;
        }

        // 时长已最低，尝试降低分辨率并重置时长（Seedance 2.0 跳过此步骤）
        if (currentResIndex < resolutionLevels.length - 1) {
          currentResIndex++;
          currentDurIndex = 0; // 重置时长尝试
          logger.warn(
            `积分不足，自动降级到 ${resolutionLevels[currentResIndex]} 分辨率重试...`
          );
          break; // 跳出内层循环，继续外层
        }

        // 已是最低配置仍然失败
        throw new APIException(
          EX.API_IMAGE_GENERATION_INSUFFICIENT_POINTS,
          "积分不足，已自动降至最低画质与时长仍然不足，请前往即梦官网 https://jimeng.jianying.com 充值积分"
        );
      }
    }
    // 重置时长索引用于下一轮分辨率尝试
    currentDurIndex = 0;
  }

  throw new APIException(EX.API_VIDEO_GENERATION_FAILED, "视频生成失败");
}
