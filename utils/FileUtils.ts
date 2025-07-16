import { IDataObject } from 'n8n-workflow';

export interface FileAttachment {
  url: string;
  name: string;
  type: string;
  size?: number;
  data?: Buffer;
}

export interface S3PresignedUrl {
  uploadUrl: string;
  downloadUrl: string;
  fileName: string;
  fileType: string;
  expiresAt: string;
}

export class FileUtils {
  private static readonly SUPPORTED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/pdf',
    'application/json',
    'application/xml',
    'application/zip',
    'application/x-zip-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  static validateFileType(fileType: string): boolean {
    return this.SUPPORTED_TYPES.includes(fileType.toLowerCase());
  }

  static validateFileSize(size: number): boolean {
    return size <= this.MAX_FILE_SIZE;
  }

  static extractFileInfo(url: string): { name: string; type: string } {
    const urlParts = url.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
    
    const typeMapping: { [key: string]: string } = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'txt': 'text/plain',
      'csv': 'text/csv',
      'pdf': 'application/pdf',
      'json': 'application/json',
      'xml': 'application/xml',
      'zip': 'application/zip',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    return {
      name: fileName,
      type: typeMapping[fileExtension] || 'application/octet-stream',
    };
  }

  static async downloadFileFromUrl(url: string, headers?: IDataObject): Promise<Buffer> {
    try {
      const requestHeaders: Record<string, string> = {};
      if (headers) {
        Object.keys(headers).forEach(key => {
          requestHeaders[key] = String(headers[key]);
        });
      }

      const response = await fetch(url, {
        headers: requestHeaders,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      throw new Error(`Failed to download file from URL: ${error}`);
    }
  }

  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static isImageFile(fileType: string): boolean {
    return fileType.startsWith('image/');
  }

  static isTextFile(fileType: string): boolean {
    return fileType.startsWith('text/') || fileType.includes('json') || fileType.includes('xml');
  }

  static async convertToBase64(buffer: Buffer): Promise<string> {
    return buffer.toString('base64');
  }

  static async convertFromBase64(base64: string): Promise<Buffer> {
    return Buffer.from(base64, 'base64');
  }

  static sanitizeFileName(fileName: string): string {
    // Remove or replace invalid characters
    return fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');
  }

  static generateUniqueFileName(originalName: string): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const sanitizedName = this.sanitizeFileName(originalName);
    
    const parts = sanitizedName.split('.');
    if (parts.length > 1) {
      const extension = parts.pop();
      const baseName = parts.join('.');
      return `${baseName}_${timestamp}_${randomSuffix}.${extension}`;
    } else {
      return `${sanitizedName}_${timestamp}_${randomSuffix}`;
    }
  }

  static parseS3PresignedUrl(url: string): S3PresignedUrl | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      const fileName = pathParts[pathParts.length - 1];
      const fileInfo = this.extractFileInfo(fileName);
      
      return {
        uploadUrl: url,
        downloadUrl: url,
        fileName: fileInfo.name,
        fileType: fileInfo.type,
        expiresAt: urlObj.searchParams.get('X-Amz-Expires') || '',
      };
    } catch (error) {
      return null;
    }
  }

  static async validateFileContent(buffer: Buffer, expectedType: string): Promise<boolean> {
    // Basic file content validation
    if (buffer.length === 0) {
      return false;
    }

    // Check file signatures (magic numbers) for common types
    const fileSignatures: { [key: string]: number[][] } = {
      'image/jpeg': [[0xFF, 0xD8, 0xFF]],
      'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
      'image/gif': [[0x47, 0x49, 0x46, 0x38]],
      'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
      'application/zip': [[0x50, 0x4B, 0x03, 0x04], [0x50, 0x4B, 0x05, 0x06]],
    };

    const signatures = fileSignatures[expectedType];
    if (!signatures) {
      return true; // No signature check available, assume valid
    }

    const fileHeader = Array.from(buffer.slice(0, 8));
    
    return signatures.some(signature => 
      signature.every((byte, index) => fileHeader[index] === byte)
    );
  }

  static createFileAttachment(url: string, name?: string, type?: string, size?: number): FileAttachment {
    const fileInfo = name && type ? { name, type } : this.extractFileInfo(url);
    
    return {
      url,
      name: fileInfo.name,
      type: fileInfo.type,
      size,
    };
  }
}