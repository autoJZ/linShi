const WebSocket = require('ws'); // 引入 ws 包
const Store = require('electron-store'); // 引入 electron-store
const pool = require('./threadPool'); // 直接引入单例
const { exec } = require('child_process'); // 引入 child_process

class WebSocketClient {
    constructor(url) {
        if (!WebSocketClient.instance) {
            this.url = url;
            this.socket = null; // 初始化 socket
            this.heartbeatInterval = 30000; // 心跳间隔（30秒）
            this.heartbeatTimer = null; // 定时器
            this.store = new Store(); // 创建 electron-store 实例
            this.reconnectInterval = 5000; // 重连间隔（5秒）
            WebSocketClient.instance = this; // 将实例赋值给单例属性
        }

        return WebSocketClient.instance; // 返回单例实例
    }

    connect() {
        if (!this.socket) {
            this.socket = new WebSocket(this.url);

            this.socket.onopen = async () => {
                console.log('Connected to server');
                this.startHeartbeat(); // 开始心跳检测
                await this.sendAccountInfo(); // 发送账号信息
            };

            this.socket.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            };

            this.socket.onclose = () => {
                console.log('Disconnected from server');
                this.stopHeartbeat(); // 停止心跳检测
                this.socket = null; // 连接关闭时重置 socket
                this.reconnect(); // 尝试重连
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } else {
            console.log('WebSocket is already connected');
        }
    }

    reconnect() {
        console.log('Attempting to reconnect...');
        setTimeout(() => {
            this.connect(); // 重新连接
        }, this.reconnectInterval);
    }

    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ type: 'heartbeat', message: 'ping' }));
                console.log('Heartbeat sent');
            }
        }, this.heartbeatInterval);
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    async sendAccountInfo() {
        try {
            const deviceName = await this.getUniqueDeviceId(); // 获取设备 ID
            const accountInfoList = this.store.get('accountInfoList'); // 从 store 中获取账号信息

            for(let i = 0; i < accountInfoList.length; i++) {
                let accountInfo = accountInfoList[i];
                accountInfo.deviceName = deviceName + "-" + accountInfo.id;
                accountInfo.accountId = accountInfo.accountGuangGuangNum;
            }

            if (accountInfoList) {
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify({
                        type: 'accountInfo',
                        data: {
                            "deviceName": deviceName,
                            "accounts": accountInfoList
                        }
                    }));
                    console.log('Account info sent:', accountInfoList);
                } else {
                    console.error('WebSocket is not open. Unable to send account info.');
                }
            } else {
                console.log('No account info found in store.');
            }
        } catch (error) {
            console.error('Error getting unique device ID:', error);
        }
    }

    handleMessage(message) {
        console.log('Received message:', message);
        
        // 执行采集任务
        if (message.type === 'accountStartGatherTask') {
            const taskInfo = message.data;
            const taskFile = './server/threadable'; // 指定任务文件
            const taskId = taskInfo.accountInfo.accountId; // 任务 ID
            pool.createWorker(taskFile, taskId, taskInfo); // 创建并执行任务
            let workerMessage = {
                action: 'accountStartGatherTask',
                data: null
            };
            pool.sendMessageToWorker(taskId, workerMessage);
        }
        // 停止采集任务
        if (message.type === 'accountStopGatherTask') {
            const taskInfo = message.data;
            const taskId = taskInfo.accountInfo.accountId; // 任务 ID
            let workerMessage = {
                action: 'accountStopGatherTask',
                data: null
            };
            pool.sendMessageToWorker(taskId, workerMessage);
        }
        if (message.type === 'confirmation') {
            console.log(message.message);
        } else if (message.type === 'error') {
            console.error(message.message); // 处理错误消息
        }
    } 

    getUniqueDeviceId() {
        return new Promise((resolve, reject) => {
            exec("wmic bios get serialnumber", (error, stdout, stderr) => {
                if (error) {
                    return reject(error);
                }
                const serialNumber = stdout.split('\n')[1].trim(); // 获取序列号
                resolve(serialNumber);
            });
        });
    }
}

// 导出单例
module.exports = new WebSocketClient('ws://localhost:3000');
