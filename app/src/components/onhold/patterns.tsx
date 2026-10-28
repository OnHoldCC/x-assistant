import type { ReactNode } from "react";
import {
  CircleCheck,
  CircleX,
  FileText,
  Info,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cva } from "class-variance-authority";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";
const tones = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-destructive",
  info: "bg-info-surface text-info",
};
const statusStyle = cva("gap-1.5 border-transparent", {
  variants: { tone: tones },
});
const noticeStyle = cva(
  "flex items-start gap-2 rounded-md border border-transparent px-4 py-3 text-sm",
  { variants: { tone: tones } },
);
const icons = {
  neutral: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
  info: Info,
};

export function Brand() {
  return (
    <span className="brand inline-flex items-center text-base font-semibold tracking-tight">
      OnHold
    </span>
  );
}

export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: StatusTone;
  children: ReactNode;
}) {
  return (
    <Badge variant="outline" data-tone={tone} className={statusStyle({ tone })}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </Badge>
  );
}

export function Notice({
  tone = "neutral",
  children,
}: {
  tone?: StatusTone;
  children: ReactNode;
}) {
  const Icon = icons[tone];
  return (
    <div
      data-slot="notice"
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
      className={noticeStyle({ tone })}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = FileText,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div
      data-slot="empty-state"
      className="flex min-h-44 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <Icon className="size-7 text-muted-foreground" aria-hidden="true" />
      <h3 className="text-sm font-medium">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action}
    </div>
  );
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <CardHeader className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-2">
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </div>
      {action && <CardAction className="max-w-full">{action}</CardAction>}
    </CardHeader>
  );
}

export function StatCard({
  label,
  value,
  change,
  footer,
}: {
  label: string;
  value: ReactNode;
  change?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="@container/card">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {value}
          </CardTitle>
        </div>
        {change != null && (
          <CardAction className="max-w-full">{change}</CardAction>
        )}
      </CardHeader>
      {footer != null && (
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}

export function NumberValue({
  value,
  approximate = false,
  compact = false,
}: {
  value: number | null | undefined;
  approximate?: boolean;
  compact?: boolean;
}) {
  return (
    <>
      {value != null && approximate ? "≈" : ""}
      {value == null
        ? "—"
        : value.toLocaleString(
            "zh-CN",
            compact && Math.abs(value) >= 10000
              ? { notation: "compact", maximumFractionDigits: 1 }
              : undefined,
          )}
    </>
  );
}
