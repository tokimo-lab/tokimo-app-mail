import { Button, cn, Input, ScrollArea, Spin } from "@tokiomo/components";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Globe,
  Mail,
  Shield,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { api } from "@/generated/rust-api";
import type { MailProviderPresetOutput } from "@/generated/rust-api/mail";
import { useMessage } from "@/system/notifications/useMessage";

interface AccountSetupProps {
  onComplete: () => void;
  onCancel?: () => void;
}

type Step = "provider" | "credentials" | "test";

export function AccountSetup({ onComplete, onCancel }: AccountSetupProps) {
  const [step, setStep] = useState<Step>("provider");
  const [selectedPreset, setSelectedPreset] =
    useState<MailProviderPresetOutput | null>(null);
  const [isCustom, setIsCustom] = useState(false);

  // Credential form state
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("");
  const [imapSecurity, setImapSecurity] = useState("tls");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpSecurity, setSmtpSecurity] = useState("tls");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [useSeparateSmtp, setUseSeparateSmtp] = useState(false);

  const handleSelectPreset = (preset: MailProviderPresetOutput) => {
    setSelectedPreset(preset);
    setImapHost(preset.imapHost);
    setImapPort(String(preset.imapPort));
    setImapSecurity(preset.imapSecurity);
    setSmtpHost(preset.smtpHost);
    setSmtpPort(String(preset.smtpPort));
    setSmtpSecurity(preset.smtpSecurity);
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

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="flex h-[550px] w-[600px] flex-col rounded-lg border border-border bg-background shadow-lg">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          {step !== "provider" && (
            <button
              type="button"
              className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
              onClick={handleBack}
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <Mail className="size-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">
            {step === "provider" && "Add Email Account"}
            {step === "credentials" &&
              (selectedPreset
                ? `Set up ${selectedPreset.displayName}`
                : "Manual Configuration")}
            {step === "test" && "Testing Connection"}
          </h2>
          {onCancel && (
            <button
              type="button"
              className="ml-auto cursor-pointer text-sm text-muted-foreground hover:text-foreground"
              onClick={onCancel}
            >
              Cancel
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
              preset={selectedPreset}
              isCustom={isCustom}
              email={email}
              setEmail={setEmail}
              displayName={displayName}
              setDisplayName={setDisplayName}
              password={password}
              setPassword={setPassword}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              imapHost={imapHost}
              setImapHost={setImapHost}
              imapPort={imapPort}
              setImapPort={setImapPort}
              imapSecurity={imapSecurity}
              setImapSecurity={setImapSecurity}
              smtpHost={smtpHost}
              setSmtpHost={setSmtpHost}
              smtpPort={smtpPort}
              setSmtpPort={setSmtpPort}
              smtpSecurity={smtpSecurity}
              setSmtpSecurity={setSmtpSecurity}
              smtpUsername={smtpUsername}
              setSmtpUsername={setSmtpUsername}
              smtpPassword={smtpPassword}
              setSmtpPassword={setSmtpPassword}
              useSeparateSmtp={useSeparateSmtp}
              setUseSeparateSmtp={setUseSeparateSmtp}
              onNext={() => setStep("test")}
            />
          )}
          {step === "test" && (
            <TestStep
              email={email}
              displayName={displayName}
              password={password}
              provider={selectedPreset?.provider}
              imapHost={imapHost}
              imapPort={imapPort}
              imapSecurity={imapSecurity}
              smtpHost={smtpHost}
              smtpPort={smtpPort}
              smtpSecurity={smtpSecurity}
              smtpUsername={useSeparateSmtp ? smtpUsername : ""}
              smtpPassword={useSeparateSmtp ? smtpPassword : ""}
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
  const steps: { key: Step; label: string }[] = [
    { key: "provider", label: "Provider" },
    { key: "credentials", label: "Credentials" },
    { key: "test", label: "Connect" },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-2 border-b border-border px-5 py-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          {i > 0 && <ChevronRight className="size-3 text-muted-foreground" />}
          <span
            className={cn(
              "text-xs font-medium",
              i === currentIdx
                ? "text-primary"
                : i < currentIdx
                  ? "text-foreground"
                  : "text-muted-foreground",
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
  const { data, isLoading } = api.mail.listProviders.useQuery({});
  const presets = (data?.data ?? []) as MailProviderPresetOutput[];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin className="size-5" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="grid grid-cols-2 gap-2 p-4">
        {presets.map((preset) => (
          <button
            key={preset.provider}
            type="button"
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
            onClick={() => onSelectPreset(preset)}
          >
            <Mail className="size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">
                {preset.displayName}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {preset.domains.join(", ")}
              </div>
            </div>
            <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}

        {/* Custom option */}
        <button
          type="button"
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
          onClick={onSelectCustom}
        >
          <Globe className="size-5 shrink-0 text-muted-foreground" />
          <div>
            <div className="text-sm font-medium text-foreground">
              Other / Custom
            </div>
            <div className="text-xs text-muted-foreground">
              Manual IMAP/SMTP
            </div>
          </div>
          <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </button>
      </div>
    </ScrollArea>
  );
}

// ── Credentials step ─────────────────────────────────────────────────────────

function CredentialStep({
  preset,
  isCustom,
  email,
  setEmail,
  displayName,
  setDisplayName,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  imapHost,
  setImapHost,
  imapPort,
  setImapPort,
  imapSecurity,
  setImapSecurity,
  smtpHost,
  setSmtpHost,
  smtpPort,
  setSmtpPort,
  smtpSecurity,
  setSmtpSecurity,
  smtpUsername,
  setSmtpUsername,
  smtpPassword,
  setSmtpPassword,
  useSeparateSmtp,
  setUseSeparateSmtp,
  onNext,
}: {
  preset: MailProviderPresetOutput | null;
  isCustom: boolean;
  email: string;
  setEmail: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  imapHost: string;
  setImapHost: (v: string) => void;
  imapPort: string;
  setImapPort: (v: string) => void;
  imapSecurity: string;
  setImapSecurity: (v: string) => void;
  smtpHost: string;
  setSmtpHost: (v: string) => void;
  smtpPort: string;
  setSmtpPort: (v: string) => void;
  smtpSecurity: string;
  setSmtpSecurity: (v: string) => void;
  smtpUsername: string;
  setSmtpUsername: (v: string) => void;
  smtpPassword: string;
  setSmtpPassword: (v: string) => void;
  useSeparateSmtp: boolean;
  setUseSeparateSmtp: (v: boolean) => void;
  onNext: () => void;
}) {
  const canProceed = email.trim() && password.trim();

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-5">
        {/* Setup instructions */}
        {preset && preset.setupInstructions.length > 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-blue-700 dark:text-blue-300">
              <Shield className="size-4" />
              Setup Instructions
            </div>
            <ol className="ml-5 list-decimal space-y-1 text-sm text-blue-600 dark:text-blue-400">
              {preset.setupInstructions.map((inst) => (
                <li key={inst}>{inst}</li>
              ))}
            </ol>
            {preset.appPasswordUrl && (
              <a
                href={preset.appPasswordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
              >
                Open {preset.displayName} app password page →
              </a>
            )}
          </div>
        )}

        {/* Email & display name */}
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground">
            Email Address
          </span>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            type="email"
          />
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground">
            Display Name
          </span>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your Name"
          />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground">
            {preset?.requiresAppPassword ? "App Password" : "Password"}
          </span>
          <div className="relative">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? "text" : "password"}
              placeholder={
                preset?.requiresAppPassword
                  ? "Enter app-specific password"
                  : "Enter password"
              }
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </div>

        {/* Custom server fields */}
        {isCustom && (
          <>
            <div className="border-t border-border pt-4">
              <h4 className="mb-2 text-sm font-medium text-foreground">
                IMAP Settings
              </h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Input
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                    placeholder="imap.example.com"
                  />
                </div>
                <Input
                  value={imapPort}
                  onChange={(e) => setImapPort(e.target.value)}
                  placeholder="993"
                />
              </div>
              <select
                value={imapSecurity}
                onChange={(e) => setImapSecurity(e.target.value)}
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
              >
                <option value="tls">SSL/TLS</option>
                <option value="starttls">STARTTLS</option>
                <option value="none">None</option>
              </select>
            </div>

            <div className="border-t border-border pt-4">
              <h4 className="mb-2 text-sm font-medium text-foreground">
                SMTP Settings
              </h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Input
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.example.com"
                  />
                </div>
                <Input
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="465"
                />
              </div>
              <select
                value={smtpSecurity}
                onChange={(e) => setSmtpSecurity(e.target.value)}
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
              >
                <option value="tls">SSL/TLS</option>
                <option value="starttls">STARTTLS</option>
                <option value="none">None</option>
              </select>
            </div>
          </>
        )}

        {/* Separate SMTP credentials */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="separate-smtp"
            checked={useSeparateSmtp}
            onChange={(e) => setUseSeparateSmtp(e.target.checked)}
            className="cursor-pointer"
          />
          <label
            htmlFor="separate-smtp"
            className="cursor-pointer text-sm text-muted-foreground"
          >
            Use different credentials for SMTP
          </label>
        </div>

        {useSeparateSmtp && (
          <div className="space-y-2 pl-4">
            <Input
              value={smtpUsername}
              onChange={(e) => setSmtpUsername(e.target.value)}
              placeholder="SMTP username"
            />
            <Input
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              type="password"
              placeholder="SMTP password"
            />
          </div>
        )}

        {/* Next button */}
        <div className="flex justify-end pt-2">
          <Button
            className="cursor-pointer"
            onClick={onNext}
            disabled={!canProceed}
          >
            Test Connection
            <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </div>
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

  const createAccount = api.mail.createAccount.useMutation({
    onSuccess: () => {
      msg.success("Account added successfully!");
      // Invalidate accounts list so sidebar picks it up.
      api.mail.listAccounts.invalidate(api.mail.listAccounts.queryKey());
      onComplete();
    },
    onError: (err) => {
      msg.error(`Failed to create account: ${err.message}`);
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
          <Spin className="size-8 text-primary" />
          <p className="text-sm text-muted-foreground">
            Creating account and testing connection...
          </p>
        </>
      )}

      {createAccount.isSuccess && (
        <>
          <CheckCircle2 className="size-10 text-green-500" />
          <p className="text-sm font-medium text-foreground">
            Account connected successfully!
          </p>
          <p className="text-sm text-muted-foreground">
            Your mailbox is being synced in the background.
          </p>
        </>
      )}

      {createAccount.isError && (
        <>
          <XCircle className="size-10 text-destructive" />
          <p className="text-sm font-medium text-foreground">
            Connection failed
          </p>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            {createAccount.error?.message || "Unknown error"}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={onBack}
            >
              <ArrowLeft className="mr-2 size-4" />
              Go back
            </Button>
            <Button className="cursor-pointer" onClick={handleCreate}>
              Retry
            </Button>
          </div>
        </>
      )}

      {createAccount.isIdle && (
        <>
          <Mail className="size-10 text-primary" />
          <p className="text-sm text-muted-foreground">
            Ready to add <strong>{email}</strong>
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={onBack}
            >
              <ArrowLeft className="mr-2 size-4" />
              Back
            </Button>
            <Button className="cursor-pointer" onClick={handleCreate}>
              <Check className="mr-2 size-4" />
              Add Account
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
