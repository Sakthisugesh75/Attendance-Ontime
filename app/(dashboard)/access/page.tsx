import { ActivityOverviewView } from "@/components/access/activity-overview";
import { AccessTabs } from "@/components/access/access-tabs";
import { RolesView } from "@/components/access/roles-view";
import { UsersView } from "@/components/access/users-view";
import { PageHeader } from "@/components/layout/page-header";
import { activityOverview, listAccessUsers, listRoles, roleOptions } from "@/lib/access/queries";
import { requirePermission } from "@/lib/session";
import { parseAccessParams } from "@/lib/validations/access";

export const metadata = { title: "Access & roles" };

export default async function AccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requirePermission("access.manage");
  const params = parseAccessParams(await searchParams);
  const actor = { id: me.id, isSuperAdmin: me.isSuperAdmin, permissions: me.permissions, scope: me.scope };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · access"
        title="Access & roles"
        description="Decide who can do what, see who is signed in, and step in when an account needs help."
      />
      <AccessTabs active={params.tab} />
      {params.tab === "roles" && <RolesView roles={await listRoles()} actor={actor} />}
      {params.tab === "users" && <UsersTab params={params} actor={actor} />}
      {params.tab === "activity" && <ActivityOverviewView data={await activityOverview()} />}
    </div>
  );
}

async function UsersTab({ params, actor }: { params: ReturnType<typeof parseAccessParams>; actor: { id: number; isSuperAdmin: boolean } }) {
  const [list, roles] = await Promise.all([listAccessUsers(params), roleOptions()]);
  return <UsersView list={list} roles={roles} params={params} actor={actor} />;
}
