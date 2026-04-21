import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  cn,
  Form,
  type FormInstance,
  Input,
  Password,
  ScrollArea,
  Select,
  Spin,
  useForm,
} from "@tokimo/ui";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Globe,
  Mail,
  Shield,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/generated/rust-api";
import type { MailProviderPresetOutput } from "@/generated/rust-api/mail";
import { useMessage } from "@/system/notifications/useMessage";

const SECURITY_OPTIONS = [
  { value: "tls", label: "SSL/TLS" },
  { value: "starttls", label: "STARTTLS" },
  { value: "none", label: "None" },
];

interface AccountSetupProps {
  onComplete: () => void;
  onCancel?: () => void;
}

interface CredentialValues {
  email: string;
  displayName: string;
  password: string;
  imapHost: string;
  imapPort: string;
  imapSecurity: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecurity: string;
  smtpUsername: string;
  smtpPassword: string;
  useSeparateSmtp: boolean;
}

type Step = "provider" | "credentials" | "test";

export function AccountSetup({ onComplete, onCancel }: AccountSetupProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("provider");
  const [selectedPreset, setSelectedPreset] =
    useState<MailProviderPresetOutput | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [form] = useForm();

  const handleSelectPreset = (preset: MailProviderPresetOutput) => {
    setSelectedPreset(preset);
    form.setFieldsValue({
      imapHost: preset.imapHost,
      imapPort: String(preset.imapPort),
      imapSecurity: preset.imapSecurity,
      smtpHost: preset.smtpHost,
      smtpPort: String(preset.smtpPort),
      smtpSecurity: preset.smtpSecurity,
    });
    setIsCustom(false);
    setStep("credentials");
  };

  const handleSelectCustom = () => {
    setSelectedPreset(null);
    setIsCustom(true);
    setStep("credentials");
  };

  const handleBack = () => {
    if (step === "credentials") setStep("provider");
    if (step === "test") setStep("credentials");
  };

  const values = form.getFieldsValue() as CredentialValues;

  return (
    <div className="flex h-full items-center justify-center bg-surface-base">
      <div className="flex h-[550px] w-[600px] flex-col rounded-xl border border-border-base bg-surface-elevated shadow-lg">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border-base px-5 py-4">
          {step !== "provider" && (
            <button
              type="button"
              className="cursor-pointer rounded p-1 text-fg-muted hover:text-fg-primary"
              onClick={handleBack}
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <Mail className="size-5 text-accent" />
          <h2 className="text-base font-semibold text-fg-primary">
            {step === "provider" && t("mail.setup.addAccount")}
            {step === "credentials" &&
              (selectedPreset
                ? t("mail.setup.setupProvider", {
                    provider: selectedPreset.displayName,
                  })
                : t("mail.setup.manualConfig"))}
            {step === "test" && t("mail.setup.testingConnection")}
          </h2>
          {onCancel && (
            <button
              type="button"
              className="ml-auto cursor-pointer text-sm text-fg-muted hover:text-fg-primary"
              onClick={onCancel}
            >
              {t("mail.setup.cancel")}
            </button>
          )}
        </div>

        {/* Steps indicator */}
        <StepIndicator current={step} />

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {step === "provider" && (
            <ProviderStep
              onSelectPreset={handleSelectPreset}
              onSelectCustom={handleSelectCustom}
            />
          )}
          {step === "credentials" && (
            <CredentialStep
              form={form}
              preset={selectedPreset}
              isCustom={isCustom}
              onNext={() => setStep("test")}
            />
          )}
          {step === "test" && (
            <TestStep
              email={values.email}
              displayName={values.displayName}
              password={values.password}
              provider={selectedPreset?.provider}
              imapHost={values.imapHost}
              imapPort={values.imapPort}
              imapSecurity={values.imapSecurity}
              smtpHost={values.smtpHost}
              smtpPort={values.smtpPort}
              smtpSecurity={values.smtpSecurity}
              smtpUsername={values.useSeparateSmtp ? values.smtpUsername : ""}
              smtpPassword={values.useSeparateSmtp ? values.smtpPassword : ""}
              onComplete={onComplete}
              onBack={handleBack}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Steps indicator ──────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const { t } = useTranslation();
  const steps: { key: Step; label: string }[] = [
    { key: "provider", label: t("mail.setup.provider") },
    { key: "credentials", label: t("mail.setup.credentials") },
    { key: "test", label: t("mail.setup.connect") },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-2 border-b border-border-base px-5 py-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          {i > 0 && <ChevronRight className="size-3 text-fg-muted" />}
          <span
            className={cn(
              "text-xs font-medium",
              i === currentIdx
                ? "text-accent"
                : i < currentIdx
                  ? "text-fg-primary"
                  : "text-fg-muted",
            )}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Provider step ────────────────────────────────────────────────────────────

function ProviderStep({
  onSelectPreset,
  onSelectCustom,
}: {
  onSelectPreset: (p: MailProviderPresetOutput) => void;
  onSelectCustom: () => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = api.mail.listProviders.useQuery({});
  const presets = (data ?? []) as MailProviderPresetOutput[];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin className="size-5" />
      </div>
    );
  }

  return (
    <ScrollArea direction="vertical" className="h-full">
      <div className="grid grid-cols-2 gap-2 p-4">
        {presets.map((preset) => (
          <button
            key={preset.provider}
            type="button"
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border-base p-3 text-left transition-colors hover:border-accent/50 hover:bg-fill-tertiary"
            onClick={() => onSelectPreset(preset)}
          >
            <Mail className="size-5 shrink-0 text-accent" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-fg-primary">
                {preset.displayName}
              </div>
              <div className="truncate text-xs text-fg-muted">
                {preset.domains.join(", ")}
              </div>
            </div>
            <ChevronRight className="ml-auto size-4 shrink-0 text-fg-muted" />
          </button>
        ))}

        {/* Custom option */}
        <button
          type="button"
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border-base p-3 text-left transition-colors hover:border-accent/50 hover:bg-fill-tertiary"
          onClick={onSelectCustom}
        >
          <Globe className="size-5 shrink-0 text-fg-muted" />
          <div>
            <div className="text-sm font-medium text-fg-primary">
              {t("mail.setup.otherCustom")}
            </div>
            <div className="text-xs text-fg-muted">
              {t("mail.setup.manualImapSmtp")}
            </div>
          </div>
          <ChevronRight className="ml-auto size-4 shrink-0 text-fg-muted" />
        </button>
      </div>
    </ScrollArea>
  );
}

// ── Credentials step ─────────────────────────────────────────────────────────

function CredentialStep({
  form,
  preset,
  isCustom,
  onNext,
}: {
  form: FormInstance;
  preset: MailProviderPresetOutput | null;
  isCustom: boolean;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const useSeparateSmtp = Form.useWatch<boolean>("useSeparateSmtp", form);

  const handleNext = async () => {
    try {
      await form.validateFields();
      onNext();
    } catch {
      // validation errors shown inline
    }
  };

  return (
    <ScrollArea direction="vertical" className="h-full">
      <Form
        form={form}
        layout="vertical"
        className="space-y-1 p-5"
        initialValues={{ imapSecurity: "tls", smtpSecurity: "tls" }}
      >
        {/* Setup instructions */}
        {preset && preset.setupInstructions?.length > 0 && (
          <div className="rounded-md border border-accent/20 bg-accent/5 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-accent">
              <Shield className="size-4" />
              {t("mail.setup.setupInstructions")}
            </div>
            <ol className="ml-5 list-decimal space-y-1 text-sm text-fg-secondary">
              {preset.setupInstructions.map((inst) => (
                <li key={inst}>{inst}</li>
              ))}
            </ol>
            {preset.appPasswordUrl && (
              <a
                href={preset.appPasswordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-accent underline hover:text-accent-hover"
              >
                {t("mail.setup.openAppPasswordPage", {
                  provider: preset.displayName,
                })}
              </a>
            )}
          </div>
        )}

        <Form.Item
          label={t("mail.setup.emailAddress")}
          name="email"
          rules={[
            { required: true, message: t("mail.setup.emailRequired") },
            { type: "email", message: t("mail.setup.emailInvalid") },
          ]}
        >
          <Input placeholder={t("mail.setup.emailPlaceholder")} />
        </Form.Item>

        <Form.Item label={t("mail.setup.displayName")} name="displayName">
          <Input placeholder={t("mail.setup.displayNamePlaceholder")} />
        </Form.Item>

        <Form.Item
          label={
            preset?.requiresAppPassword
              ? t("mail.setup.appPassword")
              : t("mail.setup.password")
          }
          name="password"
          rules={[
            { required: true, message: t("mail.setup.passwordRequired") },
          ]}
        >
          <Password
            placeholder={
              preset?.requiresAppPassword
                ? t("mail.setup.appPasswordPlaceholder")
                : t("mail.setup.passwordPlaceholder")
            }
          />
        </Form.Item>

        {/* Custom server fields */}
        {isCustom && (
          <>
            <div className="border-t border-border-base pt-3">
              <h4 className="mb-2 text-sm font-medium text-fg-primary">
                {t("mail.setup.imapSettings")}
              </h4>
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
              <Form.Item name="imapSecurity" className="mt-2">
                <Select options={SECURITY_OPTIONS} />
              </Form.Item>
            </div>

            <div className="border-t border-border-base pt-3">
              <h4 className="mb-2 text-sm font-medium text-fg-primary">
                {t("mail.setup.smtpSettings")}
              </h4>
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
              <Form.Item name="smtpSecurity" className="mt-2">
                <Select options={SECURITY_OPTIONS} />
              </Form.Item>
            </div>
          </>
        )}

        <Form.Item name="useSeparateSmtp" valuePropName="checked">
          <Checkbox>{t("mail.setup.useSeparateSmtp")}</Checkbox>
        </Form.Item>

        {useSeparateSmtp && (
          <div className="space-y-1 pl-4">
            <Form.Item label={t("mail.setup.smtpUsername")} name="smtpUsername">
              <Input placeholder={t("mail.setup.smtpUsernamePlaceholder")} />
            </Form.Item>
            <Form.Item label={t("mail.setup.smtpPassword")} name="smtpPassword">
              <Password placeholder={t("mail.setup.smtpPasswordPlaceholder")} />
            </Form.Item>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button className="cursor-pointer" onClick={handleNext}>
            {t("mail.setup.testConnection")}
            <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </Form>
    </ScrollArea>
  );
}

// ── Test step ────────────────────────────────────────────────────────────────

function TestStep({
  email,
  displayName,
  password,
  provider,
  imapHost,
  imapPort,
  imapSecurity,
  smtpHost,
  smtpPort,
  smtpSecurity,
  smtpUsername,
  smtpPassword,
  onComplete,
  onBack,
}: {
  email: string;
  displayName: string;
  password: string;
  provider?: string;
  imapHost: string;
  imapPort: string;
  imapSecurity: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecurity: string;
  smtpUsername: string;
  smtpPassword: string;
  onComplete: () => void;
  onBack: () => void;
}) {
  const msg = useMessage();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const createAccount = api.mail.createAccount.useMutation({
    onSuccess: () => {
      msg.success(t("mail.setup.accountAdded"));
      // Invalidate accounts list so sidebar picks it up.
      api.mail.listAccounts.invalidate(qc);
      onComplete();
    },
    onError: (err) => {
      msg.error(t("mail.setup.createFailed", { error: err.message }));
    },
  });

  const handleCreate = () => {
    createAccount.mutate({
      display_name: displayName || email,
      email,
      provider,
      imap_host: imapHost,
      imap_port: imapPort ? Number.parseInt(imapPort, 10) : undefined,
      imap_security: imapSecurity,
      imap_username: email,
      imap_password: password,
      smtp_host: smtpHost,
      smtp_port: smtpPort ? Number.parseInt(smtpPort, 10) : undefined,
      smtp_security: smtpSecurity,
      smtp_username: smtpUsername || email,
      smtp_password: smtpPassword || password,
    });
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      {createAccount.isPending && (
        <>
          <Spin className="size-8 text-accent" />
          <p className="text-sm text-fg-muted">
            {t("mail.setup.creatingAccount")}
          </p>
        </>
      )}

      {createAccount.isSuccess && (
        <>
          <CheckCircle2 className="size-10 text-accent" />
          <p className="text-sm font-medium text-fg-primary">
            {t("mail.setup.accountSuccess")}
          </p>
          <p className="text-sm text-fg-muted">
            {t("mail.setup.syncingBackground")}
          </p>
        </>
      )}

      {createAccount.isError && (
        <>
          <XCircle className="size-10 text-red-500" />
          <p className="text-sm font-medium text-fg-primary">
            {t("mail.setup.connectionFailed")}
          </p>
          <p className="max-w-md text-center text-sm text-fg-muted">
            {createAccount.error?.message || "Unknown error"}
          </p>
          <div className="flex gap-2">
            <Button
              variant="default"
              className="cursor-pointer"
              onClick={onBack}
            >
              <ArrowLeft className="mr-2 size-4" />
              {t("mail.setup.goBack")}
            </Button>
            <Button className="cursor-pointer" onClick={handleCreate}>
              {t("mail.setup.retry")}
            </Button>
          </div>
        </>
      )}

      {createAccount.isIdle && (
        <>
          <Mail className="size-10 text-accent" />
          <p className="text-sm text-fg-muted">
            {t("mail.setup.readyToAdd", {
              email,
              interpolation: { escapeValue: false },
            })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="default"
              className="cursor-pointer"
              onClick={onBack}
            >
              <ArrowLeft className="mr-2 size-4" />
              {t("mail.setup.back")}
            </Button>
            <Button className="cursor-pointer" onClick={handleCreate}>
              <Check className="mr-2 size-4" />
              {t("mail.setup.addAccountBtn")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
