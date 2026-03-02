const express = require('express');
const middleware = require('~/server/middleware');
const adminUsersController = require('~/server/controllers/admin/users');

const router = express.Router();

router.get('/users', middleware.requireJwtAuth, middleware.checkAdmin, adminUsersController.listUsers);
router.put(
  '/users/:userId/balance',
  middleware.requireJwtAuth,
  middleware.checkAdmin,
  adminUsersController.setUserBalance,
);
router.post(
  '/users/:userId/ban',
  middleware.requireJwtAuth,
  middleware.checkAdmin,
  adminUsersController.banUser,
);
router.delete(
  '/users/:userId/ban',
  middleware.requireJwtAuth,
  middleware.checkAdmin,
  adminUsersController.unbanUser,
);

module.exports = router;
