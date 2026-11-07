import { signOut } from "../auth";

export default function SignOutForm() {
  return (
    <form action={async () => { "use server"; await signOut({ redirectTo: "/sign-in" }); }} className="sign-out-form">
      <button className="account-sign-out" type="submit">Sign out</button>
    </form>
  );
}
