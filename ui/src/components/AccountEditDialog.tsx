/**
 * AccountEditDialog — modal for editing an existing mail account.
 * Shows display name, server settings, and optional password change.
 */

import { useQueryClient } from "@tanstack/react-query";
import {
  Checkbox,
  Form,
  Input,
  Modal,
  Password,
  ScrollArea,
  Select,
} from "@tokimo/ui";
import { useTranslation } from "../i18n";
import { mailApi } from "../generated/rust-api";
import type { MailAccountOutput } from "../generated/rust-api/mail";
import { useMessage } from "../lib/shell-context";

const SECURITY_OPTIONS = [
  { value: "tls", label: "SSL/TLS" },
  { value: "starttls", label: "STARTTLS" },
  { value: "none", label: "None" },
];

interface AccountEditDialogProps {
  account: MailAccountOutput;
  open: boolean;
  onClose: () => void;
}

export function AccountEditDialog({
  account,
  open,
  onClose,
}: AccountEditDialogProps) {
  const { t } = useTranslation();
  const msg = useMessage();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const changePassword = Form.useWatch<boolean>("changePassword", form);

  const updateMutation = mailApi.updateAccount.useMutation({
    onSuccess: () => {
      msg.success(t("mail.account.saveSuccess"));
      mailApi.listAccounts.invalidate(qc);
      onClose();
    },
    onError: (err) => {
      msg.error(t("mail.account.saveFailed", { error: err.message }));
    },
  });

  const handleOk = async () => {
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

  return (
    <Modal
      open={open}
      title={t("mail.account.editTitle")}
      okText={t("mail.account.save")}
      cancelText={t("mail.setup.cancel")}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={updateMutation.isPending}
      width={520}
    >
      <ScrollArea direction="vertical" style={{ maxHeight: 460 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={initialValues}
          className="py-2 pr-1"
        >
          {/* Basic info */}
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
                  { required: true, message: t("mail.setup.passwordRequired") },
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
    </Modal>
  );
}
