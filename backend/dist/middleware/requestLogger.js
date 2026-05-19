"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
function requestLogger(req, res, next) {
    const startedAt = Date.now();
    const { method, originalUrl } = req;
    res.on('finish', () => {
        const duration = Date.now() - startedAt;
        console.log(`${method} ${originalUrl} ${res.statusCode} ${duration}ms`);
    });
    next();
}
