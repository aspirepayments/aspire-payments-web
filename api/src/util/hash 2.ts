import crypto from 'crypto';

export function sha256hex(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function hmacHexSHA512(keyHex: string, data: string) {
  const key = Buffer.from(keyHex, 'hex');
  return crypto.createHmac('sha512', key).update(data, 'utf8').digest('hex');
}
