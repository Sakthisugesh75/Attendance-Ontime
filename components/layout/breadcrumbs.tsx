"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { breadcrumbsFor } from "@/lib/palette";
import { NAV } from "./nav";

/** "Section › Page" in the top bar; detail pages read "Employees › Profile". Phones show the last crumb only. */
export function Breadcrumbs() {
  const crumbs = breadcrumbsFor(usePathname(), NAV);
  if (!crumbs.length) return null;
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap gap-1.5 text-[13px]">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={`${c.label}-${i}`}>
              {last ? (
                <BreadcrumbItem className="min-w-0">
                  <h1 aria-current="page" className="truncate font-display text-[15px] font-semibold text-foreground">
                    {c.label}
                  </h1>
                </BreadcrumbItem>
              ) : (
                <>
                  <BreadcrumbItem className="hidden shrink-0 lg:inline-flex">
                    {c.href ? (
                      <BreadcrumbLink asChild>
                        <Link href={c.href}>{c.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <span>{c.label}</span>
                    )}
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden lg:block" />
                </>
              )}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
