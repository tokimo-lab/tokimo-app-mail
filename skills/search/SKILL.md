---
name: search
description: "Search a user's email by keyword across subject, sender, and body, optionally limited to one folder, to quickly find a specific message."
when-to-use: "When the user wants to find or locate a specific email by keyword, sender, or subject rather than paging through the inbox."
argument-hint: "[account email] <query>"
version: "0.1.0"
context: inline
---

# Search Email

Find messages by keyword in a configured account. The CLI binary is
`tokimo-app-mail`.

## Choosing the account (read first)

Search needs the global `--account` flag — the account **email** (preferred) or
**id**. Discover accounts with:

```bash
tokimo-app-mail accounts list
#   ID                                    Email                   Provider    Enabled
#   359afd9d-...-052e879ae483             alice@gmail.com         gmail       true
```

## Quick Reference

| Task | Command |
|------|---------|
| List accounts | `tokimo-app-mail accounts list` |
| List folders (for `--folder-id`) | `tokimo-app-mail --account <acct> folders list` |
| Search everywhere | `tokimo-app-mail --account <acct> search "<query>"` |
| Search within one folder | `tokimo-app-mail --account <acct> search "<query>" --folder-id <folder-id>` |

## Workflow

1. **Pick the account** via `accounts list`.

2. **Search by keyword.** The query is a positional argument; quote it if it
   has spaces. Search forward-syncs INBOX first so results reflect the latest
   server state:

   ```bash
   tokimo-app-mail --account alice@gmail.com search "invoice"
   #   UID       Date                  From                            Subject
   #   48213     2026-06-01 10:02      billing@vendor.com              March invoice
   ```

3. **(Optional) Restrict to a folder.** Get a folder id from
   `folders list` (first column) and pass `--folder-id`:

   ```bash
   tokimo-app-mail --account alice@gmail.com folders list
   tokimo-app-mail --account alice@gmail.com search "invoice" --folder-id <folder-id>
   ```

## Worked Example

Find an invoice email from a vendor:

```bash
# 1. Find the account
tokimo-app-mail accounts list                  # -> alice@gmail.com

# 2. Search for the keyword
tokimo-app-mail --account alice@gmail.com search "March invoice"
#   -> UID 48213  billing@vendor.com  "March invoice"
```

## Notes

- `--account` is **global**; place it before `search` for clarity.
- Search output's first column is the IMAP **UID**, which identifies the
  message on the server. It is **not** the integer list `ID` used by
  `messages read` / `mark-read` / `delete`. To open or act on a found message,
  locate it in `messages list` (use `read-inbox`) and use that integer ID.
- The keyword query is a single positional argument — quote multi-word phrases:
  `search "March invoice"`.
- To browse rather than search, or to read a found message in full, use the
  `read-inbox` skill.
