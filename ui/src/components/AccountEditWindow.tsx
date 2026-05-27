import {
  Button,
  Checkbox,
  Form,
  Input,
  Password,
  ScrollArea,
  Select,
} from "@tokimo/ui";
import { useState } from "react";
import { mailApi } from "../generated/rust-api";
import { useTranslation } from "../i18n";
import type { AppModalWindowHandle } from "../lib/modal-window";
import { MailProviders } from "../lib/providers";
import { clearBridge, getBridge } from "../modal-bridge";

const SECURITY_OPTIONS = [
  { value: "tls", label: "SSL/TLS" },
  { value: "starttls", label: "STARTTLS" },
  { value: "none", label: "None" },
];

function getBridgeId(win: AppModalWindowHandle): string | null {
  const value = win.metadata.bridgeId;
  return typeof value === "string" ? value : null;
}

function AccountEditForm({
  win,
  bridgeId,
}: {
  win: AppModalWindowHandle;
  bridgeId: string;
}) {
  const { t } = useTranslation();
  const [bridge] = useState(() => getBridge(bridgeId));

  const [form] = Form.useForm();
  const changePassword = Form.useWatch<boolean>("changePassword", form);

  const updateMutation = mailApi.updateAccount.useMutation({
    onSuccess: () => {
      if (bridge?.kind === "account-edit") bridge.onSaved();
      clearBridge(bridgeId);
      win.close();
    },
    onError: (err) => {
      if (bridge?.kind === "account-edit") {
        bridge.shell.toast.error(
          t("mail.account.saveFailed", { error: err.message }),
        );
      }
    },
  });

  if (!bridge || bridge.kind !== "account-edit") {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-text-muted">
        {t("mail.account.editTitle")}
      </div>
    );
  }

  const { account } = bridge;

  const initialValues = {
    displayName: account.displayName,
    senderName: account.senderName ?? "",
    imapHost: account.imapHost,
    imapPort: String(account.imapPort),
    imapSecurity: account.imapSecurity,
    smtpHost: account.smtpHost,
    smtpPort: String(account.smtpPort),
    smtpSecurity: account.smtpSecurity,
    changePassword: false,
    newPassword: "",
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      updateMutation.mutate({
        id: account.id,
        display_name: values.displayName || undefined,
        imap_host: values.imapHost || undefined,
        imap_port: values.imapPort ? Number(values.imapPort) : undefined,
        imap_security: values.imapSecurity || undefined,
        smtp_host: values.smtpHost || undefined,
        smtp_port: values.smtpPort ? Number(values.smtpPort) : undefined,
        smtp_security: values.smtpSecurity || undefined,
        imap_password:
          values.changePassword && values.newPassword
            ? values.newPassword
            : undefined,
        smtp_password:
          values.changePassword && values.newPassword
            ? values.newPassword
            : undefined,
        sender_name: values.senderName || undefined,
      });
    } catch {
      // validation errors shown inline
    }
  };

  const handleCancel = () => {
    clearBridge(bridgeId);
    win.close();
  };

  return (
    <div className="flex h-full flex-col">
      <ScrollArea direction="vertical" className="min-h-0 flex-1">
        <Form
          form={form}
          layout="vertical"
          initialValues={initialValues}
          className="p-4"
        >
          <Form.Item label={t("mail.setup.displayName")} name="displayName">
            <Input placeholder={t("mail.setup.displayNamePlaceholder")} />
          </Form.Item>

          <Form.Item label={t("mail.setup.emailAddress")}>
            <Input value={account.email} disabled />
          </Form.Item>

          <Form.Item label="发件人名称" name="senderName">
            <Input placeholder="留空使用显示名称" />
          </Form.Item>

          {/* IMAP settings */}
          <div className="mb-3 border-t border-border-base pt-3">
            <div className="mb-2 text-sm font-medium text-fg-primary">
              {t("mail.setup.imapSettings")}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Form.Item name="imapHost" className="!mb-0">
                  <Input placeholder="imap.example.com" />
                </Form.Item>
              </div>
              <Form.Item name="imapPort" className="!mb-0">
                <Input placeholder="993" />
              </Form.Item>
            </div>
            <Form.Item name="imapSecurity" className="mt-2 !mb-0">
              <Select options={SECURITY_OPTIONS} />
            </Form.Item>
          </div>

          {/* SMTP settings */}
          <div className="mb-3 border-t border-border-base pt-3">
            <div className="mb-2 text-sm font-medium text-fg-primary">
              {t("mail.setup.smtpSettings")}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Form.Item name="smtpHost" className="!mb-0">
                  <Input placeholder="smtp.example.com" />
                </Form.Item>
              </div>
              <Form.Item name="smtpPort" className="!mb-0">
                <Input placeholder="465" />
              </Form.Item>
            </div>
            <Form.Item name="smtpSecurity" className="mt-2 !mb-0">
              <Select options={SECURITY_OPTIONS} />
            </Form.Item>
          </div>

          {/* Password change */}
          <div className="border-t border-border-base pt-3">
            <Form.Item
              name="changePassword"
              valuePropName="checked"
              className="!mb-2"
            >
              <Checkbox>{t("mail.account.changePassword")}</Checkbox>
            </Form.Item>

            {changePassword && (
              <Form.Item
                name="newPassword"
                label={t("mail.account.newPassword")}
                rules={[
                  {
                    required: true,
                    message: t("mail.setup.passwordRequired"),
                  },
                ]}
              >
                <Password
                  placeholder={t("mail.account.newPasswordPlaceholder")}
                />
              </Form.Item>
            )}
          </div>
        </Form>
      </ScrollArea>

      <div className="flex justify-end gap-2 border-t border-border-base p-3">
        <Button variant="text" onClick={handleCancel}>
          {t("mail.setup.cancel")}
        </Button>
        <Button
          variant="primary"
          loading={updateMutation.isPending}
          onClick={handleSave}
        >
          {t("mail.account.save")}
        </Button>
      </div>
    </div>
  );
}

export default function AccountEditWindow({
  win,
}: {
  win: AppModalWindowHandle;
}) {
  const bridgeId = getBridgeId(win);
  const [bridge] = useState(() => (bridgeId ? getBridge(bridgeId) : undefined));

  if (!bridgeId || bridge?.kind !== "account-edit") return null;

  return (
    <MailProviders locale={bridge.locale} toast={bridge.shell.toast}>
      <AccountEditForm win={win} bridgeId={bridgeId} />
    </MailProviders>
  );
}
