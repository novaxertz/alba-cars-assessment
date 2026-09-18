import { signOut } from '@/app/actions';
import { AddVehicleForm } from './Forms';

export function Header({ email }: { email: string }) {
  return (
    <header className="border-b border-hairline bg-surface/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1180px] items-center gap-2 px-4 py-3 sm:gap-3 sm:px-5 sm:py-3.5">
        <div className="mr-auto">
          <p className="text-[15px] font-semibold tracking-tight">Lot</p>
          <p className="hidden text-[12px] text-ink-muted sm:block">Inventory ageing &amp; price decay</p>
        </div>
        <span className="hidden text-[13px] text-ink-secondary sm:inline">{email}</span>
        <AddVehicleForm />
        <form action={signOut}>
          <button className="rounded-lg px-2 py-2 text-[13px] whitespace-nowrap text-ink-secondary transition-colors hover:text-ink sm:px-3 sm:text-[14px]">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
