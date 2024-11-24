const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// 处理 GET 请求
app.get('/', (req, res) => {
    res.send('Hello, World!');
});

// 文件下载路由
app.get('/download', (req, res) => {
    const file = path.join(__dirname, 'files', 'sample.txt'); // 修改为你的文件路径
    res.download(file, (err) => {
        if (err) {
            console.error('File download failed:', err);
            res.status(500).send('Error downloading file.');
        }
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
