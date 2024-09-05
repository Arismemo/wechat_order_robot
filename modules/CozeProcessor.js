import fetch from 'node-fetch';
import Config from '../utils/Config.js';
import Logger from '../utils/Logger.js';

export default class CozeProcessor {
  async getOrderList(chatSnippets) {
    Logger.log(`chatSnippets: ${JSON.stringify(chatSnippets, null, 2)}`);
    const requestData = {
      bot_id: Config.COZE_BOT_ID,
      user_id: Config.COZE_USER_ID,
      stream: false,
      auto_save_history: true,
      additional_messages: [{
        role: "user",
        content: JSON.stringify(
          chatSnippets.map(snippet => ({
            "timestamp": snippet.time.toISOString(),
            "sender": snippet.sender || "unknown",
            "content": snippet.content,
            "content_type": snippet.type || "text"
          }))
        ),
        content_type: "text"
      }]
    };

    try {
      const response = await fetch('https://api.coze.cn/v3/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Config.COZE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        timeout: 120000
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const initResponse = await response.json();
      const { id, conversation_id } = initResponse.data;
      Logger.log(`Chat initiated with id: ${id}, and conversation_id: ${conversation_id}`);

      let isCompleted = false;
      while (!isCompleted) {
        await new Promise(resolve => setTimeout(resolve, 8000));
        Logger.log("Checking chat completion status...");
        const statusResponse = await fetch(`https://api.coze.cn/v3/chat/retrieve?chat_id=${id}&conversation_id=${conversation_id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${Config.COZE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        }).then(res => res.json());

        Logger.log(`Chat completion status response: ${JSON.stringify(statusResponse, null, 2)}`);
        if (statusResponse?.data?.status === 'completed') {
          isCompleted = true;
        } else {
          Logger.log("Chat is not yet completed. Waiting for 8 seconds before retrying...");
        }
      }

      Logger.log("Retrieving chat messages...");
      const messagesResponse = await fetch(`https://api.coze.cn/v3/chat/message/list?chat_id=${id}&conversation_id=${conversation_id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Config.COZE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      }).then(res => res.json());

      Logger.log(`Retrieved chat messages: ${JSON.stringify(messagesResponse, null, 2)}`);

      const content = messagesResponse.data.find(item => item.type === "answer")?.content;
      Logger.log(`final contents: ${content}`);

      return content;
    } catch (error) {
      Logger.log(`Error during getOrderList: ${error}`, 'ERROR');
      return null;
    }
  }
}
