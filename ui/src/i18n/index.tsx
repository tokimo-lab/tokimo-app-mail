import { createContext, type ReactNode, useContext } from "react";

export type TranslationValue = string | string[];
export type TranslationMap = Record<string, TranslationValue>;
export type TranslationOptions = Record<string, unknown> & {
  returnObjects?: boolean;
};

const en: TranslationMap = {
  "mail.app.title": "Mail",
  "mail.app.selectFolder": "Select a folder",
  "mail.app.selectMessage": "Select a message",
  "mail.app.selectFolderFirst": "Select a folder first",
  "mail.sidebar.loading": "Loading…",
  "mail.sidebar.folders": "Folders",
  "mail.sidebar.compose": "Compose",
  "mail.sidebar.addAccount": "Add account",
  "mail.sidebar.collapseSidebar": "Collapse sidebar",
  "mail.sidebar.expandSidebar": "Expand sidebar",
  "mail.list.search": "Search mail…",
  "mail.list.noResults": "No results for {{query}}",
  "mail.list.noMessages": "No messages",
  "mail.list.resultsCount": "{{count}} results",
  "mail.list.messagesCount": "{{count}} messages",
  "mail.list.unknownSender": "Unknown sender",
  "mail.list.noSubject": "(No subject)",
  "mail.viewer.back": "Back",
  "mail.viewer.reply": "Reply",
  "mail.viewer.forward": "Forward",
  "mail.viewer.delete": "Delete",
  "mail.viewer.confirmDeleteTitle": "Delete message?",
  "mail.viewer.confirmDeleteContent":
    "This message will be deleted from the mailbox.",
  "mail.viewer.deleteSuccess": "Message deleted",
  "mail.viewer.deleteFailed": "Failed to delete message: {{error}}",
  "mail.viewer.messageNotFound": "Message not found",
  "mail.viewer.noSubject": "(No subject)",
  "mail.viewer.from": "From",
  "mail.viewer.to": "To",
  "mail.viewer.cc": "Cc",
  "mail.viewer.date": "Date",
  "mail.viewer.noContent": "No body content",
  "mail.viewer.retryFetch": "Fetch body again",
  "mail.composer.newMessage": "New message",
  "mail.composer.reply": "Reply",
  "mail.composer.forward": "Forward",
  "mail.composer.from": "From",
  "mail.composer.to": "To",
  "mail.composer.toPlaceholder": "name@example.com, another@example.com",
  "mail.composer.cc": "Cc",
  "mail.composer.ccPlaceholder": "Cc recipients",
  "mail.composer.bcc": "Bcc",
  "mail.composer.bccPlaceholder": "Bcc recipients",
  "mail.composer.subject": "Subject",
  "mail.composer.subjectPlaceholder": "Subject",
  "mail.composer.bodyPlaceholder": "Write your message…",
  "mail.composer.send": "Send",
  "mail.composer.addAttachment": "Add attachment",
  "mail.composer.removeAttachment": "Remove attachment",
  "mail.composer.messageSent": "Message sent",
  "mail.composer.sendFailed": "Failed to send: {{error}}",
  "mail.composer.recipientRequired": "At least one recipient is required",
  "mail.composer.attachmentTooLarge": "{{name}} is larger than 25 MB",
  "mail.composer.attachmentsTooLarge": "Attachments exceed 50 MB total",
  "mail.composer.subjectForwardPrefix": "Fwd:",
  "mail.composer.forwardSeparator": "---------- Forwarded message ---------",
  "mail.composer.subjectReplyPrefix": "Re:",
  "mail.composer.replyQuotedHeader": "On {{date}}, {{from}} wrote:",
  "mail.setup.addAccount": "Add mail account",
  "mail.setup.cancel": "Cancel",
  "mail.setup.provider": "Provider",
  "mail.setup.credentials": "Credentials",
  "mail.setup.setupProvider": "Set up {{provider}}",
  "mail.setup.manualConfig": "Manual configuration",
  "mail.setup.otherCustom": "Other / Custom",
  "mail.setup.manualImapSmtp": "Use custom IMAP and SMTP servers",
  "mail.setup.setupInstructions": "Setup instructions",
  "mail.setup.openAppPasswordPage": "Open {{provider}} app password page",
  "mail.setup.emailAddress": "Email address",
  "mail.setup.emailRequired": "Email is required",
  "mail.setup.emailInvalid": "Enter a valid email address",
  "mail.setup.emailPlaceholder": "you@example.com",
  "mail.setup.displayName": "Display name",
  "mail.setup.displayNamePlaceholder": "Shown to recipients",
  "mail.setup.appPassword": "App password",
  "mail.setup.password": "Password",
  "mail.setup.passwordRequired": "Password is required",
  "mail.setup.appPasswordPlaceholder": "Paste app password",
  "mail.setup.passwordPlaceholder": "Password",
  "mail.setup.imapSettings": "IMAP settings",
  "mail.setup.smtpSettings": "SMTP settings",
  "mail.setup.useSeparateSmtp": "Use separate SMTP credentials",
  "mail.setup.smtpUsername": "SMTP username",
  "mail.setup.smtpUsernamePlaceholder": "SMTP username",
  "mail.setup.smtpPassword": "SMTP password",
  "mail.setup.smtpPasswordPlaceholder": "SMTP password",
  "mail.setup.retry": "Retry",
  "mail.setup.addAccountBtn": "Add account",
  "mail.setup.createFailed": "Failed to create account: {{error}}",
  "mail.account.editAccount": "Edit account",
  "mail.account.deleteAccount": "Delete account",
  "mail.account.confirmDelete": "Delete {{email}}? This cannot be undone.",
  "mail.account.deleteSuccess": "Account deleted",
  "mail.account.deleteFailed": "Failed to delete account: {{error}}",
  "mail.account.editTitle": "Edit account",
  "mail.account.save": "Save",
  "mail.account.saveSuccess": "Account saved",
  "mail.account.saveFailed": "Failed to save account: {{error}}",
  "mail.account.changePassword": "Change password",
  "mail.account.newPassword": "New password",
  "mail.account.newPasswordPlaceholder": "Enter new password",
  "common.setupGuide.getStarted": "Set up {{name}}",
  "common.setupGuide.mailTagline":
    "Connect an IMAP/SMTP account to read and send mail in Tokimo.",
  "common.setupGuide.mailAction": "Add account",
  "common.setupGuide.mailFeatures": [
    "Sync folders and messages",
    "Read mail with attachments",
    "Compose replies and forwards",
  ],
};

