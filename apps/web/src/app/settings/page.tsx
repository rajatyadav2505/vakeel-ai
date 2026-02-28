import { requireAppUser } from '@/lib/auth';
import { SettingsConsole } from '@/components/settings/settings-console';

export default async function SettingsPage() {
  const user = await requireAppUser();
  return (
    <SettingsConsole
      user={{
        fullName: user.fullName,
        role: user.role,
        barCouncilId: user.barCouncilId,
      }}
    />
  );
}
