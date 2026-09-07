import React from 'react';
import type { TBalanceTransactionItem } from 'librechat-data-provider';
import type { LocalizeFunction } from '~/common';
import type { TranslationKeys } from '~/hooks';
import { useGetBalanceTransactions } from '~/data-provider';
import { useLocalize } from '~/hooks';

const CONTEXT_KEYS: Record<string, TranslationKeys> = {
  message: 'com_nav_balance_transaction_context_message',
  title: 'com_nav_balance_transaction_context_title',
  autoRefill: 'com_nav_balance_transaction_context_autoRefill',
  admin: 'com_nav_balance_transaction_context_admin',
  reasoning: 'com_nav_balance_transaction_context_reasoning',
  incomplete: 'com_nav_balance_transaction_context_incomplete',
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

const getContextLabel = (context: string | undefined, localize: LocalizeFunction): string => {
  if (!context) return '—';
  const key = CONTEXT_KEYS[context];
  return key ? localize(key) : context;
};

const TransactionRow: React.FC<{
  tx: TBalanceTransactionItem;
  localize: LocalizeFunction;
}> = ({ tx, localize }) => {
  const amount = tx.rawAmount ?? tx.tokenValue ?? 0;
  const isCredit = amount > 0;
  const label = getContextLabel(tx.context, localize);
  const amountLabel = isCredit
    ? localize('com_nav_balance_transaction_credits_added')
    : localize('com_nav_balance_transaction_credits_spent');

  return (
    <div
      className="border-border-subtle flex items-center justify-between border-b py-2 text-sm last:border-b-0"
      role="row"
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-text-primary">{label}</span>
        <span className="text-token-text-secondary text-xs">
          {formatDate(tx.createdAt)}
          {tx.model ? ` · ${tx.model}` : ''}
        </span>
      </div>
      <span
        className={`shrink-0 font-medium ${isCredit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
        aria-label={amountLabel}
      >
        {isCredit ? '+' : ''}
        {Math.abs(amount).toLocaleString()}
      </span>
    </div>
  );
};

const TransactionHistory: React.FC = () => {
  const localize = useLocalize();
  const { data, isLoading, isError } = useGetBalanceTransactions({ limit: 50 });

  if (isLoading) {
    return (
      <div className="text-token-text-secondary py-4 text-center text-sm" role="status">
        {localize('com_nav_balance_transaction_loading')}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-4 text-center text-sm text-red-600 dark:text-red-400" role="alert">
        {localize('com_nav_balance_transaction_error')}
      </div>
    );
  }

  const transactions = data?.transactions ?? [];

  if (transactions.length === 0) {
    return (
      <div className="text-token-text-secondary py-4 text-center text-sm" role="status">
        {localize('com_nav_balance_transaction_no_transactions')}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col"
      role="table"
      aria-label={localize('com_nav_balance_transaction_history')}
    >
      <h3 className="mb-2 text-sm font-medium text-text-primary">
        {localize('com_nav_balance_transaction_history')}
      </h3>
      <div className="border-border-subtle max-h-64 overflow-y-auto rounded-md border p-2">
        {transactions.map((tx) => (
          <TransactionRow key={tx._id} tx={tx} localize={localize} />
        ))}
      </div>
    </div>
  );
};

export default React.memo(TransactionHistory);
