import 'dotenv/config.js';
import { WechatyBuilder } from 'wechaty';
import qrcodeTerminal from 'qrcode-terminal';
import Config from './utils/Config.js';
import Logger from './utils/Logger.js';
import MessageListener from './modules/MessageListener.js';
import Pipeline from './modules/Pipeline.js';
import axios from 'axios';

async function sendMessageToFeishu(message) {
  try {
    await axios.post(Config.FEISHU_WEBHOOK, {
      msg_type: 'text',
      content: { text: message }
    });
    Logger.log('消息已发送到飞书', 'INFO');
  } catch (error) {
    Logger.log(`发送消息到飞书失败: ${error}`, 'ERROR');
  }
}

async function onScan(qrcode, status) {
  Logger.log(`扫描二维码登录: ${status}\nhttps://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`, 'INFO');
  await sendMessageToFeishu(`请扫描二维码登录: https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`);
}

async function onLogin(user) {
  Logger.log(`用户 ${user} 已登录`, 'INFO');
}

async function startBot() {
  const bot = WechatyBuilder.build({
    name: 'mybot',
    puppet: 'wechaty-puppet-wechat',
    puppetOptions: {
      uos: true
    }
  });

  const pipeline = new Pipeline();
  const messageListener = new MessageListener(pipeline);

  bot
    .on('scan', onScan)
    .on('login', onLogin)
    .on('message', msg => messageListener.onMessage(msg))
    .on('error', async e => {
      Logger.log(`机器人错误: ${e}`, 'ERROR');
      await sendMessageToFeishu(`机器人发生错误，正在尝试重启: ${e}`);
      await bot.stop();
      startBot();
    });

  try {
    await bot.start();
    Logger.log("机器人成功启动", 'INFO');
  } catch (e) {
    Logger.log(`机器人启动错误: ${e}`, 'ERROR');
    await sendMessageToFeishu(`机器人启动失败，正在尝试重新启动: ${e}`);
    setTimeout(startBot, 10000);
  }
}

async function main() {
  Logger.log("启动机器人...", 'INFO');
  startBot();
}

process.on('uncaughtException', async (error) => {
  Logger.log(`未捕获的异常: ${error}`, 'ERROR');
  await sendMessageToFeishu(`机器人遇到未捕获的异常，正在尝试重启: ${error}`);
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  Logger.log(`未处理的 Promise 拒绝: ${reason}`, 'ERROR');
  await sendMessageToFeishu(`机器人遇到未处理的 Promise 拒绝，正在尝试重启: ${reason}`);
  process.exit(1);
});

main();
