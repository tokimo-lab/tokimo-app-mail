import { api } from "@/generated/rust-api";
import type { MailAccountOutput } from "@/generated/rust-api/mail";

export function useMailAccounts() {
  const { data, isLoading, refetch } = api.mail.listAccounts.useQuery({});

  return {
    accounts: (data?.data ?? []) as MailAccountOutput[],
    isLoading,
    refetch,
  };
}
