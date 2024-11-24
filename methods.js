module.exports = {
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
    Page_status_window
}

const XLsx = require('xlsx');
const ExcelJs = require('exceljs');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// const {
//     operateNode,
//     swipe,
//     getText,
//     getAllFiles,
//     uploadFilesByXPath,
//     getChildPath,
//     uploadFilesBySelector,
//     buildXPathForText,
//     splitString,
//     checkExpiration
//   } = require("./methods");



/**
 * 异步操作页面上的节点，支持单个或多个XPath路径或CSS选择器。
 * 如果一个路径或选择器操作失败，则尝试下一个，直至成功或所有尝试完毕。
 * 添加了等待节点时的超时功能，并捕获超时错误。
 *
 * @param {Page} page - Puppeteer的Page对象，用于与浏览器交互。
 * @param {string|string[]} paths - XPath路径或CSS选择器，可以是单个字符串或路径/选择器数组。
 * @param {string} [category="点击"] - 节点操作类别，支持"点击"或"输入"。
 * @param {string} [content=""] - 输入操作时所需的内容。
 * @returns {Promise<boolean>} - 返回一个Promise，解析为true表示操作成功，false表示失败。
 */
async function operateNode(page, paths, category = "点击", content = "") {
    let success = false;
    let pathsArray = [];

    // 检查传入的paths是否为单个字符串或数组
    if (typeof paths === 'string') {
        pathsArray = [paths]; // 单个路径转为数组
    } else if (Array.isArray(paths)) {
        pathsArray = paths; // 直接使用传入的路径数组
    } else {
        console.error('传入的路径参数类型不正确');
        return false; // 明确返回失败
    }

    const timeout = 5000; // 设置超时时间为5秒

    for (const path of pathsArray) {
        try {
            // 确定路径类型并执行相应的操作
            let nodeHandles;
            if (path.startsWith('/')) {
                // XPath路径
                nodeHandles = await page.waitForXPath(path, { timeout });
            } else {
                // CSS选择器
                nodeHandles = await page.waitForSelector(path, { timeout });
            }

            if (category === '点击') {
                await nodeHandles.click();
            } else if (category === '输入') {
                if (!content) {
                    console.error('当操作类型为"输入"时，必须提供输入的内容');
                    return false; // 明确返回失败
                }

                await nodeHandles.type(content);
            } else {
                console.log('未识别的节点操作');
                return false; // 明确返回失败
            }

            success = true;
            break; // 成功后跳出循环
        } catch (error) {
            // 检查是否为超时错误
            if (error.name === 'TimeoutError') {
                console.error(`操作"${path}"时发生超时错误:`, error);
            } else {
                console.error(`操作"${path}"时发生其他错误:`, error);
            }
        }
    }

    if (!success) {
        console.error('所有提供的路径均未能成功操作节点');
        return false; // 明确返回失败
    }

    // 等待操作后的页面更新
    await page.waitForTimeout(3000);

    return true; // 成功操作后返回true
}






/**
 * 执行滑动操作。该函数适用于具有非可见（non-visible） overflow 属性的元素。
 * 
 * @param {Page} page - Puppeteer 的 Page 对象，用于与浏览器页面交互。
 * @param {string} path - XPath 表达式，用于定位页面上的元素。
 * @param {number} [length=0] - 可选参数，指定滚动的距离（像素）。如果为 0，则滚动到底部。
 */
async function swipe(page, path, length = 0) {
    try {
        // 使用 page.$x 执行 XPath 查询以获取元素
        const elements = await page.$x(path);

        // 检查是否找到了匹配的元素
        if (elements.length === 0) {
            console.error('没有找到匹配的元素');
            return;
        }

        // 获取第一个匹配的元素句柄
        const elementHandle = elements[0];

        // 检查元素的 overflow 属性
        const overflowStyle = await page.evaluate((el) => window.getComputedStyle(el).overflow, elementHandle);
        if (overflowStyle === 'visible') {
            console.error('元素的 overflow 属性为 visible，无法进行滚动操作');
            return;
        }

        // 执行滚动操作
        if (length > 0) {
            // 如果指定了滚动距离，则滚动到指定位置
            await page.evaluate((el, offset) => {
                el.scrollTop = offset;
            }, elementHandle, length);
        } else {
            // 如果没有指定长度，滚动到底部
            await page.evaluate((el) => {
                const maxScrollTop = el.scrollHeight - el.clientHeight;
                el.scrollTop = maxScrollTop;
            }, elementHandle);
        }
    } catch (error) {
        // 如果发生错误，输出错误信息
        console.error('滑动操作时发生错误:', error);
    }
}
/**
 * 从 Puppeteer 页面中获取特定节点对应的文字内容。
 * 
 * @param {Page} page - Puppeteer 的 Page 对象，用于与浏览器页面交互。
 * @param {string} path - XPath 表达式，用于定位页面上的元素。
 * @param {number} [retryCount=3] - 可选参数，指定重试次数，默认为 3 次。
 * @param {number} [timeout=5000] - 可选参数，指定等待元素出现的超时时间（毫秒），默认为 5000 毫秒。
 * @returns {Promise<string | null>} - 返回获取到的文字内容，如果未找到元素或发生错误，则返回 null。
 */
