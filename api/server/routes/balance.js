const express = require('express');
const { createSetBalanceConfig } = require('@librechat/api');
const router = express.Router();
const controller = require('../controllers/Balance');
const { requireJwtAuth } = require('../middleware/');
const { getAppConfig } = require('~/server/services/Config');
const { Balance } = require('~/db/models');

const setBalanceConfig = createSetBalanceConfig({ getAppConfig, Balance });

router.get('/', requireJwtAuth, setBalanceConfig, controller);

module.exports = router;
