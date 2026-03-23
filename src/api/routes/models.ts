import _ from 'lodash';

export default {

    prefix: '/v1',

    get: {
        '/models': async () => {
            return {
                "data": [
                    // 图片模型
                    {
                        "id": "jimeng-5.0",
                        "object": "model",
                        "owned_by": "jimeng-image",
                        "description": "即梦AI图片生成模型 5.0 版本（最新）"
                    },
                    {
                        "id": "jimeng-4.6",
                        "object": "model",
                        "owned_by": "jimeng-image",
                        "description": "即梦AI图片生成模型 4.6 版本"
                    },
                    {
                        "id": "jimeng-4.5",
                        "object": "model",
                        "owned_by": "jimeng-image",
                        "description": "即梦AI图片生成模型 4.5 版本"
                    },
                    {
                        "id": "jimeng-4.1",
                        "object": "model",
                        "owned_by": "jimeng-image",
                        "description": "即梦AI图片生成模型 4.1 版本"
                    },
                    {
                        "id": "jimeng-4.0",
                        "object": "model",
                        "owned_by": "jimeng-image",
                        "description": "即梦AI图片生成模型 4.0 版本"
                    },
                    {
                        "id": "jimeng-3.1",
                        "object": "model",
                        "owned_by": "jimeng-image",
                        "description": "即梦AI图片生成模型 3.1 版本"
                    },
                    {
                        "id": "jimeng-3.0",
                        "object": "model",
                        "owned_by": "jimeng-image",
                        "description": "即梦AI图片生成模型 3.0 版本"
                    },
                    {
                        "id": "jimeng-2.1",
                        "object": "model",
                        "owned_by": "jimeng-image",
                        "description": "即梦AI图片生成模型 2.1 版本"
                    },
                    {
                        "id": "jimeng-2.0-pro",
                        "object": "model",
                        "owned_by": "jimeng-image",
                        "description": "即梦AI图片生成模型 2.0 专业版"
                    },
                    {
                        "id": "jimeng-2.0",
                        "object": "model",
                        "owned_by": "jimeng-image",
                        "description": "即梦AI图片生成模型 2.0 版本"
                    },
                    {
                        "id": "jimeng-1.4",
                        "object": "model",
                        "owned_by": "jimeng-image",
                        "description": "即梦AI图片生成模型 1.4 版本"
                    },
                    {
                        "id": "jimeng-xl-pro",
                        "object": "model",
                        "owned_by": "jimeng-image",
                        "description": "即梦AI图片生成模型 XL 专业版"
                    },
                    // 视频模型
                    {
                        "id": "jimeng-video-3.5-pro",
                        "object": "model",
                        "owned_by": "jimeng-video",
                        "description": "即梦AI视频生成模型 3.5 专业版"
                    },
                    {
                        "id": "jimeng-video-3.0",
                        "object": "model",
                        "owned_by": "jimeng-video",
                        "description": "即梦AI视频生成模型 3.0 版本"
                    },
                    {
                        "id": "jimeng-video-3.0-pro",
                        "object": "model",
                        "owned_by": "jimeng-video",
                        "description": "即梦AI视频生成模型 3.0 专业版"
                    },
                    {
                        "id": "jimeng-video-3.0-fast",
                        "object": "model",
                        "owned_by": "jimeng-video",
                        "description": "即梦AI视频生成模型 3.0 快速版"
                    },
                    {
                        "id": "jimeng-video-2.0",
                        "object": "model",
                        "owned_by": "jimeng-video",
                        "description": "即梦AI视频生成模型 2.0 (轻量版)"
                    },
                    {
                        "id": "jimeng-video-2.0-pro",
                        "object": "model",
                        "owned_by": "jimeng-video",
                        "description": "即梦AI视频生成模型 2.0 专业版"
                    },
                    {
                        "id": "seedance-2.0",
                        "object": "model",
                        "owned_by": "jimeng-video",
                        "description": "Seedance 2.0 专业版"
                    },
                    {
                        "id": "seedance-2.0-fast",
                        "object": "model",
                        "owned_by": "jimeng-video",
                        "description": "Seedance 2.0 快速版"
                    }
                ]
            };
        }

    }
}