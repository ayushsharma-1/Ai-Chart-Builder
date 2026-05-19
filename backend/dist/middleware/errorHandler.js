"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, _req, res, _next) {
    console.error('Unhandled error:', err?.message || err);
    res.status(500).json({
        success: false,
        message: 'An unexpected error occurred.',
    });
}
