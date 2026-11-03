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

    /**
     * 退款查询（v1.7.9）
     * https://api.mch.weixin.qq.com/pay/refundquery
     *
     * 四个标识**四选一**：transaction_id / out_trade_no / out_refund_no / refund_id。
     * 与 `orderQuery` 一样**返回原始结果不抛错**，由上层判断 `result_code`：
     * 「退款查询」最常见的正常失败就是 `ORDERNOTEXIST`（还没退过），属于业务分支而非异常。
     *
     * 注意：退款到银行卡是异步的，`refund_status` 会经历 `PROCESSING` → `SUCCESS`，
     * 这正是「不登录微信后台就看不到退款进展」要靠本接口解决的原因。
     *
     * @param {object} queryData {transactionId, outTradeNo, outRefundNo, refundId}
     * @returns {Promise<object>} 微信原始返回
     */
    async refundQuery(queryData) {
        const { transactionId, outTradeNo, outRefundNo, refundId } = queryData || {};
        if (!transactionId && !outTradeNo && !outRefundNo && !refundId) {
            throw new Error('退款查询缺少订单标识：需 transactionId / outTradeNo / outRefundNo / refundId 之一');
        }

        const params = {
            appid: this.config.appid,
            mch_id: this.config.mchId,
            nonce_str: this.generateNonceStr(),
            ...(transactionId && { transaction_id: transactionId }),
            ...(outTradeNo && { out_trade_no: outTradeNo }),
            ...(outRefundNo && { out_refund_no: outRefundNo }),
            ...(refundId && { refund_id: refundId }),
        };

        return await this.request(
            'https://api.mch.weixin.qq.com/pay/refundquery',
            params
        );
    }

    /**
     * 发送请求并返回**原始响应文本**（v1.7.11，供下载对账单使用）
     *
     * 现有 request() 会把响应喂给 XML 解析器，但「下载对账单」正常时返回的是
     * **CSV 文本**（tab 分隔），不是 XML——走 request() 会直接解析失败。
     * 这里返回原文，由调用方判断内容形态（`<xml` 开头 = 出错/无账单）。
     */
    async requestRaw(url, params, timeout = 60000) {
        const sign = this.generateSign(params);
        const xmlData = this.buildXml({ ...params, sign });
        const response = await axios.post(url, xmlData, {
            headers: { 'Content-Type': 'text/xml' },
            timeout,
            // arraybuffer 再转字符串，避免 axios 按错误编码猜
            responseType: 'arraybuffer',
        });
        return Buffer.from(response.data).toString('utf8');
    }

    /**
     * 下载对账单（v1.7.11）
     * https://api.mch.weixin.qq.com/pay/downloadbill
     *
     * @param {object} opt
     * @param {string} opt.billDate  账单日期 YYYYMMDD（账单 T+1 生成，一般当天上午 10 点后可取前一天的）
     * @param {string} [opt.billType] ALL（默认，含支付+退款）/ SUCCESS / REFUND
     * @returns {Promise<string>} 原始响应文本：CSV（tab 分隔）或 XML（当天无账单等错误）
     */
    async downloadBill({ billDate, billType = 'ALL' }) {
        if (!/^\d{8}$/.test(billDate)) {
            throw new Error('billDate 格式必须为 YYYYMMDD');
        }
        const params = {
            appid: this.config.appid,
            mch_id: this.config.mchId,
            nonce_str: this.generateNonceStr(),
            bill_date: billDate,
            bill_type: billType,
        };
        return await this.requestRaw(
            'https://api.mch.weixin.qq.com/pay/downloadbill',
            params
        );
    }

    /**
     * 解析对账单 CSV（v1.7.11）
     *
     * ⚠️ 实测格式（2026-11-04 用真实账单验证）：
     *   - 分隔符是**逗号**不是 tab；文件带 BOM（\ufeff）
     *   - 列名行以「交易时间」开头（老文档写的「记账时间」也能兼容）
     *   - 数据行金额带 ` 前缀（微信防 Excel 转义符），需去掉
     *   - 字段值含逗号时微信用双引号包裹（如商品名称），需引号感知解析
     *   - 汇总区：空行后 `总交易单数,应结订单总金额,...` 一行列名 + 一行数值
     *   - 当天无账单时整个响应是 XML（return_code=FAIL, error_code 20002；
     *     账单 T+1 生成，凌晨可能返回 Bill Creating）
     *   - 退款行的商户退款单号形如 RPP2026...（= R + 订单号，订单号本身 PP 开头）
     *
     * @param {string} raw downloadBill 的原始响应
     * @returns {Promise<{rows: object[], summary: object|null, error: object|null}>}
     */
    async parseBill(raw) {
        const text = String(raw || '').replace(/^\ufeff/, '').trim();

        // XML = 出错（无账单 / 账单生成中）
        if (text.startsWith('<xml')) {
            const xml = await this.parseXml(text);
            return { rows: [], summary: null, error: xml };
        }

        const lines = text.split(/\r?\n/);
        const headerIdx = lines.findIndex((l) => /^(记账|交易)时间/.test(l.replace(/^\ufeff/, '')));
        if (headerIdx === -1) {
            return { rows: [], summary: null, error: { return_code: 'FAIL', return_msg: '账单格式异常：找不到列名行' } };
        }

        // 分隔符实测为逗号；留 tab 检测做兼容（万一微信改格式）
        const delim = lines[headerIdx].includes('\t') ? '\t' : ',';
        const headers = this.splitCsvLine(lines[headerIdx], delim).map((s) => s.trim());
        const strip = (s) => String(s ?? '').replace(/^`/, '').trim();

        const rows = [];
        for (let i = headerIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;            // 空行：账单数据与汇总区的分隔
            if (/^总交易/.test(line)) break;       // 进入汇总区
            const cells = this.splitCsvLine(line, delim).map(strip);
            const row = {};
            headers.forEach((h, idx) => { row[h] = cells[idx] ?? ''; });
            rows.push(row);
        }

        // 汇总区（逗号分隔，同样带 ` 前缀）
        let summary = null;
        const sumIdx = lines.findIndex((l) => /^总交易/.test(l));
        if (sumIdx !== -1 && lines[sumIdx + 1]) {
            const keys = this.splitCsvLine(lines[sumIdx], ',').map((s) => strip(s));
            const vals = this.splitCsvLine(lines[sumIdx + 1], ',').map((s) => strip(s));
            summary = {};
            keys.forEach((k, i) => { summary[k] = vals[i] ?? ''; });
        }

        return { rows, summary, error: null };
    }

    /**
     * 引号感知的 CSV 行拆分（v1.7.11）
     * 字段值含逗号/引号时微信用双引号包裹（如 "庞派,租车"），单纯 split(',') 会切错列
     */
    splitCsvLine(line, delim = ',') {
        const out = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (line[i + 1] === '"') { cur += '"'; i++; } // 转义的 ""
                    else inQuotes = false;
                } else cur += ch;
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === delim) {
                out.push(cur); cur = '';
            } else {
                cur += ch;
            }
        }
        out.push(cur);
        return out;
    }
}

module.exports = WechatPayV2;
