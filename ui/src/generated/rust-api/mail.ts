import {
  createMutation,
  createPathMutation,
  createQuery,
} from "../../lib/rust-api-runtime";

// ── Output types (mirrors Rust DTOs — will be auto-generated after `make gen:api`) ──

export interface MailProviderPresetOutput {
  provider: string;
  displayName: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: string;
  setupInstructions: string[];
  requiresAppPassword: boolean;
  appPasswordUrl: string | null;
  domains: string[];
}

export interface MailAccountOutput {
  id: string;
  displayName: string;
  email: string;
  provider: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: string;
  senderName: string | null;
  isEnabled: boolean;
  syncInterval: number;
  lastSyncAt: string | null;
  createdAt: string | null;
}

export interface MailFolderOutput {
  id: string;
  accountId: string;
  name: string;
  delimiter: string | null;
  folderType: string;
  totalCount: number;
  unreadCount: number;
  sortOrder: number;
}

export interface MailAddressOutput {
  name: string | null;
  address: string;
}

export interface MailMessageSummaryOutput {
  id: string;
  uid: number;
  messageId: string | null;
  subject: string;
  from: MailAddressOutput[];
  to: MailAddressOutput[];
  date: string | null;
  isRead: boolean;
  isFlagged: boolean;
  hasAttachments: boolean;
  preview: string;
  size: number;
  folderId: string;
}

export interface MailMessageListOutput {
  messages: MailMessageSummaryOutput[];
  total: number;
}

export interface MailAttachmentOutput {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  data: string | null;
}

export interface MailMessageFullOutput {
  id: string;
  uid: number;
  messageId: string | null;
  subject: string;
  from: MailAddressOutput[];
  to: MailAddressOutput[];
  cc: MailAddressOutput[];
  bcc: MailAddressOutput[];
  replyTo: MailAddressOutput[];
  date: string | null;
  isRead: boolean;
  isFlagged: boolean;
  inReplyTo: string | null;
  references: string[];
  textBody: string | null;
  htmlBody: string | null;
  attachments: MailAttachmentOutput[];
  size: number;
  folderId: string;
  accountId: string;
}

// ── Input types ──────────────────────────────────────────────────────────────

export interface CreateAccountInput {
  display_name: string;
  email: string;
  provider?: string;
  imap_host: string;
  imap_port?: number;
  imap_security?: string;
  imap_username: string;
  imap_password: string;
  smtp_host: string;
  smtp_port?: number;
  smtp_security?: string;
  smtp_username: string;
  smtp_password: string;
  sender_name?: string;
  sync_interval?: number;
}

export interface UpdateAccountInput {
  id: string;
  display_name?: string;
  imap_host?: string;
  imap_port?: number;
  imap_security?: string;
  imap_username?: string;
  imap_password?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_security?: string;
  smtp_username?: string;
  smtp_password?: string;
  sender_name?: string;
  is_enabled?: boolean;
  sync_interval?: number;
}

interface ListMessagesInput {
  accountId: string;
  folderId: string;
  page?: number;
  pageSize?: number;
}

export interface SendMessageInput {
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text_body?: string;
  html_body?: string;
  in_reply_to?: string;
  references?: string[];
}

interface BulkMessageIdsInput {
  message_ids: string[];
}

interface MoveMessagesInput {
  message_ids: string[];
  target_folder_id: string;
}

interface SearchInput {
  accountId: string;
  q: string;
  folder_id?: string;
}

// ── API ──────────────────────────────────────────────────────────────────────

