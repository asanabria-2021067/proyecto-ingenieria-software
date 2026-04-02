import Link from "next/link";

export default function CTABanner() {
  return (
    <section className="py-20 px-8">
      <div className="max-w-5xl mx-auto bg-surface-container-low rounded-[3rem] p-12 text-center space-y-8 relative overflow-hidden">
        <div className="relative z-10 space-y-6">
          <h2 className="font-headline font-bold text-3xl md:text-4xl text-on-surface">
            ¿Tenés un proyecto o buscás uno?
          </h2>
          <p className="text-tertiary max-w-xl mx-auto">
            Creá tu cuenta, explorá oportunidades o publicá tu propio proyecto.
            Todo en un solo lugar.
          </p>
          <div className="pt-4">
            <Link
              href="/login"
              className="inline-block bg-primary text-on-primary px-12 py-4 rounded-xl font-headline font-bold text-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200"
            >
              Crear mi Cuenta
            </Link>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary/10 rounded-full -ml-16 -mb-16 blur-3xl" />
      </div>
    </section>
  );
}
