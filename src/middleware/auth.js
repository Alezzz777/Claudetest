const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cargo-transport-secret-key';

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Требуется авторизация' });

  const token = header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Неверный формат токена' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Недействительный токен' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    next();
  };
}

module.exports = { authenticate, authorize, JWT_SECRET };
