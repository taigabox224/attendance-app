import crypto from 'node:crypto';
// 紛らわしい文字 (O, 0, I, l, 1) を除外したアルファベット
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export function generateTempPassword(length = 12) {
    const bytes = crypto.randomBytes(length);
    const out = [];
    for (const byte of bytes) {
        out.push(ALPHABET.charAt(byte % ALPHABET.length));
    }
    return out.join('');
}
export function generateToken() {
    return crypto.randomBytes(32).toString('hex'); // 64 文字 hex
}
export function generateUserId() {
    return `u_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}
export function generateEventId() {
    return `e_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}
export function generateAttendeeId() {
    return `a_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}
export function generateListId() {
    return `l_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}
//# sourceMappingURL=tokens.js.map