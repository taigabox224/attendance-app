import jwt from 'jsonwebtoken';
function getSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error('JWT_SECRET is not set');
    return secret;
}
export function signToken(payload) {
    const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d';
    return jwt.sign(payload, getSecret(), { expiresIn });
}
export function verifyToken(token) {
    return jwt.verify(token, getSecret());
}
export const COOKIE_NAME = 'auth_token';
export const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 秒単位 (RFC 6265 の Max-Age)
    path: '/',
};
export function signCheckinToken(payload, expiresIn = '24h') {
    return jwt.sign({ ...payload, kind: 'checkin' }, getSecret(), { expiresIn });
}
export function verifyCheckinToken(token) {
    const decoded = jwt.verify(token, getSecret());
    if (decoded.kind !== 'checkin' || !decoded.event_id || !decoded.attendee_id) {
        throw new Error('Invalid checkin token payload');
    }
    return decoded;
}
//# sourceMappingURL=jwt.js.map