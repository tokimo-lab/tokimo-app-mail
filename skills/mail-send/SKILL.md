---
name: mail-send
description: "Compose and send an email from one of the user's accounts: set recipients (to/cc), subject, plain-text or HTML body, optionally reply to a message and attach files."
when-to-use: "When the user wants to send, reply to, or forward an email."
argument-hint: "[account email] --to <addr> --subject <s> --body <text>"
version: "0.1.0"
context: inline
---

# Send an Email

Compose and send a message over SMTP from a configured account. The CLI binary
is `tokimo-app-mail`.

## Choosing the account (read first)

Sending requires the global `--account` flag — the **email** (preferred) or
**id** of the account to send *from*. Discover accounts with:

```bash
tokimo-app-mail accounts list
#   ID                                    Email                   Provider    Enabled
#   359afd9d-...-052e879ae483             alice@gmail.com         gmail       true
```

If no account exists, set one up with the `mail-manage-accounts` skill first.

## Quick Reference

| Task | Command |
|------|---------|
| List accounts (the senders) | `tokimo-app-mail accounts list` |
| Send a plain-text email | `tokimo-app-mail --account <acct> send --to <addr> --subject <s> --body <text>` |
| Send to multiple recipients | repeat `--to`: `--to a@x.com --to b@y.com` |
| Add CC | repeat `--cc`: `--cc c@z.com` |
| Send HTML | add `--html '<p>...</p>'` |
| Reply to a message | add `--in-reply-to <Message-ID>` |
| Attach files | repeat `--attachment`: `--attachment ./a.pdf --attachment ./b.png` |

## Workflow

1. **Pick the sending account** via `accounts list` (use its email).

2. **Compose and send.** `--subject` and `--body` are required; `--to` must
   appear at least once. Repeat `--to` / `--cc` / `--attachment` for multiple
   values:

   ```bash
   tokimo-app-mail --account alice@gmail.com send \
     --to bob@example.com \
     --subject "Hello" \
     --body "Hi Bob, see attached." \
     --attachment ./report.pdf
   ```

3. **HTML body (optional).** Pass `--html`; you can include `--body` too as the
   plain-text fallback:

   ```bash
   tokimo-app-mail --account alice@gmail.com send \
     --to bob@example.com --subject "Newsletter" \
     --body "Plain-text version" \
     --html "<h1>Hi</h1><p>HTML version</p>"
   ```

4. **Reply (optional).** Pass the original message's `Message-ID` via
   `--in-reply-to` so the reply threads correctly. Find it by reading the
   original message (`mail-read-inbox`) or via headers.

## Worked Example

Reply to a message with an attachment:

```bash
# 1. Find the sending account
tokimo-app-mail accounts list                  # -> alice@gmail.com

# 2. Send the reply
tokimo-app-mail --account alice@gmail.com send \
  --to bob@example.com \
  --cc team@example.com \
  --subject "Re: Lunch?" \
  --body "Sounds good — noon works." \
  --in-reply-to "<CABc123@mail.example.com>" \
  --attachment ./menu.pdf
```

## Notes

- `--account` is **global** and selects the **sender**; place it before `send`
  for clarity.
- `--to`, `--cc`, and `--attachment` are **repeatable** flags — one value each:
  `--to a@x.com --to b@y.com`. Do not comma-separate.
- `--subject` and `--body` are mandatory. Provide `--html` for a rich body;
  `--body` still serves as the plain-text part.
- `--attachment` takes a **local file path**; the CLI reads the file, guesses
  its MIME type, and encodes it. A missing path fails the send.
- `--in-reply-to` expects the original `Message-ID` header value (often wrapped
  in `<...>`), not the integer list id from `messages list`.
