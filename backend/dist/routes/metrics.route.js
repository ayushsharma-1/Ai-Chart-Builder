"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const semanticMetrics_1 = require("../utils/semanticMetrics");
const router = (0, express_1.Router)();
router.get('/', (_req, res) => {
    res.json({ success: true, metrics: semanticMetrics_1.SEMANTIC_METRICS });
});
exports.default = router;
