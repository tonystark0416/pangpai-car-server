/**
 * 支付控制器（微信支付 V2）
 */
const WechatPayV2 = require('../services/wechat/pay');
const config = require('../config');
const work = require('../services/wechat/work');

const wechatPay = new WechatPayV2(config.wxPay);

class PaymentController {
  /**
   * JSAPI（小程序）支付下单
   * @method GET ?body=&outTradeNo=&totalFee=&openid=&attach=
   */
  async createJsapiPayment(req, res) {
    try {
      const { body, outTradeNo, totalFee, openid, attach } = req.query;
      const spbillCreateIp = config.wxPay.spbillCreateIp;
      // 统一下单
      const result = await wechatPay.unifiedOrder({
        body,
        outTradeNo,
        totalFee,
        spbillCreateIp,
        tradeType: 'JSAPI',
        openid,
        attach,
      });

      // 生成前端支付参数
      const jsapiParams = wechatPay.getJsApiParams(result.prepay_id);

      res.json({
        success: true,
        data: {
          prepayId: result.prepay_id,
          paymentParams: jsapiParams,
        },
      });
    } catch (error) {
      console.error('创建支付失败:', error);
      res.json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * APP支付下单
   * @method POST body: { body, outTradeNo, totalFee, attach }
   */
  async createAppPayment(req, res) {
    try {
      const { body, outTradeNo, totalFee, attach } = req.body;
      const spbillCreateIp = config.wxPay.spbillCreateIp;

      const result = await wechatPay.unifiedOrder({
        body,
        outTradeNo,
        totalFee,
        spbillCreateIp,
        tradeType: 'APP',
        attach,
      });

      const appParams = wechatPay.getAppParams(result.prepay_id);

      res.json({
        success: true,
        data: appParams,
      });
    } catch (error) {
      console.error('创建APP支付失败:', error);
      res.json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * 支付结果通知处理（微信回调，XML 报文）
   */
  handlePaymentNotify(req, res) {
    try {
      let xmlData = '';

      req.on('data', (chunk) => {
        xmlData += chunk;
      });

      req.on('end', () => {
        if (!xmlData) {
          res.end('no wechat xml!');
          return;
        }

        wechatPay.parseXml(xmlData).then((result) => {
          if (!wechatPay.verifySign(result)) {
            return res.end(wechatPay.buildXml({
              return_code: 'FAIL',
              return_msg: '签名失败',
            }));
          }

          if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
            console.log('支付成功:', {
              transactionId: result.transaction_id,
              outTradeNo: result.out_trade_no,
              totalFee: result.total_fee,
              timeEnd: result.time_end,
            });

            // TODO: 更新订单状态、发货等业务逻辑

            // 发送企微消息给员工（新订单通知）
            work.workSendMsgMiniProgram(
              config.workWx.notifyUserid,
              config.wx.appid,
              config.workWx.miniprogramPage,
              '订单通知',
              '有一笔新订单',
              [{ key: '订单号', value: result.out_trade_no }]
            );

            res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
            res.end(wechatPay.buildXml({
              return_code: 'SUCCESS',
              return_msg: 'OK',
            }));
          }
        });
      });
    } catch (error) {
      console.error('处理支付通知失败:', error);
      res.end(wechatPay.buildXml({
        return_code: 'FAIL',
        return_msg: '处理失败',
      }));
    }
  }

  /**
   * 查询订单
   * @method GET ?outTradeNo=&transactionId=
   */
  async queryOrder(req, res) {
    try {
      const { outTradeNo, transactionId } = req.query;

      const result = await wechatPay.orderQuery({
        outTradeNo,
        transactionId,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('查询订单失败:', error);
      res.json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * 申请退款
   * @method POST body: { outTradeNo, outRefundNo, totalFee, refundFee, refundDesc }
   */
  async applyRefund(req, res) {
    try {
      const { outTradeNo, outRefundNo, totalFee, refundFee, refundDesc } = req.body;

      const result = await wechatPay.refund({
        outTradeNo,
        outRefundNo,
        totalFee,
        refundFee,
        refundDesc,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('申请退款失败:', error);
      res.json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new PaymentController();
