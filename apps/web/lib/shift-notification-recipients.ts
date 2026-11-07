type RecipientUser = { id?: string; firstName: string; normalizedEmail: string };
type Signup = { enteredName: string; status?: string; user?: RecipientUser | null; volunteerProfile?: { user: RecipientUser } | null };
type NamedProfile = { firstName: string; lastName: string; user: RecipientUser };
const key = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

export async function shiftNotificationRecipients(assignments: Signup[], findProfiles: () => Promise<NamedProfile[]>) {
  const active = assignments.filter(a => !a.status || a.status === "ACTIVE");
  const profiles = active.some(a => !a.user && !a.volunteerProfile?.user) ? await findProfiles() : [];
  const recipients = new Map<string, RecipientUser>();
  const notificationNames = new Set<string>();
  const unmatchedNames = new Set<string>();
  for (const signup of active) {
    let user = signup.user || signup.volunteerProfile?.user;
    if (!user) {
      const matches = profiles.filter(p => key(`${p.firstName} ${p.lastName}`) === key(signup.enteredName));
      const accounts = new Map(matches.map(p => [p.user.normalizedEmail, p.user]));
      if (accounts.size === 1) user = [...accounts.values()][0];
    }
    if (user) { recipients.set(user.normalizedEmail, user); notificationNames.add(signup.enteredName); }
    else unmatchedNames.add(signup.enteredName);
  }
  return { recipients: [...recipients.values()], notificationNames: [...notificationNames], unmatchedNames: [...unmatchedNames] };
}
