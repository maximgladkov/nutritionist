"use client";

import { ChartColumn, ListCheck, Persons } from "@gravity-ui/icons";
import { Sidebar } from "@heroui-pro/react";
import { I18nProvider as AriaI18nProvider } from "@react-aria/i18n";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";

const NAV_SECTIONS: readonly {
  readonly items: readonly {
    readonly href: string;
    readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
    readonly id: string;
    readonly label: string;
    readonly match: (pathname: string) => boolean;
  }[];
  readonly label: string;
}[] = [
  {
    items: [
      {
        href: "/admin",
        icon: ChartColumn,
        id: "dashboard",
        label: "Dashboard",
        match: (pathname) => pathname === "/admin",
      },
    ],
    label: "Overview",
  },
  {
    items: [
      {
        href: "/admin/users",
        icon: Persons,
        id: "users",
        label: "Users",
        match: (pathname) => pathname === "/admin/users" || pathname.startsWith("/admin/users/"),
      },
    ],
    label: "People",
  },
  {
    items: [
      {
        href: "/admin/requests",
        icon: ListCheck,
        id: "requests",
        label: "Requests",
        match: (pathname) => pathname === "/admin/requests" || pathname.startsWith("/admin/sessions/"),
      },
    ],
    label: "Activity",
  },
];

export function AdminShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AriaI18nProvider locale="en-US">
      <Sidebar.Provider>
      <Sidebar>
        <AdminBrand />
        <Sidebar.Content>
          <AdminNav pathname={pathname} />
        </Sidebar.Content>
        <Sidebar.Rail />
      </Sidebar>
      <Sidebar.Mobile>
        <AdminBrand />
        <Sidebar.Content>
          <AdminNav pathname={pathname} />
        </Sidebar.Content>
      </Sidebar.Mobile>
      <Sidebar.Main>
        <div className="flex items-center gap-3 px-4 py-3 md:hidden">
          <Sidebar.Trigger />
          <span className="text-sm font-semibold">Admin</span>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 py-8">{children}</div>
      </Sidebar.Main>
    </Sidebar.Provider>
    </AriaI18nProvider>
  );
}

function AdminBrand() {
  return (
    <Sidebar.Header>
      <div className="flex items-center gap-3 px-1 py-2">
        <div className="bg-accent flex size-6 shrink-0 items-center justify-center rounded-md">
          <span className="text-sm font-bold text-white">A</span>
        </div>
        <span className="text-foreground text-sm font-semibold" data-sidebar="label">
          Admin
        </span>
      </div>
    </Sidebar.Header>
  );
}

function AdminNav({ pathname }: { readonly pathname: string }) {
  return (
    <>
      {NAV_SECTIONS.map((section) => (
        <Sidebar.Group key={section.label}>
          <Sidebar.GroupLabel>{section.label}</Sidebar.GroupLabel>
          <Sidebar.Menu aria-label={section.label}>
            {section.items.map((item) => (
              <Sidebar.MenuItem
                href={item.href}
                id={item.id}
                isCurrent={item.match(pathname)}
                key={item.id}
                textValue={item.label}
              >
                <Sidebar.MenuIcon>
                  <item.icon className="size-4" />
                </Sidebar.MenuIcon>
                <Sidebar.MenuLabel>{item.label}</Sidebar.MenuLabel>
              </Sidebar.MenuItem>
            ))}
          </Sidebar.Menu>
        </Sidebar.Group>
      ))}
    </>
  );
}
