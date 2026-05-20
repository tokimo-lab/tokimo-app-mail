import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { authFetch } from "../../lib/auth-fetch";
import {
  createMutation,
  createPathMutation,
  createQuery,
  rustUrl,
} from "../../lib/rust-api-runtime";

// ── Types from ts-rs (auto-generated) ──

export type {
  BulkMessageIdsBody,
  CreateAccountBody,
  DetectProviderQuery,
  ListMessagesQuery,
  MailAccountOutput,
  MailAddressOutput,
  MailAttachmentOutput,
  MailFolderOutput,
  MailMessageFullOutput,
  MailMessageListOutput,
  MailMessageSummaryOutput,
  MailProviderPresetOutput,
  MoveMessagesBody,
  SearchQuery,
  SendMessageBody,
  UpdateAccountBody,
} from "../rust-types";

// ── Input types (API-level, not generated) ──

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

export interface SendMessageApiInput {
  accountId: string;
  payload: Omit<SendMessageInput, "accountId">;
  attachments?: File[];
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

// ── Re-export generated types for convenience ──

import type {
  MailAccountOutput,
  MailFolderOutput,
  MailMessageFullOutput,
  MailMessageListOutput,
  MailProviderPresetOutput,
} from "../rust-types";

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

  // ── Send (multipart/form-data to support attachments) ──
  sendMessage: (() => {
    const mutationFn = async (input: SendMessageApiInput): Promise<void> => {
      const fd = new FormData();
      fd.append("payload", JSON.stringify(input.payload));
      for (const file of input.attachments ?? []) {
        fd.append("attachments", file, file.name);
      }
      const res = await authFetch(
        rustUrl(
          `/api/apps/mail/accounts/${encodeURIComponent(input.accountId)}/send`,
        ),
        { method: "POST", body: fd },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new Error(text);
      }
    };
    return {
      useMutation: (
        opts?: Partial<UseMutationOptions<void, Error, SendMessageApiInput>>,
      ) =>
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useMutation<void, Error, SendMessageApiInput>({
          mutationFn,
          ...opts,
        }),
      mutate: mutationFn,
    };
  })(),

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
