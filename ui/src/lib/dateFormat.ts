import { useContext } from "react";
import { LocaleContext } from "./shell-context";

export function useDateFormat(): { formatLong: (date: string | Date) => string } {
  const locale = useContext(LocaleContext);
  return {
    formatLong: (date) =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeStyle: "short",
      }).format(typeof date === "string" ? new Date(date) : date),
  };
}
