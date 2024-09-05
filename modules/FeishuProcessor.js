import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import Config from '../utils/Config.js';
import Logger from '../utils/Logger.js';

export default class FeishuProcessor {
  constructor() {
    this.currentToken = 't-g1048thEHAUNQ7XK5U6D3BBW2OZ6JYDFDQIHR7XR';
  }

  async getNewFeishuTenantAccessToken() {
    try {
      const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: Config.APP_ID, app_secret: Config.APP_SECRET }),
        timeout: 120000
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const { tenant_access_token } = await response.json();
      Logger.log(`New tenant_access_token: ${tenant_access_token.slice(0, 10)}...`);
      return tenant_access_token;
    } catch (error) {
      Logger.log(`Error during getNewToken: ${error.message}`, 'ERROR');
      return null;
    }
  }

  async uploadImageAndGetToken(imagePath) {
    if (!this.currentToken) {
      Logger.log('Error: Access token is required.', 'ERROR');
      return;
    }

    let fileStats;
    try {
      fileStats = fs.statSync(imagePath);
    } catch (error) {
      Logger.log(`Error: Unable to read the image file. Path: ${imagePath}, Error: ${error.message}`, 'ERROR');
      return;
    }

    const fileName = imagePath.split('/').pop();
    const fileSize = fileStats.size;

    const uploadUrl = 'https://open.feishu.cn/open-apis/drive/v1/medias/upload_all';
    const formData = new FormData();
    formData.append('file_name', fileName);
    formData.append('parent_type', 'bitable_image');
    formData.append('parent_node', Config.BITABLE_APP_ID);
    formData.append('size', fileSize.toString());
    formData.append('file', fs.createReadStream(imagePath));

    try {
      const headers = {
        'Authorization': `Bearer ${this.currentToken}`,
        ...formData.getHeaders()
      };

      let response = await fetch(uploadUrl, {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok || response.status === 401 || response.status === 403 || response.status === 99991663) {
        Logger.log("Token expired or unauthorized. Getting a new token...");
        this.currentToken = await this.getNewFeishuTenantAccessToken();
        if (!this.currentToken) {
          throw new Error("Failed to get new token");
        }
        headers['Authorization'] = `Bearer ${this.currentToken}`;
        response = await fetch(uploadUrl, {
          method: 'POST',
          headers: headers,
          body: formData
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        Logger.log(`HTTP error! status: ${response.status}, response: ${errorText}`, 'ERROR');
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.code !== 0) {
        Logger.log(`Error: ${data.msg}`, 'ERROR');
        return;
      }

      Logger.log(`File uploaded successfully. File token: ${data.data.file_token}`);
      return data.data.file_token;
    } catch (error) {
      Logger.log(`Error during file upload: ${error.message}`, 'ERROR');
    }
  }

  async batchPushToFeishu(records) {
    Logger.log(`Records to batch push: ${records}`);
    try {
      const appId = Config.BITABLE_APP_ID;
      const tableId = Config.BITABLE_TABLE_ID;

      let parsedRecords;
      try {
        parsedRecords = JSON.parse(records);
      } catch (error) {
        Logger.log(`Failed to parse records string: ${records}, Error: ${error}`, 'ERROR');
        return null;
      }

      Logger.log(`Parsed records: ${JSON.stringify(parsedRecords, null, 2)}`, 'DEBUG');

      const processedRecords = parsedRecords.map(recordObj => {
        try {
          Logger.log(`Processing recordObj: ${JSON.stringify(recordObj)}`, 'DEBUG');
          
          return {
            fields: {
              "客户备注信息": recordObj['客户备注信息'] || "",
              "是否加急": recordObj['是否加急'] || "",
              "下单数量": parseInt(recordObj['下单数量'], 10) || 0,
              "图片": recordObj['图片'] ? [recordObj['图片']] : []
            }
          };
        } catch (error) {
          Logger.log(`Failed to process record: ${recordObj}, Error: ${error}`, 'ERROR');
          return null;
        }
      }).filter(record => record !== null);

      Logger.log(`Processed records: ${JSON.stringify(processedRecords, null, 2)}`, 'DEBUG');

      for (let i = 0; i < processedRecords.length; i++) {
        let recordObj = processedRecords[i];

        try {
          if (recordObj.fields['图片'] && recordObj.fields['图片'][0]) {
            const imagePath = Config.IMAGE_PATH + recordObj.fields['图片'][0];
            Logger.log(`Uploading image at path: ${imagePath}`);
            const fileToken = await this.uploadImageAndGetToken(imagePath);
            if (fileToken) {
              Logger.log(`Successfully uploaded image. fileToken: ${fileToken}`);
              recordObj.fields['图片'] = [{ "file_token": fileToken }];
            } else {
              Logger.log(`Failed to upload image at path: ${imagePath}`, 'ERROR');
            }
          }
        } catch (error) {
          Logger.log(`Failed to process record for image upload: ${recordObj}, Error: ${error}`, 'ERROR');
        }
      }

      Logger.log(`Processed records: ${JSON.stringify(processedRecords, null, 2)}`, 'DEBUG');

      const requestBody = {
        records: processedRecords
      };

      Logger.log(`Final request body to Feishu: ${JSON.stringify(requestBody, null, 2)}`, 'DEBUG');

      let response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appId}/tables/${tableId}/records/batch_create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        timeout: 120000
      });

      if (!response.ok || response.status === 401 || response.status === 403 || response.status === 99991663) {
        Logger.log("Token expired or unauthorized. Getting a new token...");
        this.currentToken = await this.getNewFeishuTenantAccessToken();
        if (!this.currentToken) {
          throw new Error("Failed to get new token");
        }
        response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appId}/tables/${tableId}/records/batch_create`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.currentToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          timeout: 120000
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        Logger.log(`Failed to batch create records: ${errorText}`, 'ERROR');
        throw new Error(`Failed to batch create records: ${errorText}`);
      }

      const responseData = await response.json();
      return responseData;
    } catch (error) {
      Logger.log(`Error during batchPushToFeishu: ${error}`, 'ERROR');
      return null;
    }
  }
}
