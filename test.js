const puppeteer = require("puppeteer");
// const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const WebSocket = require("ws");
const { exec } = require("child_process");
const fs = require("fs").promises;
// puppeteer.use(StealthPlugin());
const userDataDir = "./user_data"; // 会话数据目录
const browserCount = 5; // 打开的浏览器数量
const browsers = []; // 用于存储打开的浏览器实例
const mouseMoveTimers = new Map(); // 用于存储每个浏览器的鼠标移动定时器
const moment = require("moment");
const { copyFileSync } = require("fs");
const path = require("path");

// 连接到 WebSocket 服务器
const ws = new WebSocket("ws://8.155.2.21:3000");
// const ws = new WebSocket("ws://127.0.0.1:3000");
ws.on("open", async () => {
  console.log("WebSocket 客户端已连接");
  try {
    const uniqueDeviceId = await getUniqueDeviceId(); // 获取唯一设备标识
    ws.send(
      JSON.stringify({ type: "accountInfo", deviceName: uniqueDeviceId })
    ); // 发送唯一设备标识
    console.log("发送唯一设备标识:", uniqueDeviceId);
  } catch (error) {
    console.error("获取唯一设备标识时出错:", error.message);
  }
});

ws.on("message", async (event) => {
  let messageData = Buffer.isBuffer(event) ? event.toString("utf-8") : event;

  try {
    const message = JSON.parse(messageData);

    // 检查消息内容是否包含有效的 taskParams
    if (message.data && message.data.taskParams) {
      await navigateToUrl(message.data.taskParams);
    } else if (message.type === "ping") {
      // 处理 ping 消息
      ws.send(JSON.stringify({ type: "pong" })); // 返回 pong
    } else {
      console.warn("接收到的消息没有包含有效的 taskParams");
    }
  } catch (error) {
    console.error("JSON 解析失败:", error);
  }
});
async function clearCache(userDataDir) {
  const cachePath = path.join(userDataDir, "Default", "Cache"); // 缓存目录
  const cookiesPath = path.join(userDataDir, "Default", "Cookies"); // Cookies 目录

  try {
    // 删除缓存目录
    await fs.access(cachePath); // 检查缓存目录是否存在
    await fs.rm(cachePath, { recursive: true, force: true }); // 异步删除缓存目录
    console.log(`缓存已清理: ${cachePath}`);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`缓存目录不存在: ${cachePath}`);
    } else {
      console.error(`清理缓存时发生错误: ${error.message}`);
    }
  }
}
// 主函数：启动浏览器并设置初始页面
(async () => {
  const expirationDate = moment('2024-11-20');
  const currentDate = moment();
  if (currentDate.isAfter(expirationDate)) {
    console.log("使用期限已过，程序将退出。");
    process.exit(); // 退出程序
  }

  const browserPromises = []; // 用于存储所有启动浏览器的 Promise

  // 使用 Promise.all 并行启动浏览器
  for (let i = 0; i < browserCount; i++) {
    const currentUserDataDir = `${userDataDir}_${i}`;

    // 清理缓存
    console.log("清理缓存");
    await clearCache(currentUserDataDir);

    // 启动浏览器并添加到 Promise 列表中
    const browserPromise = puppeteer.launch({
      headless: false,
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      userDataDir: currentUserDataDir, // 使用会话数据存储路径
      defaultViewport: null, // 使用默认视口
      args: ["--window-size=1280,800"], // 设置窗口大小
    }).then(async (browser) => {
      browsers.push(browser);
      const page = await browser.newPage();

      // 设置随机请求头
      // await setRandomHeaders(page);

      // 打开指定页面
      await page.goto("https://live.douyin.com/", {
        waitUntil: "networkidle2",
        timeout: 60000,
      });
      const page_now = page;

      // 关闭旧页面
      const pages = await browser.pages();
      for (const page of pages) {
        if (page !== page_now) {
          await page.close();
        }
      }

      return browser;
    });

    browserPromises.push(browserPromise); // 将 Promise 加入到列表中
  }

  // 等待所有浏览器都启动完成
  await Promise.all(browserPromises);

  // 启动鼠标移动定时器
  startMouseMovementTimer(); // 启动统一的鼠标移动定时器

  console.log("所有浏览器已打开");
  ws.send(JSON.stringify({ type: "initInfo", state: "所有浏览器已打开" }));
})();

