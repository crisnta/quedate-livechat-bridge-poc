import { requireLab } from "@/lib/security/require-lab";
import { OperationsShell } from "@/components/operations/shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireLab();
  return <OperationsShell>{children}</OperationsShell>;
}
