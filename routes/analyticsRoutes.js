const express = require('express');
const router = express.Router();
const { authenticate } = require('./authMiddleware');
const { getSystemStatistics } = require('../services/statisticsService');

// GET /api/analytics - Get comprehensive placement statistics & reports
router.get('/', authenticate, (req, res) => {
  const user = req.user;
  const courseFilter = (user.role === 'coordinator' && user.courseScope) ? user.courseScope : (req.query.course || null);

  const stats = getSystemStatistics(courseFilter);

  return res.json({
    courseScopeApplied: courseFilter,
    stats
  });
});

module.exports = router;
