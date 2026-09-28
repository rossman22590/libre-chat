import { Types } from 'mongoose';
import type {
  TUsageGrant,
  TUsageSummary,
  TUsageChatStat,
  TUsageModelStat,
  TUsageSeriesPoint,
  TUsageActivityKind,
  TUsageActivityItem,
  TUsageActivityResponse,
} from 'librechat-data-provider';
import type { FilterQuery, Model } from 'mongoose';
import type { ITransaction } from '~/schema/transaction';
import type { IConversation } from '~/types';

const SPEND_TYPES = ['prompt', 'completion'];
const TOP_MODELS = 20;
const TOP_CHATS = 5;
const MAX_ACTIVITY_ROWS = 600;
const ROWS_PER_ITEM = 6;

type ActivityRow = Pick<
  ITransaction,
  | 'tokenType'
  | 'context'
  | 'model'
  | 'conversationId'
  | 'messageId'
  | 'rawAmount'
  | 'tokenValue'
  | 'readTokens'
  | 'writeTokens'
> & { _id: Types.ObjectId; createdAt: Date };

type SpendGroup = {
  spentCredits: number;
  inputCredits: number;
  outputCredits: number;
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
};

type SummaryFacets = {
  totals: (SpendGroup & { conversationCount: number })[];
  grants: { _id: string | null; credits: number; count: number }[];
  series: { _id: string; spentCredits: number; addedCredits: number }[];
  models: (SpendGroup & { _id: string | null; lastUsedAt: Date })[];
  chats: {
    _id: string;
    spentCredits: number;
    messageCount: number;
    topModel: string | null;
    lastActiveAt: Date;
  }[];
};

/**
 * Credits actually moved: grants use `rawAmount` (an auto-refill's `tokenValue` carries a rate
 * multiplier), spend uses `tokenValue`.
 */
const amountExpr = {
  $cond: [
    { $eq: ['$tokenType', 'credits'] },
    { $ifNull: ['$rawAmount', 0] },
    { $ifNull: ['$tokenValue', 0] },
  ],
};
const spentExpr = { $max: [0, { $multiply: ['$amount', -1] }] };
const isPrompt = { $eq: ['$tokenType', 'prompt'] };
const isCompletion = { $eq: ['$tokenType', 'completion'] };
const distinctCount = (set: string | object) => ({
  $size: { $setDifference: [set, [null, '']] },
});

const spendGroupFields = {
  spentCredits: { $sum: spentExpr },
  inputCredits: { $sum: { $cond: [isPrompt, spentExpr, 0] } },
  outputCredits: { $sum: { $cond: [isCompletion, spentExpr, 0] } },
  inputTokens: { $sum: { $cond: [isPrompt, '$tokens', 0] } },
  outputTokens: { $sum: { $cond: [isCompletion, '$tokens', 0] } },
  messageIds: { $addToSet: '$messageId' },
};

const spendProjection = {
  spentCredits: 1,
  inputCredits: 1,
  outputCredits: 1,
  inputTokens: 1,
  outputTokens: 1,
  messageCount: distinctCount('$messageIds'),
};

function toModelStat(row: SummaryFacets['models'][number]): TUsageModelStat {
  return {
    model: row._id ?? 'unknown',
    spentCredits: row.spentCredits,
    inputCredits: row.inputCredits,
    outputCredits: row.outputCredits,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    messageCount: row.messageCount,
    lastUsedAt: row.lastUsedAt.toISOString(),
  };
}

function rowAmount(row: ActivityRow): number {
  return row.tokenType === 'credits' ? (row.rawAmount ?? 0) : (row.tokenValue ?? 0);
}

function createActivityItem(row: ActivityRow): TUsageActivityItem {
  return {
    id: row.messageId ?? row._id.toString(),
    type: row.tokenType === 'credits' ? 'credit' : 'chat',
    context: row.context,
    conversationId: row.conversationId,
    models: [],
    createdAt: row.createdAt.toISOString(),
    spentCredits: 0,
    addedCredits: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
  };
}

