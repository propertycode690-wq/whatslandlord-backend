"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto = __importStar(require("crypto"));
const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.INTEGRATION_ENCRYPTION_KEY || 'wLandlord_sec_encrypt_key_32_chr'; // fallback if not loaded
// Validate key length
const getValidKey = () => {
    let key = ENCRYPTION_KEY;
    if (key.length !== 32) {
        console.warn(`INTEGRATION_ENCRYPTION_KEY is ${key.length} characters long instead of 32. Truncating or padding.`);
        key = key.padEnd(32, '!').slice(0, 32);
    }
    return Buffer.from(key, 'utf8');
};
/**
 * Encrypts raw text using AES-256-GCM
 */
function encrypt(text) {
    const iv = crypto.randomBytes(12); // 12 bytes IV is standard for GCM
    const key = getValidKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return {
        encryptedText: `${authTag}:${encrypted}`,
        iv: iv.toString('hex')
    };
}
/**
 * Decrypts encrypted text using AES-256-GCM and its IV
 */
function decrypt(encryptedTextWithTag, ivHex) {
    const [authTagHex, encryptedHex] = encryptedTextWithTag.split(':');
    if (!authTagHex || !encryptedHex) {
        throw new Error('Invalid encrypted text format.');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = getValidKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
