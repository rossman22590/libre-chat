const express = require('express');
const mongoose = require('mongoose');
const {
  GenerationJobManager,
  openCheckpointDeletion,
  deleteAllSharedLinksWithCleanup,
  createErasureResolver,
  createAdminUsersHandlers,
  createGrantUsageResetsHandler,
  revokeUserCodeEnvironmentWorkers,
  createGrantAllUsageResetsHandler,
} = require('@librechat/api');
const { SystemCapabilities, runAsSystem, tenantStorage } = require('@librechat/data-schemas');
const adminUsersController = require('~/server/controllers/admin/users');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const {
  drainAgentTriggerDeliveriesForUser,
  prepareAgentTriggerUserPurge,
  cancelAgentTriggerUserPurge,
  purgeAgentTriggerDeliveriesForUser,
} = require('~/server/services/Agents/triggers');
const { processDeleteRequest } = require('~/server/services/Files/process');
const { invalidateCachedTools } = require('~/server/services/Config/getCachedTools');
const { getMCPManager, getMCPServersRegistry } = require('~/config');
const { maybeUninstallOAuthMCP } = require('~/server/services/MCP/oauthCleanup');
const subagentThreadTaskStore = require('~/server/services/Endpoints/agents/subagentThreadStore');
const {
  quiesceUserSchedules,
  restoreUserSchedulesFromDeletion,
} = require('~/server/services/Schedules');
const db = require('~/models');
const {
  getAppConfig,
  invalidateConfigCaches,
  invalidateCodeEnvironmentConfigCache,
} = require('~/server/services/Config');

const router = express.Router();

const resolveErasure = createErasureResolver({
  withTenant: (tenantId, operation) =>
    tenantId ? tenantStorage.run({ tenantId }, operation) : runAsSystem(operation),
  db,
  getAppConfig,
  getMCPManager,
  processDeleteRequest,
  invalidateCachedTools,
  mcpOAuth: {
    getRegistry: getMCPServersRegistry,
    getUserPrincipals: db.getUserPrincipals,
    uninstallOAuthMCP: maybeUninstallOAuthMCP,
  },
  openCheckpointDeletion,
  deleteSharedLinks: (userId) => deleteAllSharedLinksWithCleanup(userId, { awaitCleanup: true }),
});

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadUsers = requireCapability(SystemCapabilities.READ_USERS);
const requireManageUsers = requireCapability(SystemCapabilities.MANAGE_USERS);

const handlers = createAdminUsersHandlers({
  findUsers: db.findUsers,
  countUsers: db.countUsers,
  beginAgentTriggerUserDeletion: db.beginAgentTriggerUserDeletion,
  cancelAgentTriggerUserDeletion: db.cancelAgentTriggerUserDeletion,
  drainAgentTriggerDeliveriesForUser,
  prepareAgentTriggerUserPurge,
  cancelAgentTriggerUserPurge,
  purgeAgentTriggerDeliveriesForUser,
  revokeUserCodeEnvironmentWorkers: async (userId) =>
    revokeUserCodeEnvironmentWorkers({
      mongoose,
      userId,
      appConfig: await getAppConfig({ baseOnly: true }),
    }),
  deleteUserById: db.deleteUserById,
  deleteUserCodeEnvironments: db.deleteUserCodeEnvironments,
  invalidateCodeEnvironmentConfigCache,
  deleteConfig: db.deleteConfig,
  invalidateConfigCaches,
  deleteAclEntries: db.deleteAclEntries,
  deletePasskeysByUser: db.deletePasskeysByUser,
  resolveErasure,
  cancelSubagentTasks: (userId, tenantId) =>
    subagentThreadTaskStore.cancelAndDrainForOwner(userId, tenantId),
  quiesceUserSchedules,
  restoreUserSchedulesFromDeletion,
  generationJobs: GenerationJobManager,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/stats', requireReadUsers, adminUsersController.getStats);
router.get('/', requireReadUsers, adminUsersController.listUsers);
router.get('/search', requireReadUsers, handlers.searchUsers);
router.post('/balance/set-all', requireManageUsers, adminUsersController.setAllUsersBalance);
router.post(
  '/resets/grant-all',
  requireManageUsers,
  createGrantAllUsageResetsHandler({ grantUsageResetsToAll: db.grantUsageResetsToAll }),
);
router.put('/:userId/balance', requireManageUsers, adminUsersController.setUserBalance);
router.post('/:userId/balance/add', requireManageUsers, adminUsersController.addUserBalance);
router.post(
  '/:userId/resets',
  requireManageUsers,
  createGrantUsageResetsHandler({ grantUsageResets: db.grantUsageResets }),
);
router.post('/:userId/ban', requireManageUsers, adminUsersController.banUser);
router.delete('/:userId/ban', requireManageUsers, adminUsersController.unbanUser);
router.delete('/:userId', requireManageUsers, adminUsersController.deleteUser);
router.get('/:userId/conversations', requireReadUsers, adminUsersController.getUserConversations);
router.get(
  '/:userId/conversations/:conversationId/messages',
  requireReadUsers,
  adminUsersController.getConversationMessages,
);
router.get('/:userId/transactions', requireReadUsers, adminUsersController.getUserTransactions);

module.exports = router;
