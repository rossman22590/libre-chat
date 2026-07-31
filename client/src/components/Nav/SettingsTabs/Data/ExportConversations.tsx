import { useCallback } from 'react';
import { Upload } from 'lucide-react';
import { Spinner, Label, Button } from '@librechat/client';
import { useLocalize, useExportJson } from '~/hooks';

function ExportConversations() {
  const localize = useLocalize();
  const { isExporting, exportAllConversationsJson } = useExportJson();

  const handleExportClick = useCallback(() => {
    exportAllConversationsJson();
  }, [exportAllConversationsJson]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleExportClick();
      }
    },
    [handleExportClick],
  );

  return (
    <div className="flex items-center justify-between">
      <Label id="export-conversations-label">{localize('com_ui_export_conversations_info')}</Label>
      <Button
        variant="outline"
        onClick={handleExportClick}
        onKeyDown={handleKeyDown}
        disabled={isExporting}
        aria-labelledby="export-conversations-label"
      >
        {isExporting ? (
          <>
            <Spinner className="mr-1 w-4" />
            <span>{localize('com_ui_exporting')}</span>
          </>
        ) : (
          <>
            <Upload className="mr-1 flex h-4 w-4 items-center stroke-1" aria-hidden="true" />
            <span>{localize('com_nav_export')}</span>
          </>
        )}
      </Button>
    </div>
  );
}

export default ExportConversations;
