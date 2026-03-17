import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export class TelegramAPI {
  private token: string;
  private baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async sendMessage(chatId: number | string, text: string, options: any = {}) {
    try {
      const response = await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...options,
      });
      return response.data;
    } catch (error: any) {
      console.error('Telegram sendMessage error:', error.response?.data || error.message);
      throw error;
    }
  }

  async editMessageText(chatId: number | string, messageId: number, text: string, options: any = {}) {
    try {
      const response = await axios.post(`${this.baseUrl}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        ...options,
      });
      return response.data;
    } catch (error: any) {
      console.error('Telegram editMessageText error:', error.response?.data || error.message);
      throw error;
    }
  }

  async deleteMessage(chatId: number | string, messageId: number) {
    try {
      const response = await axios.post(`${this.baseUrl}/deleteMessage`, {
        chat_id: chatId,
        message_id: messageId,
      });
      return response.data;
    } catch (error: any) {
      console.error('Telegram deleteMessage error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getChatMember(chatId: number | string, userId: number) {
    try {
      const response = await axios.post(`${this.baseUrl}/getChatMember`, {
        chat_id: chatId,
        user_id: userId,
      });
      return response.data.result;
    } catch (error: any) {
      console.error('Telegram getChatMember error:', error.response?.data || error.message);
      return null;
    }
  }

  async getFile(fileId: string) {
    try {
      const response = await axios.get(`${this.baseUrl}/getFile?file_id=${fileId}`);
      return response.data.result;
    } catch (error: any) {
      console.error('Telegram getFile error:', error.response?.data || error.message);
      throw error;
    }
  }

  getFileUrl(filePath: string) {
    return `https://api.telegram.org/file/bot${this.token}/${filePath}`;
  }

  async setWebhook(url: string, secretToken?: string) {
    try {
      const response = await axios.post(`${this.baseUrl}/setWebhook`, {
        url,
        secret_token: secretToken,
        allowed_updates: ['message', 'callback_query', 'chat_member', 'my_chat_member'],
      });
      return response.data;
    } catch (error: any) {
      console.error('Telegram setWebhook error:', error.response?.data || error.message);
      throw error;
    }
  }

  async deleteWebhook() {
    try {
      const response = await axios.post(`${this.baseUrl}/deleteWebhook`);
      return response.data;
    } catch (error: any) {
      console.error('Telegram deleteWebhook error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getWebhookInfo() {
    try {
      const response = await axios.get(`${this.baseUrl}/getWebhookInfo`);
      return response.data.result;
    } catch (error: any) {
      console.error('Telegram getWebhookInfo error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getMe() {
    try {
      const response = await axios.get(`${this.baseUrl}/getMe`);
      return response.data.result;
    } catch (error: any) {
      console.error('Telegram getMe error:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendPhoto(chatId: number | string, photo: string, options?: {
    caption?: string;
    parse_mode?: string;
    reply_markup?: any;
  }): Promise<any> {
    try {
      const response = await axios.post(`${this.baseUrl}/sendPhoto`, {
        chat_id: chatId,
        photo,
        ...options,
      });
      return response.data;
    } catch (error: any) {
      console.error('Telegram sendPhoto error:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendPhotoFile(chatId: number | string, filePath: string, options?: {
    caption?: string;
    parse_mode?: string;
    reply_markup?: any;
  }): Promise<any> {
    const stream = fs.createReadStream(filePath);
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('photo', stream, { filename: path.basename(filePath) });
    if (options?.caption) form.append('caption', options.caption);
    if (options?.parse_mode) form.append('parse_mode', options.parse_mode);
    if (options?.reply_markup) form.append('reply_markup', JSON.stringify(options.reply_markup));
    try {
      const response = await axios.post(`${this.baseUrl}/sendPhoto`, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      return response.data;
    } catch (error: any) {
      stream.destroy();
      console.error('Telegram sendPhotoFile error:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendAnimationFile(chatId: number | string, filePath: string, options?: {
    caption?: string;
    parse_mode?: string;
    reply_markup?: any;
  }): Promise<any> {
    const stream = fs.createReadStream(filePath);
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('animation', stream, { filename: path.basename(filePath) });
    if (options?.caption) form.append('caption', options.caption);
    if (options?.parse_mode) form.append('parse_mode', options.parse_mode);
    if (options?.reply_markup) form.append('reply_markup', JSON.stringify(options.reply_markup));
    try {
      const response = await axios.post(`${this.baseUrl}/sendAnimation`, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      return response.data;
    } catch (error: any) {
      stream.destroy();
      console.error('Telegram sendAnimationFile error:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default TelegramAPI;
