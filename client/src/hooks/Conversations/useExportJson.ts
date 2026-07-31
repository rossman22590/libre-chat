import { useState, useCallback } from 'react';
import download from 'downloadjs';
import filenamify from 'filenamify';
import { useToastContext } from '@librechat/client';
import { dataService } from 'librechat-data-provider';
import type { TConversationExport } from 'librechat-data-provider';
import { NotificationSeverity } from '~/common';
import useLocalize from '~/hooks/useLocalize';
import { logger } from '~/utils';

const downloadJson = (data: TConversationExport | TConversationExport[], filename: string) => {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json;charset=utf-8' });
  download(blob, `${filename}.json`, 'application/json');
};

const datedFilename = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10)}`;

/**
 * Downloads conversations as re-importable LibreChat JSON, either a single
 * conversation or every conversation belonging to the current user.
 */
export default function useExportJson() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isExporting, setIsExporting] = useState(false);

  const exportConversationJson = useCallback(
    async (conversationId: string, title?: string | null) => {
      if (!conversationId) {
        return;
      }
      setIsExporting(true);
      try {
        const conversation = await dataService.exportConversationById(conversationId);
        const name = String(title ?? conversation.title ?? 'conversation');
        downloadJson(conversation, filenamify(name));
      } catch (error) {
        logger.error('Export error:', error);
        showToast({
          message: localize('com_ui_export_conversation_error'),
          status: NotificationSeverity.ERROR,
        });
      } finally {
        setIsExporting(false);
      }
    },
    [localize, showToast],
  );

  const exportAllConversationsJson = useCallback(async () => {
    setIsExporting(true);
    try {
      const conversations = await dataService.exportAllConversations();
      if (!conversations.length) {
        showToast({
          message: localize('com_ui_export_conversations_empty'),
          status: NotificationSeverity.WARNING,
        });
        return;
      }
      downloadJson(conversations, datedFilename('multibot-conversations'));
      showToast({
        message: localize('com_ui_export_conversations_success'),
        status: NotificationSeverity.SUCCESS,
      });
    } catch (error) {
      logger.error('Export error:', error);
      showToast({
        message: localize('com_ui_export_conversations_error'),
        status: NotificationSeverity.ERROR,
      });
    } finally {
      setIsExporting(false);
    }
  }, [localize, showToast]);

  return { isExporting, exportConversationJson, exportAllConversationsJson };
}