function applyRow(item: TUsageActivityItem, row: ActivityRow): void {
  const amount = rowAmount(row);
  const tokens = Math.abs(row.rawAmount ?? 0);
  item.spentCredits += Math.max(0, -amount);
  item.addedCredits += Math.max(0, amount);
  if (row.tokenType === 'prompt') {
    item.inputTokens += tokens;
    item.cachedTokens += Math.abs(row.readTokens ?? 0) + Math.abs(row.writeTokens ?? 0);
  } else if (row.tokenType === 'completion') {
    item.outputTokens += tokens;
  }
  if (row.model && !item.models.includes(row.model)) {
    item.models.push(row.model);
  }
  if (row.context === 'message') {
    item.context = row.context;
  }
}

/** Merges each message's transactions into one item, preserving newest-first order. */
function groupActivity(rows: ActivityRow[]): TUsageActivityItem[] {
  const items = new Map<string, TUsageActivityItem>();
  for (const row of rows) {
    const key =
      row.tokenType !== 'credits' && row.messageId ? `m:${row.messageId}` : `t:${row._id}`;
    let item = items.get(key);
    if (!item) {
      item = createActivityItem(row);
      items.set(key, item);
    }
    applyRow(item, row);
  }
  return [...items.values()];
}

export function createUsageMethods(mongoose: typeof import('mongoose')) {
  async function findTitles(user: string, conversationIds: string[]): Promise<Map<string, string>> {
    if (conversationIds.length === 0) {
      return new Map();
    }
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const convos = await Conversation.find(
      { user, conversationId: { $in: conversationIds } },
      'conversationId title',
    ).lean<Pick<IConversation, 'conversationId' | 'title'>[]>();
    return new Map(convos.map((c) => [c.conversationId, c.title ?? '']));
  }

  /**
   * Spend, grants, a time series, per-model and top-conversation stats for one user since
   * `since`, in a single aggregation. `timezone` is an IANA name used to bucket the series.
   */
  async function getUsageSummary({
    user,
    since,
    timezone,
    granularity,
  }: {
    user: string;
    since: Date;
    timezone: string;
    granularity: 'hour' | 'day';
  }): Promise<TUsageSummary> {
    const Transaction = mongoose.models.Transaction as Model<ITransaction>;
    const spendOnly = { $match: { tokenType: { $in: SPEND_TYPES } } };
    const [facets] = await Transaction.aggregate<SummaryFacets>([
      { $match: { user: new Types.ObjectId(user), createdAt: { $gte: since } } },
      {
        $project: {
          tokenType: 1,
          model: 1,
          context: 1,
          conversationId: 1,
          messageId: 1,
          createdAt: 1,
          amount: amountExpr,
          tokens: { $abs: { $ifNull: ['$rawAmount', 0] } },
        },
      },
      {
        $facet: {
          totals: [
            spendOnly,
            {
              $group: {
                _id: null,
                ...spendGroupFields,
                conversationIds: { $addToSet: '$conversationId' },
              },
            },
            {
              $project: {
                ...spendProjection,
                conversationCount: distinctCount('$conversationIds'),
              },
            },
          ],
          grants: [
            { $match: { tokenType: 'credits', amount: { $gt: 0 } } },
            { $group: { _id: '$context', credits: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { credits: -1 } },
          ],
          series: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    date: '$createdAt',
                    format: granularity === 'hour' ? '%Y-%m-%dT%H' : '%Y-%m-%d',
                    timezone,
                  },
                },
                spentCredits: { $sum: spentExpr },
                addedCredits: {
                  $sum: {
                    $cond: [{ $eq: ['$tokenType', 'credits'] }, { $max: [0, '$amount'] }, 0],
                  },
                },
              },
            },
            { $sort: { _id: 1 } },
          ],
          models: [
            spendOnly,
            { $group: { _id: '$model', ...spendGroupFields, lastUsedAt: { $max: '$createdAt' } } },
            { $project: { ...spendProjection, lastUsedAt: 1 } },
            { $sort: { spentCredits: -1 } },
            { $limit: TOP_MODELS },
          ],
          chats: [
            spendOnly,
            { $match: { conversationId: { $type: 'string', $nin: ['', 'new'] } } },
            {
              $group: {
                _id: { conversationId: '$conversationId', model: '$model' },
                spentCredits: { $sum: spentExpr },
                messageIds: { $addToSet: '$messageId' },
                lastActiveAt: { $max: '$createdAt' },
              },
            },
            { $sort: { spentCredits: -1 } },
            {
              $group: {
                _id: '$_id.conversationId',
                spentCredits: { $sum: '$spentCredits' },
                topModel: { $first: '$_id.model' },
                messageIdSets: { $push: '$messageIds' },
                lastActiveAt: { $max: '$lastActiveAt' },
              },
            },
            { $sort: { spentCredits: -1 } },
            { $limit: TOP_CHATS },
            {
              $project: {
                spentCredits: 1,
                topModel: 1,
                lastActiveAt: 1,
                messageCount: distinctCount({
                  $reduce: {
                    input: '$messageIdSets',
                    initialValue: [],
                    in: { $setUnion: ['$$value', '$$this'] },
                  },
                }),
              },
            },
          ],
        },
      },
    ]);

    const titles = await findTitles(
      user,
      facets.chats.map((c) => c._id),
    );
    const totals = facets.totals[0];
    const grants = facets.grants.map(
      (g): TUsageGrant => ({ context: g._id ?? 'other', credits: g.credits, count: g.count }),
    );

    return {
      totals: {
        spentCredits: totals?.spentCredits ?? 0,
        addedCredits: grants.reduce((sum, g) => sum + g.credits, 0),
        inputTokens: totals?.inputTokens ?? 0,
        outputTokens: totals?.outputTokens ?? 0,
        messageCount: totals?.messageCount ?? 0,
        conversationCount: totals?.conversationCount ?? 0,
      },
      grants,
      series: facets.series.map(
        (p): TUsageSeriesPoint => ({
          bucket: p._id,
          spentCredits: p.spentCredits,
          addedCredits: p.addedCredits,
        }),
      ),
      models: facets.models.map(toModelStat),
      chats: facets.chats.map(
        (c): TUsageChatStat => ({
          conversationId: c._id,
          title: titles.get(c._id) || undefined,
          spentCredits: c.spentCredits,
          messageCount: c.messageCount,
          topModel: c.topModel ?? undefined,
          lastActiveAt: c.lastActiveAt.toISOString(),
        }),
      ),
    };
  }

  /**
   * Newest-first ledger with each message's transactions merged into one item.
   * `nextCursor` is an ISO timestamp to pass back as `before`.
   */
  async function getUsageActivity({
    user,
    kind,
    before,
    limit,
  }: {
    user: string;
    kind: TUsageActivityKind;
    before?: Date;
    limit: number;
  }): Promise<TUsageActivityResponse> {
    const Transaction = mongoose.models.Transaction as Model<ITransaction>;
    const filter: FilterQuery<ITransaction> = { user };
    if (before) {
      filter.createdAt = { $lt: before };
    }
    if (kind === 'spent') {
      filter.tokenType = { $in: SPEND_TYPES };
    } else if (kind === 'added') {
      filter.tokenType = 'credits';
    }

    const rowLimit = Math.min(limit * ROWS_PER_ITEM, MAX_ACTIVITY_ROWS);
    const rows = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(rowLimit)
      .select(
        'tokenType context model conversationId messageId rawAmount tokenValue readTokens writeTokens createdAt',
      )
      .lean<ActivityRow[]>();

    const grouped = groupActivity(rows);
    const truncated = rows.length === rowLimit;
    const complete = truncated && grouped.length > 1 ? grouped.slice(0, -1) : grouped;
    const items = complete.slice(0, limit);
    const hasMore = truncated || complete.length > limit;

    const conversationIds = [
      ...new Set(items.flatMap((i) => (i.conversationId ? [i.conversationId] : []))),
    ];
    const titles = await findTitles(user, conversationIds);
    const withTitles = items.map((item) => {
      const title = item.conversationId ? titles.get(item.conversationId) : undefined;
      return title ? { ...item, title } : item;
    });

    const oldest = withTitles.reduce<string | null>(
      (min, i) => (min == null || i.createdAt < min ? i.createdAt : min),
      null,
    );
    return { items: withTitles, nextCursor: hasMore ? oldest : null };
  }

  return { getUsageSummary, getUsageActivity };
}

export type UsageMethods = ReturnType<typeof createUsageMethods>;