async function getText(page, path, retryCount = 3, timeout = 5000) {
    try {
        for (let i = 0; i < retryCount; i++) {
            try {
                // 等待元素出现
                await page.waitForXPath(path, { timeout });
                const elements = await page.$x(path);
                if (elements.length > 0) {
                    const elementHandle = elements[0];
                    // 获取元素的文字内容并去除前后空白
                    const text = await page.evaluate(element => element.textContent.trim(), elementHandle);
                    return text;
                } else {
                    console.log('没有找到匹配的元素');
                    return null;
                }
            } catch (error) {
                if (i < retryCount - 1) {
                    console.warn(`尝试获取文本失败，剩余重试次数: ${retryCount - i - 1}`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待一秒后重试
                } else {
                    console.error('获取文本时发生错误:', error);
                    return null;
                }
            }
        }
    } catch (error) {
        console.error('重试获取文本时发生全局错误:', error);
        return null;
    }
}

/**
 * 通过提供的文本内容查找特定子节点的 XPath。
 * 
 * @param {Page} page - Puppeteer 的 Page 对象，用于与浏览器页面交互。
 * @param {string} root_path - XPath 表达式，用于定位页面上的根节点。
 * @param {string} text - 需要在子节点中查找的文本内容。
 * @returns {Promise<string | undefined>} - 返回找到的子节点的 XPath，如果没有找到匹配的子节点，则返回 undefined。
 */
async function getChildPath(page, root_path, text) {
    try {
        // 使用 page.$x 执行 XPath 查询以获取根节点
        const elementHandles = await page.$x(root_path);

        // 检查是否找到了匹配的元素
        if (elementHandles.length === 0) {
            console.log('No matching element found.');
            return;
        }

        // 获取第一个匹配的元素句柄
        const elementHandle = elementHandles[0];

        // 获取根节点的子节点数量
        const childNodeCount = await page.evaluate(el => el.childElementCount, elementHandle);

        // 检查是否有子节点
        if (childNodeCount === 0) {
            console.log('No child nodes found.');
            return;
        }

        // 遍历子节点
        for (let i = 1; i <= childNodeCount; i++) {
            // 构建子节点的 XPath
            const child_path = `${root_path}/div[${i}]`;

            // 使用 page.evaluate 在页面上下文中执行 XPath 查询并比较文本
            const current_text = await page.evaluate((path, text) => {
                const node = document.evaluate(
                    path,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                ).singleNodeValue;

                // 检查节点是否存在以及其文本内容是否与提供的文本相匹配
                return node && node.textContent.trim() === text;
            }, child_path, text);

            // 如果找到了匹配的文本
            if (current_text) {
                console.log('找到');
                return child_path;
            }
        }

        // 如果遍历完所有子节点都没有找到匹配的文本
        console.log('未找到');
    } catch (error) {
        // 如果发生错误，输出错误信息
        console.error('An error occurred:', error);
    }
}

/**
 * 通过选择器上传文件。
 * 
 * @param {Page} page - Puppeteer 的 Page 对象，用于与浏览器页面交互。
 * @param {string} selector - CSS 选择器，用于定位页面上的元素。
 * @param {string|string[]} filePaths - 文件路径或文件路径数组，用于上传文件。
 */
async function uploadFilesBySelector(page, selector, filePaths) {
    // 等待指定的选择器出现
    let element = await page.waitForSelector(selector, { timeout: 100000 });

    // 如果 filePaths 是数组，则遍历并上传每个文件
    if (Array.isArray(filePaths)) {
        for (const filePath of filePaths) {
            await element.uploadFile(filePath);
        }
    } else {
        // 如果 filePaths 是字符串，则直接上传
        await element.uploadFile(filePaths);
    }
}

/**
 * 通过 XPath 表达式上传文件。
 * 
 * @param {Page} page - Puppeteer 的 Page 对象，用于与浏览器页面交互。
 * @param {string} xpathExpression - XPath 表达式，用于定位页面上的元素。
 * @param {string|string[]} filePaths - 文件路径或文件路径数组，用于上传文件。
 */
async function uploadFilesByXPath(page, xpathExpression, filePaths) {
    // 使用 XPath 表达式获取元素
    let elements = await page.$x(xpathExpression);

    // 检查是否找到了匹配的元素
    if (elements.length === 0) {
        throw new Error('XPath expression did not match any elements.');
    }

    // 如果 filePaths 是数组，则遍历并上传每个文件
    if (Array.isArray(filePaths)) {
        for (const filePath of filePaths) {
            await elements[0].uploadFile(filePath);
        }
    } else {
        // 如果 filePaths 是字符串，则直接上传
        await elements[0].uploadFile(filePaths);
    }
}

/**
 * 根据提供的文本内容在网页上查找对应的 XPath。
 * 
 * @param {Page} page - Puppeteer 的 Page 对象，用于与浏览器页面交互。
 * @param {string} text - 需要在页面中查找的文本内容。
 * @returns {Promise<string>} - 返回找到的 XPath 或者提示文本不存在的信息。
 */
async function buildXPathForText(page, text) {
    // 定义可能包含文本的 HTML 元素列表
    const elements = [
        'p', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'a', 'strong', 'em', 'i', 'b', 'u', 's', 'mark', 'code',
        'q', 'blockquote', 'abbr', 'address', 'cite', 'dfn',
        'kbd', 'samp', 'var', 'pre'
    ];

    // 设置重试次数
    let retries = 3;

    // 循环尝试直到找到 XPath 或者重试次数用尽
    while (retries > 0) {
        retries--;

        try {
            // 遍历所有可能包含文本的元素
            for (let element of elements) {
                // 构建 XPath 查询语句
                const xpath = `//${element}[normalize-space(text()) = "${text}"]`;

                // 使用 page.evaluate 在页面上下文中执行 XPath 查询
                const result = await page.evaluate((xpath) => {
                    // 使用 document.evaluate 执行 XPath 查询
                    const target = document.evaluate(
                        xpath,
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null
                    ).singleNodeValue;

                    // 如果找到匹配的元素则返回 true
                    if (target) {
                        return true;
                    }
                    // 没有找到匹配的元素返回 false
                    return false;
                }, xpath);

                // 如果找到了匹配的元素，返回 XPath
                if (result) {
                    return xpath;
                }
            }

            // 如果一轮循环结束仍未找到，且还有重试机会，则输出提示信息并等待后重试
            if (retries > 0) {
                console.log(`未找到元素，剩余重试次数：${retries}`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒再重试
            }
        } catch (error) {
            // 如果发生错误，输出错误信息
            console.error('XPath 查询时发生错误', error);

            // 如果还有重试机会，则输出提示信息并等待后重试
            if (retries > 0) {
                console.log(`发生错误，剩余重试次数：${retries}`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒再重试
            } else {
                // 如果没有重试机会了，则抛出错误
                throw error;
            }
        }
    }

    // 如果所有尝试都失败了，则返回提示信息
    return "该文本不存在";
}


//一些excel函数


/**
 * 添加数据验证到指定的工作表单元格范围内。
 *
 * @param {Object} worksheet - 工作表对象，需要具备 dataValidations 属性。
 * @param {string} range - 单元格范围，例如 "A1:A9999"。
 * @param {Array<string>} categories - 类别列表，用于创建下拉列表。
 */
async function addDataValidation(worksheet, range, categories) {
    // 将类别列表转换为逗号分隔的字符串，并用双引号括起来
    // 例如：'"1", "2", "3", "4"'
    const categoryString = '"' + categories.join('","') + '"';

    // 创建数据验证规则
    const rule = {
        type: 'list', // 设置验证类型为列表
        formulae: [categoryString], // 设置列表内容
        allowBlank: true, // 允许空白值
    };

    // 应用数据验证规则到指定的工作表单元格范围内
    worksheet.dataValidations.add(range, rule);
}



// 一些其他函数

/**
 * 检测是否已过期，并在过期时弹出提示
 * @param {string} endTime - 结束时间字符串，格式为 "YYYY-MM-DD HH:mm:ss"
 * @returns {boolean} - 如果已过期则返回 true，否则返回 false
 */
async function checkExpiration(endTime) {
    const now = new Date();
    const end = new Date(endTime);
    if (now > end) {
        console.log("已过期");
        return true;
    }
    return false;
}

async function Page_status_window(page, currentProgress, totalProgress) {
    console.log("准备创建状态窗口");
    await page.evaluate(async (currentProgress, totalProgress) => {
      const style = document.createElement('style');
      style.innerHTML = `
        #custom-window {
          position: fixed;
          top: 20px;
          left: 10px;
          width: 120px;
          height: 50px;
          background-color: #0291ad;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          font-size: 16px;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
      `;
      document.head.appendChild(style);

      const customWindow = document.createElement('div');
      customWindow.id = 'custom-window';
      if (currentProgress > totalProgress) {
        customWindow.innerText = '上货完成';
      } else {
        customWindow.innerText = `正在上货：${currentProgress}/${totalProgress}`;
      }
      document.body.appendChild(customWindow);

      // 假设具体的函数逻辑如下:
      if (currentProgress < totalProgress) {
        // 示例: 执行一些特定操作
        console.log(`当前进度: ${currentProgress}, 总进度: ${totalProgress}`);
      }

    }, currentProgress, totalProgress);

    console.log("创建状态窗口成功");
}




/**
 * 将给定的字符串按照指定的分隔符进行分割，并返回一个包含分割后子字符串的数组。
 * 
 * @param {string} str - 需要被分割的原始字符串。
 * @param {string} delimiter - 用于分割字符串的符号。
 * @returns {Array<string>} 分割后的子字符串数组。
 */
async function splitString(str, delimiter) {
    // 使用字符串的 split 方法来分割字符串
    // 参数1: delimiter - 作为分隔符的字符串
    // 返回值: 一个包含分割后的子字符串的数组
    return str.split(delimiter);
}


/**
 * 获取指定文件夹中所有文件的绝对路径数组。
 * 
 * @param {string} dirPath - 文件夹路径。
 * @returns {Promise<string[]>} - 包含文件绝对路径的数组的 Promise。
 */
async function getAllFiles(dirPath) {
    // 检查路径是否有效
    if (!dirPath || typeof dirPath !== 'string') {
        throw new Error('Invalid directory path provided.');
    }

    // 创建一个空数组来存储文件路径
    const allFilePaths = [];

    // 读取文件夹中的所有文件和子文件夹
    return new Promise((resolve, reject) => {
        fs.readdir(dirPath, (err, files) => {
            if (err) {
                reject(err);
                return;
            }

            // 构建文件的完整路径
            const filePaths = files.map(file => path.join(dirPath, file));

            // 在读取文件夹之后输出文件列表
            console.log('Files found:', files);

            // 创建一个 Promise 数组来保存所有的 fs.stat 操作
            const statPromises = filePaths.map(filePath => {
                return new Promise((resolve, reject) => {
                    fs.stat(filePath, (err, stats) => {
                        if (err) {
                            reject(err);
                        } else {
                            // 如果是文件夹，则递归调用 getAllFiles 函数
                            if (stats.isDirectory()) {
                                getAllFiles(filePath)
                                    .then(subFiles => {
                                        allFilePaths.push(...subFiles); // 将子文件夹中的文件路径添加到数组中
                                        console.log('Sub-files added:', subFiles); // 输出添加的子文件路径
                                    })
                                    .catch(reject); // 处理递归过程中的错误
                            } else {
                                allFilePaths.push(filePath); // 如果是文件，则直接添加到数组中
                                console.log('File added:', filePath); // 输出添加的文件路径
                            }
                            resolve();
                        }
                    });
                });
            });

            // 使用 Promise.all 等待所有 fs.stat 操作完成
            Promise.all(statPromises)
                .then(() => {
                    // 当所有文件和文件夹都被处理后，解析 Promise
                    resolve(allFilePaths);
                })
                .catch(reject);
        });
    });
}
