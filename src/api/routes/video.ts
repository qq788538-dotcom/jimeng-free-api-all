import videos from './videos.ts';

// /v1/video 别名路由（兼容不同客户端）
export default {
    prefix: '/v1/video',
    post: videos.post
};
