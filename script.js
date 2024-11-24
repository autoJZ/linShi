const puppeteer = require("puppeteer");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const {
  operateNode,
  swipe,
  getText,
  getAllFiles,
  uploadFilesByXPath,
  getChildPath,
  uploadFilesBySelector,
  buildXPathForText,
  splitString,
  checkExpiration,
  Page_status_window,
} = require("./methods");
const { privateEncrypt } = require("crypto");
const WebSocket = require('ws');
const presetTime = new Date("2024-09-01T12:00:00");
(async () => {
  const puppeteerConf = {
    headless: false,
    executablePath: "./chrome-win/chrome.exe",
  };

  const browsers = [];
  const nums = 5;

  // 创建多个浏览器实例
  for (let i = 0; i < nums; i++) {
    const browser = await puppeteer.launch(puppeteerConf);
    browsers.push(browser);
  }

  const ws = new WebSocket('ws://localhost:8080');

  ws.on('message', async (buffer) => {
    const { url, duration } = JSON.parse(buffer.toString());
    console.log('接收到的 URL:', url);
    
    // 在每个浏览器中打开新页面并跳转
    for (let i = 0; i < browsers.length; i++) {
      const page = await browsers[i].newPage();
      await page.goto(url);
      
      // 定期滑动鼠标
      const interval = setInterval(async () => {
        const { width, height } = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
        }));
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        await page.mouse.move(x, y);
      }, 5000); // 每5秒滑动一次

      // 等待指定持续时间后关闭页面并清除滑动
      setTimeout(async () => {
        clearInterval(interval);
        await page.close();
      }, duration);
    }
  });

  ws.on('message', (message) => {
    if (message.toString() === 'stop') {
      // 停止滑动鼠标
      clearInterval(interval);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket 错误:', error);
  });

  ws.on('close', async () => {
    await Promise.all(browsers.map(browser => browser.close()));
  });
})();
