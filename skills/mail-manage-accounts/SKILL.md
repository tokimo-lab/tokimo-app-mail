---
name: mail-manage-accounts
description: "Set up and manage the user's IMAP/SMTP mail accounts: list, inspect, add (with auto-detected or custom server settings), test the connection, and delete a mailbox."
when-to-use: "When the user wants to add, configure, inspect, test, or remove a mail account, or troubleshoot why mail isn't connecting."
argument-hint: "list | add --email <e> --password <p> | test --id <acct> | delete --id <acct>"
version: "0.1.0"
context: inline
---

# Manage Mail Accounts

Add and manage the per-user IMAP/SMTP mailboxes that every other mail command
operates on. The CLI binary is `tokimo-app-mail`.

## Choosing the account (read first)

The `accounts` subcommands identify an account with the **`--id` flag**, which
accepts the account **email** (preferred) or its **id**. (This is distinct from
the global `--account` flag used by `messages` / `send` / `sync` / `search`.)
List accounts to discover both:

```bash
tokimo-app-mail accounts list
#   ID                                    Email                   Provider    Enabled
#   359afd9d-...-052e879ae483             alice@gmail.com         gmail       true
```

So `--id` is either an email (`alice@gmail.com`) or an id (`359afd9d-...`).

## Quick Reference

| Task | Command |
|------|---------|
| List accounts | `tokimo-app-mail accounts list` |
| Show account detail | `tokimo-app-mail accounts get --id <acct>` |
| Add (auto-detect provider) | `tokimo-app-mail accounts add --email <e> --password <p>` |
| Add (custom servers) | `... add --email <e> --password <p> --imap-host <h> --smtp-host <h>` |
| Test IMAP + SMTP | `tokimo-app-mail accounts test --id <acct>` |
| Delete an account | `tokimo-app-mail accounts delete --id <acct>` |

## Workflow

1. **List what's there.** First column is the `ID` (UUID), second is `Email`:

   ```bash
   tokimo-app-mail accounts list
   ```

2. **Add an account.** `--email` and `--password` are required. For common
   providers the IMAP/SMTP hosts are **auto-detected** from the email domain;
   `--name` sets the display name (defaults to the email):

   ```bash
   tokimo-app-mail accounts add \
     --email alice@gmail.com \
     --password "<app-password>" \
     --name "Alice"
   ```

   If the provider can't be auto-detected, supply the servers explicitly. Ports
   default to IMAP `993` / SMTP `465`:

   ```bash
   tokimo-app-mail accounts add \
     --email alice@corp.example \
     --password "<password>" \
     --imap-host imap.corp.example --imap-port 993 \
     --smtp-host smtp.corp.example --smtp-port 465
   ```

3. **Test the connection** to confirm credentials and reachability:

   ```bash
   tokimo-app-mail accounts test --id alice@gmail.com
   #   -> Connection test passed.
   ```

4. **Inspect or delete** as needed:

   ```bash
   tokimo-app-mail accounts get    --id alice@gmail.com
   tokimo-app-mail accounts delete --id alice@gmail.com
   ```

## Worked Example

Add a Gmail account, verify it, then check details:

```bash
# 1. Add (provider auto-detected from the gmail.com domain)
tokimo-app-mail accounts add --email alice@gmail.com --password "<app-password>" --name "Alice"
#   -> Account created: alice@gmail.com (359afd9d-...)

# 2. Test the IMAP + SMTP connection
tokimo-app-mail accounts test --id alice@gmail.com

# 3. Review the stored settings
tokimo-app-mail accounts get --id alice@gmail.com
```

## Notes

- The `accounts` subcommands use **`--id`** (email or UUID). The other skills
  use the global **`--account`** flag — same identifier, different flag name.
- Many providers (e.g. Gmail, Outlook) require an **app-specific password**, not
  the normal login password. If `accounts test` fails on auth, an app password
  is the usual fix.
- `accounts add` auto-detects servers from the email domain; pass **both**
  `--imap-host` and `--smtp-host` to override for custom/self-hosted mail.
- After adding an account, run a sync and read mail with the `mail-read-inbox`
  skill.
