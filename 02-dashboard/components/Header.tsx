import { signOut } from '@/app/actions';
import { AddVehicleForm } from './Forms';

export function Header({ email }: { email: string }) {
  return (
    <header className="border-b border-hairline bg-surface/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3 px-5 py-3.5">
        <div className="mr-auto">
          <p className="text-[15px] font-semibold tracking-tight">Lot</p>
          <p className="text-[12px] text-ink-muted">Inventory ageing &amp; price decay</p>
        </div>
        <span className="hidden text-[13px] text-ink-secondary sm:inline">{email}</span>
        <AddVehicleForm />
        <form action={signOut}>
          <button className="rounded-lg px-3 py-2 text-[14px] text-ink-secondary transition-colors hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
