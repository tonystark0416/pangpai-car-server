/**
 * 支付控制器（微信支付 V2）
 */
const WechatPayV2 = require('../services/wechat/pay');
const config = require('../config');
const work = require('../services/wechat/work');
const orderModel = require('../models/order.model');

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
   *
   * 处理顺序：验签 → 订单存在性 → 金额核验 → 落库（幂等）→ 企微通知 → 应答
   * 应答规则：处理成功返回 SUCCESS（停止微信重推）；签名/系统错误返回 FAIL（微信按 15s/1m/…重推）
   */
  handlePaymentNotify(req, res) {
    let xmlData = '';

    req.on('data', (chunk) => {
      xmlData += chunk;
    });

    req.on('end', async () => {
      const replyFail = (msg) => {
        res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
        res.end(wechatPay.buildXml({ return_code: 'FAIL', return_msg: msg }));
      };
      const replySuccess = () => {
        res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
        res.end(wechatPay.buildXml({ return_code: 'SUCCESS', return_msg: 'OK' }));
      };

      if (!xmlData) {
        return replyFail('无报文');
      }

      try {
        const result = await wechatPay.parseXml(xmlData);

        // 1. 验签
        if (!wechatPay.verifySign(result)) {
          console.error('[pay-callback] 验签失败:', result.out_trade_no);
          return replyFail('签名失败');
        }

        if (result.return_code !== 'SUCCESS') {
          // 通信失败等场景：应答 SUCCESS 停止无意义重推，等待后续通知
          console.warn('[pay-callback] return_code FAIL:', result.return_msg);
          return replySuccess();
        }

        if (result.result_code !== 'SUCCESS') {
          // 支付失败通知：应答 SUCCESS 停止重推，订单保持待支付
          console.warn('[pay-callback] 支付失败:', result.out_trade_no, result.err_code, result.err_code_des);
          return replySuccess();
        }

        console.log('[pay-callback] 支付成功:', {
          transactionId: result.transaction_id,
          outTradeNo: result.out_trade_no,
          totalFee: result.total_fee,
          timeEnd: result.time_end,
        });

        // 2. 订单存在性核验
        const order = await orderModel.getOrderBySn(result.out_trade_no);
        if (!order) {
          console.error('[pay-callback] 订单不存在:', result.out_trade_no);
          return replyFail('订单不存在');
        }

        // 3. 金额核验（单位：分）
        const expectFee = Math.round(Number(order.total_price) * 100);
        if (Number(result.total_fee) !== expectFee) {
          console.error('[pay-callback] 金额不一致:', result.out_trade_no, '期望', expectFee, '实付', result.total_fee);
          return replyFail('金额不一致');
        }

        // 4. 幂等落库（已支付的重复通知 affectedRows=0，直接应答成功）
        const affected = await orderModel.markOrderPaid(result.out_trade_no, result.transaction_id, result.time_end);
        if (affected === -1) {
          return replyFail('系统异常'); // DB 错误，让微信重推
        }
        if (affected === 0) {
          console.log('[pay-callback] 订单已支付，幂等跳过:', result.out_trade_no);
        }

        // 5. 企微通知员工（新订单）
        work.workSendMsgMiniProgram(
          config.workWx.notifyUserid,
          config.wx.appid,
          config.workWx.miniprogramPage,
          '订单通知',
          '有一笔新订单',
          [{ key: '订单号', value: result.out_trade_no }]
        );

        replySuccess();
      } catch (error) {
        console.error('[pay-callback] 处理异常:', error);
        replyFail('处理失败');
      }
    });
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
