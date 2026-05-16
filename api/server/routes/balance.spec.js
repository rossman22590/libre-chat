const mockCreateSetBalanceConfig = jest.fn(() => (req, res, next) => next());
const mockFindBalanceByUser = jest.fn();
const mockUpsertBalanceFields = jest.fn();
const mockGetAppConfig = jest.fn();

jest.mock('@librechat/api', () => ({
  createSetBalanceConfig: (...args) => mockCreateSetBalanceConfig(...args),
}));

jest.mock('../controllers/Balance', () => {
  const controller = jest.fn((req, res) => res.status(200).json({ ok: true }));
  controller.balanceTransactionsController = jest.fn((req, res) => res.status(200).json([]));
  return controller;
});

jest.mock('../middleware/', () => ({
  requireJwtAuth: (req, res, next) => next(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: (...args) => mockGetAppConfig(...args),
}));

jest.mock('~/models', () => ({
  findBalanceByUser: (...args) => mockFindBalanceByUser(...args),
  upsertBalanceFields: (...args) => mockUpsertBalanceFields(...args),
}));

describe('balance routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('wires createSetBalanceConfig with balance method helpers', () => {
    require('./balance');

    expect(mockCreateSetBalanceConfig).toHaveBeenCalledWith({
      getAppConfig: expect.any(Function),
      findBalanceByUser: expect.any(Function),
      upsertBalanceFields: expect.any(Function),
    });
  });
});