export const mailApi = {
  // ── Provider presets ──
  listProviders: createQuery<void, MailProviderPresetOutput[]>({
    path: "/api/apps/mail/providers",
  }),
  detectProvider: createQuery<
    { email: string },
    MailProviderPresetOutput | null
  >({
    path: "/api/apps/mail/providers/detect",
    paramsFn: (input) => ({ email: input.email }),
  }),

  // ── Accounts CRUD ──
  listAccounts: createQuery<void, MailAccountOutput[]>({
    path: "/api/apps/mail/accounts",
  }),
  getAccount: createQuery<{ id: string }, MailAccountOutput>({
    path: "/api/apps/mail/accounts",
    pathFn: (input) => `/api/apps/mail/accounts/${input.id}`,
  }),
  createAccount: createMutation<CreateAccountInput, MailAccountOutput>({
    path: "/api/apps/mail/accounts",
  }),
  updateAccount: createMutation<UpdateAccountInput, MailAccountOutput>({
    method: "PATCH",
    path: "/api/apps/mail/accounts",
    pathFn: (input) => `/api/apps/mail/accounts/${input.id}`,
    bodyFn: (input) => {
      const { id: _, ...body } = input;
      return body;
    },
  }),
  deleteAccount: createPathMutation<string, void>({
    method: "DELETE",
    pathFn: (id) => `/api/apps/mail/accounts/${encodeURIComponent(id)}`,
  }),
  testConnection: createPathMutation<string, void>({
    method: "POST",
    pathFn: (id) => `/api/apps/mail/accounts/${encodeURIComponent(id)}/test`,
  }),

  // ── Folders ──
  listFolders: createQuery<{ accountId: string }, MailFolderOutput[]>({
    path: "/api/apps/mail/accounts",
    pathFn: (input) => `/api/apps/mail/accounts/${input.accountId}/folders`,
  }),
  syncFolders: createMutation<{ accountId: string }, MailFolderOutput[]>({
    path: "/api/apps/mail/accounts",
    pathFn: (input) =>
      `/api/apps/mail/accounts/${input.accountId}/folders/sync`,
  }),

  // ── Messages ──
  listMessages: createQuery<ListMessagesInput, MailMessageListOutput>({
    path: "/api/apps/mail/accounts",
    pathFn: (input) =>
      `/api/apps/mail/accounts/${input.accountId}/folders/${input.folderId}/messages`,
    paramsFn: (input) => {
      const params: Record<string, string> = {};
      if (input.page != null) params.page = String(input.page);
      if (input.pageSize != null) params.page_size = String(input.pageSize);
      return params;
    },
  }),
  getMessage: createQuery<{ messageId: string }, MailMessageFullOutput>({
    path: "/api/apps/mail/messages",
    pathFn: (input) => `/api/apps/mail/messages/${input.messageId}`,
  }),
  markRead: createMutation<BulkMessageIdsInput, void>({
    path: "/api/apps/mail/messages/read",
  }),
  markUnread: createMutation<BulkMessageIdsInput, void>({
    path: "/api/apps/mail/messages/unread",
  }),
  deleteMessages: createMutation<BulkMessageIdsInput, void>({
    path: "/api/apps/mail/messages/delete",
  }),
  refetchBody: createPathMutation<string, MailMessageFullOutput>({
    method: "POST",
    pathFn: (id) =>
      `/api/apps/mail/messages/${encodeURIComponent(id)}/refetch-body`,
  }),
  moveMessages: createMutation<MoveMessagesInput, void>({
    path: "/api/apps/mail/messages/move",
  }),

  // ── Send ──
  sendMessage: createMutation<SendMessageInput, void>({
    path: "/api/apps/mail/accounts",
    pathFn: (input) => `/api/apps/mail/accounts/${input.accountId}/send`,
    bodyFn: (input) => {
      const { accountId: _, ...body } = input;
      return body;
    },
  }),

  // ── Search ──
  searchMessages: createQuery<SearchInput, MailMessageListOutput>({
    path: "/api/apps/mail/accounts",
    pathFn: (input) => `/api/apps/mail/accounts/${input.accountId}/search`,
    paramsFn: (input) => {
      const params: Record<string, string> = { q: input.q };
      if (input.folder_id) params.folder_id = input.folder_id;
      return params;
    },
  }),
} as const;
