import { chromium, Browser, BrowserContext, Page } from "playwright-core";
import logger from "@/lib/logger.ts";
import { generateCookie } from "@/api/controllers/core.ts";

// 允许加载的脚本域名白名单（bdms SDK 相关）
const SCRIPT_WHITELIST = [
  "vlabstatic.com",
  "bytescm.com",
  "jianying.com",
  "byteimg.com",
];

// 阻止加载的资源类型
const BLOCKED_RESOURCE_TYPES = ["image", "font", "stylesheet", "media"];

// 会话空闲超时时间（10分钟）
const SESSION_IDLE_TIMEOUT = 10 * 60 * 1000;

// bdms SDK 准备超时时间
const BDMS_READY_TIMEOUT = 30000;

interface BrowserSession {
  context: BrowserContext;
  page: Page;
  idleTimer: NodeJS.Timeout | null;
}

class BrowserService {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private sessions: Map<string, BrowserSession> = new Map();

  /**
   * 确保浏览器实例已启动
   */
  async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    // 防止并发启动
    if (this.launching) {
      return this.launching;
    }

    this.launching = (async () => {
      logger.info("[BrowserService] 正在启动 Chromium...");
      try {
        this.browser = await chromium.launch({
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-first-run",
            "--no-zygote",
            "--single-process",
          ],
        });
        logger.info("[BrowserService] Chromium 启动成功");
        return this.browser;
      } finally {
        this.launching = null;
      }
    })();

    return this.launching;
  }

  /**
   * 获取或创建会话
   */
  async getSession(token: string): Promise<BrowserSession> {
    let session = this.sessions.get(token);
    if (session) {
      // 重置空闲计时器
      if (session.idleTimer) {
        clearTimeout(session.idleTimer);
      }
      session.idleTimer = setTimeout(() => {
        this.closeSession(token);
      }, SESSION_IDLE_TIMEOUT);
      return session;
    }

    return this.createSession(token);
  }

  /**
   * 创建新会话
   */
  private async createSession(token: string): Promise<BrowserSession> {
    const browser = await this.ensureBrowser();

    logger.info("[BrowserService] 创建新会话...");
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
    });

    // 注入 cookies
    const cookieStr = generateCookie(token);
    const cookies = cookieStr.split("; ").map((c) => {
      const [name, ...valueParts] = c.split("=");
      return {
        name: name.trim(),
        value: valueParts.join("="),
        domain: ".jianying.com",
        path: "/",
      };
    });
    await context.addCookies(cookies);

    // 拦截资源，减少加载量
    await context.route("**/*", (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();

      // 阻止不需要的资源
      if (BLOCKED_RESOURCE_TYPES.includes(resourceType)) {
        return route.abort();
      }

      // 只允许白名单中的脚本
      if (resourceType === "script") {
        const isWhitelisted = SCRIPT_WHITELIST.some((domain) =>
          url.includes(domain)
        );
        if (!isWhitelisted) {
          return route.abort();
        }
      }

      return route.continue();
    });

    const page = await context.newPage();

    // 导航到即梦网站以加载 bdms SDK
    logger.info("[BrowserService] 导航到即梦网站加载 bdms SDK...");
    await page.goto("https://jimeng.jianying.com/ai-tool/video/generate", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // 等待 bdms SDK 就绪
    const sdkReady = await this.waitForBdmsSDK(page);
    if (sdkReady) {
      logger.info("[BrowserService] bdms SDK 已就绪");
    } else {
      logger.warn("[BrowserService] bdms SDK 超时未就绪，继续尝试请求");
    }

    const session: BrowserSession = {
      context,
      page,
      idleTimer: setTimeout(() => {
        this.closeSession(token);
      }, SESSION_IDLE_TIMEOUT),
    };

    this.sessions.set(token, session);
    return session;
  }

  /**
   * 等待 bdms SDK 就绪
   */
  private async waitForBdmsSDK(page: Page): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < BDMS_READY_TIMEOUT) {
      try {
        const ready = await page.evaluate(() => {
          return !!(
            (window as any).bdms?.init ||
            (window as any).byted_acrawler ||
            // 检查 fetch 是否被 SDK 劫持
            !String(window.fetch).includes("native code")
          );
        });
        if (ready) return true;
      } catch {
        // 页面可能还在加载
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    return false;
  }

  /**
   * 通过浏览器代理发送请求
   */
  async fetch(
    token: string,
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: any;
    } = {}
  ): Promise<any> {
    const session = await this.getSession(token);

    try {
      const result = await session.page.evaluate(
        async ({ url, options }) => {
          const res = await fetch(url, {
            method: options.method || "POST",
            headers: {
              "Content-Type": "application/json",
              ...options.headers,
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
            credentials: "include",
          });

          const text = await res.text();
          try {
            return { ok: res.ok, status: res.status, data: JSON.parse(text) };
          } catch {
            return { ok: res.ok, status: res.status, data: text };
          }
        },
        { url, options }
      );

      return result;
    } catch (error: any) {
      logger.error(`[BrowserService] 请求失败: ${error.message}`);
      // 清理失败的会话
      await this.closeSession(token);
      throw error;
    }
  }

  /**
   * 关闭会话
   */
  async closeSession(token: string): Promise<void> {
    const session = this.sessions.get(token);
    if (!session) return;

    logger.info("[BrowserService] 关闭会话...");
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
    }

    try {
      await session.context.close();
    } catch {
      // 忽略关闭错误
    }

    this.sessions.delete(token);
  }

  /**
   * 关闭所有会话和浏览器
   */
  async close(): Promise<void> {
    for (const [token] of this.sessions) {
      await this.closeSession(token);
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // 忽略
      }
      this.browser = null;
    }
    logger.info("[BrowserService] 浏览器已关闭");
  }
}

// 单例导出
const browserService = new BrowserService();
export default browserService;
