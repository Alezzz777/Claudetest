const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function sign(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
        SECRET,
        { expiresIn: '12h' }
    );
}

function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    try {
        req.user = jwt.verify(header.slice(7), SECRET);
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Недействительный токен' });
    }
}

function requireRole(...allowed) {
    return (req, res, next) => {
        if (!req.user || !allowed.includes(req.user.role)) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }
        next();
    };
}

module.exports = { sign, authenticate, requireRole, SECRET };
