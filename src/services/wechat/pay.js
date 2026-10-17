/**
 * 微信支付 V2 完整实现（统一下单 / 查单 / 关单 / 退款）
 * MD5 签名 + XML 报文 + p12 证书双向认证
 */
const crypto = require('crypto');
const axios = require('axios');
const xml2js = require('xml2js');

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
            // v1.6.11：优先使用 PEM（cert/key），兼容 Node 17+ 的 OpenSSL 3；无 PEM 时回退 p12
            if (useCert) {
                const agentOpts = {};
                if (this.config.cert && this.config.key) {
                    agentOpts.cert = this.config.cert;
                    agentOpts.key = this.config.key;
                } else if (this.config.pfx) {
                    agentOpts.pfx = this.config.pfx;
                    agentOpts.passphrase = this.config.mchId;
                } else {
                    throw new Error(
                        `缺少微信支付退款证书，请将 apiclient_cert.p12 放到 ${this.config.pfxPath}，` +
                        `或转换为 PEM 放到 ${this.config.certPath} / ${this.config.keyPath}（可用 .env 的 WX_CERT_PATH / WX_KEY_PATH 指定）`
                    );
                }
                requestConfig.httpsAgent = new (require('https').Agent)(agentOpts);
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
            appid: this.config.appid,
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
            appid: this.config.appid,
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
            appid: this.config.appid,
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
            totalFee,       // 单位：分
            refundFee,      // 单位：分
            refundDesc
        } = refundData;

        // v1.6.11 修复：原误用 config.appId（不存在，签名为空导致参数缺失）
        // 且退款必须走证书双向认证，缺证书时给出明确错误而非静默失败
        if (!this.config.hasCert()) {
            throw new Error(
                `缺少微信支付退款证书：请将 apiclient_cert.p12 放到 ${this.config.pfxPath}，` +
                `或（Node 17+ 推荐）转成 PEM 放到 ${this.config.certPath} / ${this.config.keyPath}`
            );
        }

        const params = {
            appid: this.config.appid,
            mch_id: this.config.mchId,
            nonce_str: this.generateNonceStr(),
            ...(transactionId && { transaction_id: transactionId }),
            ...(outTradeNo && { out_trade_no: outTradeNo }),
            out_refund_no: outRefundNo,
            total_fee: parseInt(totalFee),
            refund_fee: parseInt(refundFee),
            ...(refundDesc && { refund_desc: refundDesc }),
            ...(this.config.refundNotifyUrl && { notify_url: this.config.refundNotifyUrl }),
        };

        const result = await this.request(
            'https://api.mch.weixin.qq.com/secapi/pay/refund',
            params,
            true // 需要证书
        );

        if (result.return_code === 'FAIL') {
            throw new Error(result.return_msg);
        }
        if (result.result_code === 'FAIL') {
            throw new Error(`${result.err_code}: ${result.err_code_des}`);
        }
        return result;
    }
}

module.exports = WechatPayV2;
