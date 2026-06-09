---
name: mail-read-inbox
description: "Check and read a user's email: sync a mail account, list messages in a folder (INBOX by default), and read a chosen message's full text. Also covers marking read/unread, moving, and deleting messages."
when-to-use: "When the user wants to check, open, or read their email, see what's in their inbox, or mark/move/delete messages."
argument-hint: "[account email] [folder]"
version: "0.1.0"
context: inline
---

# Read the Inbox

Sync a mail account, list messages, and read one in full. The CLI binary is
`tokimo-app-mail` and talks directly to the database.

## Choosing the account (read first)

Mail accounts are per-user. Every read/list/send command needs the global
`--account` flag, which accepts the account **email** (preferred) or its **id**.
List the configured accounts to discover them:

```bash
tokimo-app-mail accounts list
#   ID                                    Email                   Provider    Enabled
#   359afd9d-...-052e879ae483             alice@gmail.com         gmail       true
```

So `--account` is either an email (`alice@gmail.com`) or an id
(`359afd9d-...`). If no accounts are listed, set one up with the
`mail-manage-accounts` skill first.

## Quick Reference

| Task | Command |
|------|---------|
| List accounts | `tokimo-app-mail accounts list` |
| Sync an account (folders + mail) | `tokimo-app-mail --account <acct> sync` |
| List folders | `tokimo-app-mail --account <acct> folders list` |
| List INBOX messages | `tokimo-app-mail --account <acct> messages list` |
| List another folder | `tokimo-app-mail --account <acct> messages list --folder <folder-id>` |
| Next page | `tokimo-app-mail --account <acct> messages list --page 2 --page-size 50` |
| Read a message | `tokimo-app-mail --account <acct> messages read <message-id>` |
| Mark read / unread | `tokimo-app-mail --account <acct> messages mark-read <ids...>` |
| Move messages | `tokimo-app-mail --account <acct> messages move <ids...> --target-folder <folder-id>` |
| Delete messages | `tokimo-app-mail --account <acct> messages delete <ids...>` |

## Workflow

1. **Pick the account.** Run `accounts list` and take the email (or id).

2. **Sync** so the local view reflects the server. `messages list` already
   forward-syncs page 1 of INBOX, but a full `sync` refreshes every folder:

   ```bash
   tokimo-app-mail --account alice@gmail.com sync
   ```

3. **(Optional) List folders** to get a folder id for a non-INBOX mailbox.
   The first column is the folder `ID` (a UUID):

   ```bash
   tokimo-app-mail --account alice@gmail.com folders list
   #   ID                                    Name      Type    Unread  Total
   ```

4. **List messages.** Defaults to INBOX. The first column is the message `ID`
   (a small integer) — that is what `read` / `mark-read` / `delete` take:

   ```bash
   tokimo-app-mail --account alice@gmail.com messages list
   #   ID        Date                  Read  From                            Subject
   #   1207      2026-06-09 09:14      N     bob@example.com                 Lunch?
   ```

   Use `--page` / `--page-size` to page through, and `--folder <folder-id>` to
   read another mailbox.

5. **Read a message** in full by its integer `ID`:

   ```bash
   tokimo-app-mail --account alice@gmail.com messages read 1207
   ```

   Prints `From / To / CC / Date / Subject`, the text body (or a note that the
   body is HTML-only), and any attachment list.

## Worked Example

Check Alice's inbox and read the newest unread message:

```bash
# 1. Find the account
tokimo-app-mail accounts list                 # -> alice@gmail.com

# 2. Sync, then list the inbox
tokimo-app-mail --account alice@gmail.com sync
tokimo-app-mail --account alice@gmail.com messages list
#   -> ID 1207  N  bob@example.com  "Lunch?"

# 3. Read it, then mark it read
tokimo-app-mail --account alice@gmail.com messages read 1207
tokimo-app-mail --account alice@gmail.com messages mark-read 1207
```

## Notes

- `--account` is **global**: it may appear before or after the subcommand. Place
  it before for clarity (`tokimo-app-mail --account <acct> messages list`).
- The message `ID` for `read` / `mark-read` / `mark-unread` / `delete` / `move`
  is the **integer in the first column of `messages list`** — not the IMAP UID
  shown by `mail-search`. Always run `messages list` to get an operable ID.
- `mark-read`, `mark-unread`, `delete`, and `move` accept **multiple** ids
  separated by spaces, e.g. `messages mark-read 1207 1208 1209`.
- `messages move` needs `--target-folder <folder-id>`; get the folder id from
  `folders list`.
- If `folders list` is empty, run `sync` (or `folders sync`) first.
- To find a specific email by keyword instead of paging, use the `mail-search`
  skill. To send or reply, use `mail-send`.
