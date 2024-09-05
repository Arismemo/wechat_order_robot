import { types } from 'wechaty';
import Config from '../utils/Config.js';
import Logger from '../utils/Logger.js';
import fs from 'fs';

export default class MessageListener {
  constructor(pipeline) {
    this.pipeline = pipeline;
    this.chatSnippets = [];
    this.timeoutId = null;
    this.timeoutStartTime = null;
  }

  async onMessage(msg) {
    try {
      const room = await msg.room();
      if (!room || await room.topic() !== Config.WATCH_ROOM_NAME) return;

      const talker = msg.talker();
      const talkerName = talker ? talker.name() : 'Unknown';
      if (!Config.WATCH_TALKERS.includes(talkerName)) return;

      Logger.log(`收到消息: [房间: ${await room.topic()}] [${talkerName}: ${msg.text()}]`);
      const messageTime = new Date();
      const messageType = msg.type();

      if (messageType === types.Message.Text) {
        this.chatSnippets.push({ time: messageTime, type: 'text', content: msg.text(), sender: talkerName });
      } else if (messageType === types.Message.Image) {
        const file = await msg.toFileBox();
        const filePath = `${Config.IMAGE_PATH}${file.name}`;
        
        if (!fs.existsSync(filePath)) {
          Logger.log(`保存文件到: ${filePath}`);
          await file.toFile(filePath);
        } else {
          Logger.log(`文件已存在: ${filePath}`);
        }

        this.chatSnippets.push({ time: messageTime, type: 'image', content: file.name, sender: talkerName });
      } else {
        Logger.log(`未知消息类型: ${messageType}`, 'WARN');
      }

      this.resetTimeout();
    } catch (error) {
      Logger.log(`处理消息时出错: ${error}`, 'ERROR');
    }
  }

  resetTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutStartTime = new Date();
    this.timeoutId = setTimeout(async () => {
      Logger.log(`处理 ${this.chatSnippets.length} 条聊天片段（超时后）`);
      if (this.chatSnippets.length > 0) {
        await this.pipeline.process(this.chatSnippets);
        this.chatSnippets = [];
      }
    }, Config.CHAT_SNIPPET_INTERVAL);
  }
}
