"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The charts (recharts is large) load only when the admin overview actually shows them, so the
 * employee dashboard and the phone app don't download them. This has to be a client component:
 * dynamic() from a server component still ships the chunk with the page. Placeholders keep the
 * layout still while a chart loads.
 */
const charts = () => import("./overview-charts");

export const TrendChart = dynamic(() => charts().then((m) => m.TrendChart), { ssr: false, loading: () => <Skeleton className="h-[19rem] w-full rounded-lg" /> });
export const LateByEmployeeChart = dynamic(() => charts().then((m) => m.LateByEmployeeChart), { ssr: false, loading: () => <Skeleton className="h-48 w-full rounded-lg" /> });
export const MixDonut = dynamic(() => charts().then((m) => m.MixDonut), { ssr: false, loading: () => <Skeleton className="h-44 w-full rounded-lg" /> });
export const HoursHeatmap = dynamic(() => charts().then((m) => m.HoursHeatmap), { ssr: false, loading: () => <Skeleton className="h-56 w-full rounded-lg" /> });
