import { cn } from '@/lib/utils';

export function SectionCard(props: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('rounded-2xl border border-[#ded9c9] bg-white/80 p-4 shadow-sm', props.className)}>
      <header className="mb-3">
        <h2 className="font-[Georgia] text-lg font-semibold text-[#1e2a39]">{props.title}</h2>
        {props.subtitle ? <p className="mt-1 text-sm text-[#59667a]">{props.subtitle}</p> : null}
      </header>
      {props.children}
    </section>
  );
}
