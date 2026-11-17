import { HolidaysView } from "@/components/holidays/holidays-view";
import { prisma } from "@/lib/prisma";
import { hasPermission, requireUser } from "@/lib/session";
import { dbToYmd, istDate } from "@/lib/time";
import { holidayYearSchema } from "@/lib/validations/holidays";

export const metadata = { title: "Holidays" };

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const today = istDate();
  const parsed = holidayYearSchema.safeParse((await searchParams).year);
  const year = parsed.success ? parsed.data : Number(today.slice(0, 4));

  const [holidays, years] = await Promise.all([
    prisma.holiday.findMany({
      where: { date: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lte: new Date(`${year}-12-31T00:00:00.000Z`) } },
      orderBy: { date: "asc" },
    }),
    prisma.holiday.findMany({ select: { date: true }, orderBy: { date: "asc" } }),
  ]);
  const yearsWithData = [...new Set(years.map((h) => h.date.getUTCFullYear()))];

  return (
    <HolidaysView
      year={year}
      today={today}
      canEdit={hasPermission(user, "holidays.manage")}
      yearsWithData={yearsWithData}
      holidays={holidays.map((h) => ({ id: h.id, date: dbToYmd(h.date), name: h.name, type: h.type, isDeclared: h.isDeclared }))}
    />
  );
}
