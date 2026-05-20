import { mailApi } from "../generated/rust-api";
import type { MailAccountOutput } from "../generated/rust-api/mail";

export function useMailAccounts() {
  const { data, isLoading, refetch } = mailApi.listAccounts.useQuery();

  return {
    accounts: (data ?? []) as MailAccountOutput[],
    isLoading,
    refetch,
  };
}
