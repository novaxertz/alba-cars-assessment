import { signIn } from '@/app/actions';
import { SignInForm } from '@/components/Forms';

export const metadata = { title: 'Sign in · Lot' };

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="card rise w-full max-w-sm p-6">
        <h1 className="text-[18px] font-semibold tracking-tight">Lot</h1>
        <p className="mt-1 mb-5 text-[13px] text-ink-secondary">
          Inventory ageing and price decay for a used-car lot.
        </p>

        <SignInForm action={signIn} />

        <div className="mt-6 border-t border-hairline pt-4">
          <p className="text-[12px] font-medium text-ink-secondary">Demo accounts</p>
          <p className="mt-1 text-[12px] text-ink-muted">
            Two dealers with separate inventory, so you can see that neither can read the
            other&rsquo;s rows. Credentials are in the README.
          </p>
        </div>
      </div>
    </main>
  );
}
