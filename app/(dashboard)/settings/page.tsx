import { PageHeader } from "@/components/layout/page-header";
import { CompanySection } from "@/components/settings/company-section";
import { LeaveTypesSection } from "@/components/settings/leave-types-section";
import { OrganisationSection } from "@/components/settings/organisation-section";
import { PoliciesSection } from "@/components/settings/policies-section";
import { PunchingSection } from "@/components/settings/punching-section";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ShiftsSection } from "@/components/settings/shifts-section";
import { WorkingWeekSection } from "@/components/settings/working-week-section";
import { requirePermission } from "@/lib/session";
import { SETTINGS_TABS, settingsTabSchema, type SettingsTab } from "@/lib/validations/settings";
import { companyData, leaveTypesData, organisationData, policiesData, punchingData, shiftsData, workingWeekData } from "./data";

export const metadata = { title: "Settings" };

async function Section({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case "company":
      return <CompanySection company={await companyData()} />;
    case "working-week":
      return <WorkingWeekSection data={await workingWeekData()} />;
    case "shifts":
      return <ShiftsSection shifts={await shiftsData()} />;
    case "leave-types":
      return <LeaveTypesSection data={await leaveTypesData()} />;
    case "policies":
      return <PoliciesSection caps={await policiesData()} />;
    case "punching":
      return <PunchingSection values={await punchingData()} />;
    case "organisation": {
      const d = await organisationData();
      return <OrganisationSection departments={d.departments} designations={d.designations} />;
    }
  }
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("settings.manage");
  const tab = settingsTabSchema.parse((await searchParams).tab);
  const label = SETTINGS_TABS.find((t) => t.key === tab)!.label;

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader eyebrow={`Admin · ${label}`} title="Settings" description="Company details and the rules every attendance calculation follows. Changes are recorded in the audit log." />
      <div className="grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-8">
        <SettingsNav active={tab} />
        <div key={tab} className="rise min-w-0">
          <Section tab={tab} />
        </div>
      </div>
    </div>
  );
}
