import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, initials } from "@/lib/utils";

/**
 * Photo when there is one, otherwise initials on a neutral sunken disc (DESIGN.md: one action
 * colour, status colours only for statuses, so avatars stay neutral).
 */
export function EmployeeAvatar({ name, photo, className, large }: { name: string; photo: string | null; className?: string; large?: boolean }) {
  return (
    <Avatar className={cn("size-9", className)}>
      {photo && <AvatarImage src={photo} alt="" className="object-cover" />}
      <AvatarFallback className={cn("bg-sunken text-ink-2", large ? "text-title-1" : "text-caption font-semibold")}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
