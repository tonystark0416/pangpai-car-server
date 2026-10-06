/**
 * 
 * 文件上传工具函数
 */

const multer = require('multer');
const fs = require('fs'); // 用于保存文件


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, '../../wwwroot/uploads/') // 确保这个目录存在
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + '.' + file.originalname.split('.').pop())
        // cb(null, file.fieldname + Date.now() + '.' + file.originalname.split('.').pop())
    }
});

const upload = multer({ storage: storage, limits: { files: 1, fileSize: 10000000 } });

function uploadFile(req, res) {
    try {
        upload.single('file')(req, res, function (err) {
            if (err) {
                console.log(req.file)
                return res.writeHead(500).end('File upload failed due to: ' + err.message);
            } else {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                console.log(req.file)
                res.end(JSON.stringify({code:200,path:'https://pangpai-car.com/images/'+req.file.filename}))
                // res.end('File uploaded successfully\n Saved to: ' + req.file.path);
            }
        });
    } catch (error) {
        console.error('Error during file upload:', error);
        res.status(500).send('Error during file upload');
    }

}

module.exports = {
    uploadFile
}
