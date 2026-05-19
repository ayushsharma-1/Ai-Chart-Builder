"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const mongo_1 = require("./config/mongo");
const errorHandler_1 = require("./middleware/errorHandler");
const requestLogger_1 = require("./middleware/requestLogger");
const charts_route_1 = __importDefault(require("./routes/charts.route"));
const metrics_route_1 = __importDefault(require("./routes/metrics.route"));
const query_route_1 = __importDefault(require("./routes/query.route"));
const reports_route_1 = __importDefault(require("./routes/reports.route"));
const app = (0, express_1.default)();
const PORT = Number.parseInt(process.env.PORT || '3001', 10);
app.disable('x-powered-by');
app.use((0, cors_1.default)({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express_1.default.json({ limit: '1mb' }));
app.use(requestLogger_1.requestLogger);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/query', query_route_1.default);
app.use('/api/charts', charts_route_1.default);
app.use('/api/reports', reports_route_1.default);
app.use('/api/metrics', metrics_route_1.default);
app.use(errorHandler_1.errorHandler);
async function start() {
    await (0, mongo_1.connectMongo)();
    app.listen(PORT, () => {
        console.log(`Backend running on http://localhost:${PORT}`);
    });
}
start().catch((err) => {
    console.error('Failed to start backend:', err?.message || err);
    process.exit(1);
});
