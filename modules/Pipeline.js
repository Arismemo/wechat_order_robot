import CozeProcessor from './CozeProcessor.js';
import FeishuProcessor from './FeishuProcessor.js';
import Logger from '../utils/Logger.js';

export default class Pipeline {
  constructor() {
    this.cozeProcessor = new CozeProcessor();
    this.feishuProcessor = new FeishuProcessor();
  }

  async process(chatSnippets) {
    try {
      Logger.log(`开始处理 ${chatSnippets.length} 条聊天片段`, 'INFO');

      if (chatSnippets.length === 0) {
        Logger.log('没有聊天片段需要处理', 'INFO');
        return;
      }

      const hasImage = chatSnippets.some(snippet => snippet.type === 'image');
      if (!hasImage) {
        Logger.log('聊天片段中没有图片消息，跳过处理', 'INFO');
        return;
      }

      const orderListResponse = await this.cozeProcessor.getOrderList(chatSnippets);
      if (!orderListResponse) {
        Logger.log('未能获取订单列表响应', 'ERROR');
        return;
      }

      Logger.log('成功获取订单列表，准备推送到飞书', 'INFO');
      const feishuResponse = await this.feishuProcessor.batchPushToFeishu(orderListResponse);

      if (feishuResponse) {
        Logger.log(`成功推送到飞书，响应: ${JSON.stringify(feishuResponse)}`, 'INFO');
      } else {
        Logger.log('推送到飞书失败', 'ERROR');
      }
    } catch (error) {
      Logger.log(`Pipeline 处理过程中发生错误: ${error}`, 'ERROR');
    } finally {
      Logger.log('Pipeline 处理完成', 'INFO');
    }
  }
}
