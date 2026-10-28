import { Separator, SidebarTrigger } from "@/components/onhold";
import React from "react";
import { FreeBadge } from "@/app/free-badge";
export function SiteHeader({
  title,
  children,
  mobileNavigation = false,
}: {
  title: string;
  children: React.ReactNode;
  mobileNavigation?: boolean;
}) {
  return (
    <header className="site-header flex min-h-(--onhold-header-height) shrink-0 items-center gap-2 border-b">
      <div className="flex w-full flex-wrap items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger
          className={mobileNavigation ? "-ml-1 hidden md:inline-flex" : "-ml-1"}
        />
        <Separator
          orientation="vertical"
          className={
            mobileNavigation
              ? "mx-2 hidden md:block data-[orientation=vertical]:h-4"
              : "mx-2 data-[orientation=vertical]:h-4"
          }
        />
        <h1 className="text-base font-medium">{title}</h1>
        <FreeBadge />
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}
