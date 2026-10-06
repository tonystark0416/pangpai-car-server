// controllers/paymentController.js
const WechatPayV2 = require('../../util/wechatPay.js');
const wechatConfig = require('../../config/wx_api_config.js');
const url = require("url");
const wechatPay = new WechatPayV2(wechatConfig);
const work = require('../base/work.weixin.api.js');



class PaymentController {
    /**
     * JSAPI支付
     */
    async createJsapiPayment(req, res) {

        try {
            const query = url.parse(req.url, true).query
            const { body, outTradeNo, totalFee, openid, attach } = query;
            console.log(body, outTradeNo, totalFee, openid, attach)
            // const spbillCreateIp = req.ip.replace('::ffff:', ''); // 获取客户端IP 42.194.245.3
            const spbillCreateIp = '42.194.245.3'
            // 统一下单
            const result = await wechatPay.unifiedOrder({
                body,
                outTradeNo,
                totalFee,
                spbillCreateIp,
                tradeType: 'JSAPI',
                openid,
                attach
            });

            // 生成前端支付参数
            const jsapiParams = wechatPay.getJsApiParams(result.prepay_id);

            res.end(JSON.stringify({
                success: true,
                data: {
                    prepayId: result.prepay_id,
                    paymentParams: jsapiParams
                }
            }))

        } catch (error) {
            console.error('创建支付失败:', error);
            res.end(JSON.stringify({
                success: false,
                message: error.message
            }))
        }
    }

    /**
     * APP支付
     */
    async createAppPayment(req, res) {
        try {
            const { body, outTradeNo, totalFee, attach } = req.body;
            const spbillCreateIp = req.ip.replace('::ffff:', '');

            const result = await wechatPay.unifiedOrder({
                body,
                outTradeNo,
                totalFee,
                spbillCreateIp,
                tradeType: 'APP',
                attach
            });

            const appParams = wechatPay.getAppParams(result.prepay_id);

            res.json({
                success: true,
                data: appParams
            });
        } catch (error) {
            console.error('创建APP支付失败:', error);
            res.json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * 支付结果通知处理
     */
    handlePaymentNotify(req, res) {

        try {
            let xmlData = '';

            req.on('data', (chunk) => {
                xmlData += chunk
            })

            req.on('end', () => {
                
                if(!xmlData){
                    res.end('no wechat xml!')
                    return
                }

                console.log('接收到的 XML 数据:', xmlData)
                wechatPay.parseXml(xmlData).then(result => {
                    // console.log('解析后的:', result)

                    if (!wechatPay.verifySign(result)) {
                        return res.end(wechatPay.buildXml({
                            return_code: 'FAIL',
                            return_msg: '签名失败'
                        }));
                    }

                    if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
                        // 支付成功，处理业务逻辑
                        console.log('支付成功:', {
                            transactionId: result.transaction_id,
                            outTradeNo: result.out_trade_no,
                            totalFee: result.total_fee,
                            timeEnd: result.time_end
                        });

                        // TODO: 更新订单状态、发货等业务逻辑
                        console.log('新年好！')
                        //发送企微消息给员工
                        work.workSendMsgMiniProgram('LiuWeiZhao','wx020f943109e13f66','pages/orderList/orderList','订单通知','有一笔新订单',[{key:'订单号',value:999}])

                        res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
                        // 返回成功响应
                        res.end(wechatPay.buildXml({
                            return_code: 'SUCCESS',
                            return_msg: 'OK'
                        }));
                    }

                });

            })


            // 微信支付通知是XML格式
            // const xmlData = req.body;

            // const result = await wechatPay.parseXml(xmlData);

            // 验证签名
            // if (!wechatPay.verifySign(result)) {
            //     return res.send(wechatPay.buildXml({
            //         return_code: 'FAIL',
            //         return_msg: '签名失败'
            //     }));
            // }

            // if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
            //     // 支付成功，处理业务逻辑
            //     console.log('支付成功:', {
            //         transactionId: result.transaction_id,
            //         outTradeNo: result.out_trade_no,
            //         totalFee: result.total_fee,
            //         timeEnd: result.time_end
            //     });

            //     // TODO: 更新订单状态、发货等业务逻辑
            //     console.log('新年好！')

            //     // 返回成功响应
            //     res.send(wechatPay.buildXml({
            //         return_code: 'SUCCESS',
            //         return_msg: 'OK'
            //     }));
            // } else {
            //     // 支付失败
            //     console.log('支付失败:', result);
            //     res.send(wechatPay.buildXml({
            //         return_code: 'SUCCESS',
            //         return_msg: 'OK'
            //     }));
            // }
        } catch (error) {
            console.error('处理支付通知失败:', error);
            res.end(wechatPay.buildXml({
                return_code: 'FAIL',
                return_msg: '处理失败'
            }));
        }
    }

    /**
     * 查询订单
     */
    async queryOrder(req, res) {
        try {
            const { outTradeNo, transactionId } = req.query;

            const result = await wechatPay.orderQuery({
                outTradeNo,
                transactionId
            });

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('查询订单失败:', error);
            res.json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * 申请退款
     */
    async applyRefund(req, res) {
        try {
            const { outTradeNo, outRefundNo, totalFee, refundFee, refundDesc } = req.body;

            const result = await wechatPay.refund({
                outTradeNo,
                outRefundNo,
                totalFee,
                refundFee,
                refundDesc
            });

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('申请退款失败:', error);
            res.json({
                success: false,
                message: error.message
            });
        }
    }
}

module.exports = new PaymentController();