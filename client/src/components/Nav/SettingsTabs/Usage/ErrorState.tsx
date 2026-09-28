import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';

export default function ErrorState({ onRetry }: { onRetry: () => void }) {
  const localize = useLocalize();
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg bg-status-error-subtle px-3 py-2.5 text-sm text-status-error"
      role="alert"
    >
      <span>{localize('com_nav_usage_error')}</span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        {localize('com_ui_retry')}
      </Button>
    </div>
  );
}
