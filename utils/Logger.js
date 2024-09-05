import Config from './Config.js';

export default class Logger {
  static log(message, level = 'INFO') {
    if (Config.DEBUG || level === 'ERROR') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level}] ${message}`);
    }
  }
}
