import {
  Brand,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/onhold";
import * as React from "react";
import type { LucideIcon } from "lucide-react";
export function AppSidebar({
  items,
  active,
  account,
  online,
  ...props
}: {
  items: readonly { id: string; label: string; icon: LucideIcon }[];
  active: string;
  account?: string | null;
  online: boolean;
} & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="px-4 pt-5 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href="#overview" aria-label="OnHold 运营后台">
                <Brand />
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {items.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    asChild
                    size="lg"
                    className="gap-3 px-3"
                    isActive={active === item.id}
                    tooltip={item.label}
                  >
                    <a
                      href={"#" + item.id}
                      aria-current={active === item.id ? "page" : undefined}
                    >
                      <item.icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="#settings">
                <span
                  className={
                    "size-2 rounded-full " +
                    (online ? "bg-success" : "bg-muted-foreground")
                  }
                />
                <span>{account ? "@" + account : "尚未连接账号"}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
