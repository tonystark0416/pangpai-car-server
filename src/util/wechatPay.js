// utils/wechatPay.js
const crypto = require('crypto');
const axios = require('axios');
const xml2js = require('xml2js');
const md5 = require('md5');

class WechatPayV2 {
    constructor(config) {
        this.config = config;
    }

    /**
     * 生成随机字符串
     */
    generateNonceStr(length = 32) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * 生成签名
     */
    generateSign(params) {
        // console.log(params)
        // 1. 参数按ASCII码排序
        const sortedKeys = Object.keys(params).sort();

        // 2. 拼接成URL参数形式
        const stringA = sortedKeys
            .filter(key => params[key] && key !== 'sign' && params[key] !== '')
            .map(key => `${key}=${params[key]}`)
            .join('&');

        // 3. 加上API密钥
        const stringSignTemp = stringA + `&key=${this.config.apiKey}`;

        // 4. MD5加密并转大写
        return crypto.createHash('md5')
            .update(stringSignTemp, 'utf8')
            .digest('hex')
            .toUpperCase();
    }

    /**
     * 验证签名
     */
    verifySign(params) {
        const sign = params.sign;
        const calculatedSign = this.generateSign(params);
        return sign === calculatedSign;
    }

    /**
     * 对象转XML
     */
    buildXml(params) {
        const builder = new xml2js.Builder({
            rootName: 'xml',
            headless: true,
            cdata: true
        });
        return builder.buildObject(params);
    }

    /**
     * XML转对象
     */
    parseXml(xmlData) {
        return new Promise((resolve, reject) => {
            xml2js.parseString(xmlData, {
                explicitArray: false,
                explicitRoot: false
            }, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }

    /**
     * 发送请求到微信支付API
     */
    async request(url, params, useCert = false) {
        try {
            // 生成签名并添加到参数中
            const sign = this.generateSign(params);
            const dataWithSign = { ...params, sign };

            // 转换为XML
            const xmlData = this.buildXml(dataWithSign);

            // 设置请求配置
            const requestConfig = {
                headers: {
                    'Content-Type': 'text/xml'
                },
                timeout: 10000
            };

            // 如果需要证书（退款等操作）
            if (useCert && this.config.pfx) {
                requestConfig.httpsAgent = new (require('https').Agent)({
                    pfx: this.config.pfx,
                    passphrase: this.config.mchId
                });
            }

            const response = await axios.post(url, xmlData, requestConfig);
            const result = await this.parseXml(response.data);

            // 验证返回的签名
            if (result.return_code === 'SUCCESS' && !this.verifySign(result)) {
                throw new Error('返回签名验证失败');
            }

            return result;
        } catch (error) {
            console.error('微信支付请求失败:', error);
            throw error;
        }
    }

    /**
     * 统一下单接口
     */
    async unifiedOrder(orderData) {
        const {
            body,
            outTradeNo,
            totalFee,
            spbillCreateIp,
            tradeType = 'JSAPI',
            openid,
            attach,
            timeExpire
        } = orderData;

        const params = {
            appid: this.config.appid,
            mch_id: this.config.mchId,
            nonce_str: this.generateNonceStr(),
            body: body,
            out_trade_no: outTradeNo,
            total_fee: parseInt(totalFee),
            // total_fee: totalFee,
            spbill_create_ip: spbillCreateIp,
            notify_url: this.config.notifyUrl,
            trade_type: tradeType,
            ...(openid && { openid }),
            ...(attach && { attach }),
            ...(timeExpire && { time_expire: timeExpire })
        };

        const result = await this.request(
            'https://api.mch.weixin.qq.com/pay/unifiedorder',
            params
        );

        if (result.return_code === 'FAIL') {
            throw new Error(result.return_msg);
        }

        if (result.result_code === 'FAIL') {
            throw new Error(`${result.err_code}: ${result.err_code_des}`);
        }

        return result;
    }

    /**
     * 生成JSAPI支付参数
     */
    getJsApiParams(prepayId) {
        const params = {
            appId: this.config.appid,
            timeStamp: Math.floor(Date.now() / 1000).toString(),
            nonceStr: this.generateNonceStr(),
            package: `prepay_id=${prepayId}`,
            signType: 'MD5'
        };

        params.paySign = this.generateSign(params);
        return params;
    }

    /**
     * 生成APP支付参数
     */
    getAppParams(prepayId) {
        const params = {
            appid: this.config.appId,
            partnerid: this.config.mchId,
            prepayid: prepayId,
            package: 'Sign=WXPay',
            noncestr: this.generateNonceStr(),
            timestamp: Math.floor(Date.now() / 1000).toString()
        };

        params.sign = this.generateSign(params);
        return params;
    }

    /**
     * 查询订单
     */
    async orderQuery(queryData) {
        const { transactionId, outTradeNo } = queryData;

        const params = {
            appid: this.config.appId,
            mch_id: this.config.mchId,
            nonce_str: this.generateNonceStr(),
            ...(transactionId && { transaction_id: transactionId }),
            ...(outTradeNo && { out_trade_no: outTradeNo })
        };

        return await this.request(
            'https://api.mch.weixin.qq.com/pay/orderquery',
            params
        );
    }

    /**
     * 关闭订单
     */
    async closeOrder(outTradeNo) {
        const params = {
            appid: this.config.appId,
            mch_id: this.config.mchId,
            out_trade_no: outTradeNo,
            nonce_str: this.generateNonceStr()
        };

        return await this.request(
            'https://api.mch.weixin.qq.com/pay/closeorder',
            params
        );
    }

    /**
     * 申请退款
     */
    async refund(refundData) {
        const {
            transactionId,
            outTradeNo,
            outRefundNo,
            totalFee,
            refundFee,
            refundDesc
        } = refundData;

        const params = {
            appid: this.config.appId,
            mch_id: this.config.mchId,
            nonce_str: this.generateNonceStr(),
            ...(transactionId && { transaction_id: transactionId }),
            ...(outTradeNo && { out_trade_no: outTradeNo }),
            out_refund_no: outRefundNo,
            total_fee: parseInt(totalFee),
            refund_fee: parseInt(refundFee),
            ...(refundDesc && { refund_desc: refundDesc })
        };

        return await this.request(
            'https://api.mch.weixin.qq.com/secapi/pay/refund',
            params,
            true // 需要证书
        );
    }
}

module.exports = WechatPayV2;