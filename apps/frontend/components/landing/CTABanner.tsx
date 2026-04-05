import Link from 'next/link';

export default function CTABanner() {
  return (
    <section className="px-8 py-20">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[3rem] bg-surface-container-low p-12 text-center">
        <div className="relative z-10 space-y-6">
          <h2 className="font-headline text-3xl font-bold text-on-surface md:text-4xl">
            Tenes un proyecto o buscas uno?
          </h2>
          <p className="mx-auto max-w-xl text-tertiary">
            Crea tu cuenta, explora oportunidades o publica tu propio proyecto. Todo en un solo
            lugar.
          </p>
          <div className="pt-4">
            <Link
              href="/login"
              className="inline-block rounded-xl bg-primary px-12 py-4 font-headline text-lg font-bold text-on-primary shadow-lg shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 active:scale-95"
            >
              Crear mi Cuenta
            </Link>
          </div>
        </div>
        <div className="absolute -mr-16 -mt-16 right-0 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -mb-16 -ml-16 bottom-0 left-0 h-40 w-40 rounded-full bg-secondary/10 blur-3xl" />
      </div>
    </section>
  );
}