const zh: TranslationMap = {
  ...en,
  "mail.app.title": "邮件",
  "mail.app.selectFolder": "选择文件夹",
  "mail.app.selectMessage": "选择一封邮件",
  "mail.app.selectFolderFirst": "请先选择文件夹",
  "mail.sidebar.loading": "加载中…",
  "mail.sidebar.folders": "文件夹",
  "mail.sidebar.compose": "写邮件",
  "mail.sidebar.addAccount": "添加账户",
  "mail.list.search": "搜索邮件…",
  "mail.list.noResults": "没有找到 {{query}} 的结果",
  "mail.list.noMessages": "暂无邮件",
  "mail.viewer.reply": "回复",
  "mail.viewer.forward": "转发",
  "mail.viewer.delete": "删除",
  "mail.composer.newMessage": "新邮件",
  "mail.composer.send": "发送",
  "mail.setup.addAccount": "添加邮件账户",
  "mail.setup.cancel": "取消",
  "mail.account.editAccount": "编辑账户",
  "mail.account.deleteAccount": "删除账户",
  "common.setupGuide.getStarted": "设置 {{name}}",
  "common.setupGuide.mailTagline":
    "连接 IMAP/SMTP 账户，在 Tokimo 中收发邮件。",
  "common.setupGuide.mailAction": "添加账户",
  "common.setupGuide.mailFeatures": [
    "同步文件夹和邮件",
    "阅读邮件和附件",
    "撰写回复与转发",
  ],
};

export const enUS = en;
export const zhCN = zh;
export const translations = { "en-US": enUS, "zh-CN": zhCN };

function flattenTranslations(
  map: Record<string, TranslationMap>,
): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(map).map(([locale, dict]) => [
      locale,
      Object.fromEntries(
        Object.entries(dict).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join("\n") : value,
        ]),
      ),
    ]),
  );
}

export const appTranslations = flattenTranslations(translations);

function interpolate(text: string, options?: TranslationOptions): string {
  if (!options) return text;
  return text.replace(/{{\s*([^}]+)\s*}}/g, (_match, key: string) => {
    const value = options[key.trim()];
    return value == null ? "" : String(value);
  });
}

export type TFunction = {
  (
    key: string,
    options: TranslationOptions & { returnObjects: true },
  ): string[];
  (key: string, options?: TranslationOptions): string;
};

function makeT(locale: string): TFunction {
  const normalized = locale.startsWith("zh") ? "zh-CN" : "en-US";
  const dict = translations[normalized];
  return ((key: string, options?: TranslationOptions) => {
    const value = dict[key] ?? enUS[key] ?? key;
    if (Array.isArray(value)) {
      return options?.returnObjects ? value : value.join(", ");
    }
    return interpolate(value, options);
  }) as TFunction;
}

const TranslationContext = createContext<TFunction>(makeT("en-US"));

export function TranslationProvider({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  return (
    <TranslationContext.Provider value={makeT(locale)}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation(): { t: TFunction } {
  return { t: useContext(TranslationContext) };
}