// 导航到新 URL 的函数
async function navigateToUrl(newUrl) {
  console.log("访问连接:", newUrl);

  // 使用 for...of 循环按顺序遍历每个浏览器
  for (const [index, browser] of browsers.entries()) {
    try {
      const pages = await browser.pages(); // 获取当前浏览器的所有页面

      // 确保有页面可用
      if (pages.length === 0) {
        console.error(`浏览器 ${index} 没有可用页面.`);
        continue; // 跳过当前浏览器，进入下一个
      }

      const currentPage = pages[0]; // 假设我们只使用第一个页面

      // 设置随机请求头和 User-Agent
      await setRandomHeaders(currentPage);

      // 随机延时
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await delay(Math.floor(Math.random() * 3000) + 2000); // 随机延时 2 到 5 秒

      // 使用 page.goto 方法直接导航到新 URL
      await currentPage.goto(newUrl, {
        waitUntil: "networkidle2",
        timeout: 60000, // 设置超时时间为60秒
      });

      console.log(`浏览器 ${index} 成功访问 ${newUrl}`);

      // 关闭所有页面，保留 currentPage
      for (const page of pages) {
        if (page !== currentPage) {
          await page.close();
        }
      }
    } catch (error) {
      console.error(`浏览器 ${index} 页面导航失败:`, error);
    }
  }
}

function startMouseMovementTimer() {
  const timer = setInterval(async () => {
    // 对所有打开的浏览器执行鼠标移动
    for (const browser of browsers) {
      const pages = await browser.pages(); // 获取当前浏览器的所有页面
      const viewportPromises = pages.map((page) => page.viewport()); // 获取所有页面的视口大小
      const viewports = await Promise.all(viewportPromises); // 并行获取视口大小

      const movePromises = pages.map(async (page, index) => {
        if (page.url() !== "about:blank") {
          // 确保不是空白页
          const isLivePage = await checkIfLivePage(page); // 你需要定义这个函数

          if (isLivePage) {
            // 使用 Puppeteer API 检查视频元素是否存在
            const videoHandle = await page.$("video");
            if (videoHandle) {
              // 获取视频的播放状态，避免使用 page.evaluate
              const isPaused = await videoHandle.getProperty("paused");
              const pausedValue = await isPaused.jsonValue();
              // 如果视频暂停，播放视频
              if (pausedValue) {
                // await videoHandle.evaluate(video => video.play());
                await page.reload();
              }
            }
          }

          return moveMouseRandomly(page, viewports[index]); // 传递对应页面的视口大小
        }
      });

      // 等待所有鼠标移动操作完成
      await Promise.all(movePromises);
    }
  }, getRandomInterval(30 * 1000, 90 * 1000)); // 每隔 30 到 90 秒移动鼠标

  // 将定时器存储到 Map 中
  mouseMoveTimers.set("all", timer); // 将定时器存储为一个统一的标识
}

// 检查页面是否为直播页面的示例函数
async function checkIfLivePage(page) {
  const url = page.url();
  // 这里可以根据页面 URL 或其他特征判断是否为直播页面
  return url.includes("live") || url.includes("douyin"); // 根据你的直播平台调整
}

// 随机移动鼠标
async function moveMouseRandomly(page, viewport) {
  try {
    const width = 1920; // 例如：1920px
    const height = 1080; // 例如：1080px

    // 生成随机坐标
    const targetX = Math.floor(Math.random() * width);
    const targetY = Math.floor(Math.random() * height);

    if (page.isClosed()) {
      console.warn("页面已关闭，无法移动鼠标。");
      return; // 不再清除定时器
    }

    // 设置缓动步数和延迟
    const steps = 15; // 设定步数
    const delay = Math.floor(Math.random() * 100) + 50; // 随机延迟50-150毫秒

    // 从当前位置开始移动
    for (let i = 0; i <= steps; i++) {
      const newX = (targetX * i) / steps; // 线性插值
      const newY = (targetY * i) / steps; // 线性插值

      await page.mouse.move(newX, newY);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    console.log("鼠标成功");
  } catch (error) {
    console.error("鼠标移动失败:", error);
  }
}

// 获取随机时间间隔的函数
function getRandomInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 设置随机 User-Agent 和 HTTP 头
async function setRandomHeaders(page) {
  const userAgents = [
    // Chrome
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    // 额外的 Chrome User Agents
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.71 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.54 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.99 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.5005.63 Safari/537.36",
  ];

  // 随机选择一个 User-Agent
  const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

  // 设置 User-Agent
  await page.setUserAgent(userAgent);
}

// 获取唯一设备标识的函数
async function getUniqueDeviceId() {
  try {
    const data = await fs.readFile("bianhao.txt", "utf-8");
    console.log(data);
    return data.trim() || "文件为空";
  } catch (error) {
    throw new Error("读取文件失败: " + error.message);
  }
}

process.on("uncaughtException", (error) => {
  console.error("未捕获的异常:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("未处理的拒绝:", promise, "原因:", reason);
});
