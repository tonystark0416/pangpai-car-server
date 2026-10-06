
/**
 * 处理图片请求，展示图片在浏览器，当成图片服务器
 */


const fs = require('fs');
const path = require('path');


function showImage(req, res) {
    try {
        const filename = req.url.split('/').pop();
        const imagePath = path.join('/www/wwwroot/uploads', filename);
        console.log(filename, imagePath)

        // 检查文件是否存在
        if (!fs.existsSync(imagePath)) {
            res.writeHead(404);
            res.end('Image not found');
            return;
        }

        // 读取图片文件
        const imageBuffer = fs.readFileSync(imagePath);

        // 根据文件扩展名设置 Content-Type
        const ext = path.extname(filename).toLowerCase();
        const contentTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml'
        };

        const contentType = contentTypes[ext] || 'application/octet-stream';

        // 设置响应头
        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': imageBuffer.length,
            'Cache-Control': 'public, max-age=3600' // 缓存1小时
        });

        // 发送图片数据
        res.end(imageBuffer);

    } catch (error) {
        res.writeHead(500);
        res.end('Server error');
    }


}



module.exports = {
    showImage
}