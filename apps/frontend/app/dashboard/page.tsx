'use client';

import Link from 'next/link';
import {
  LayoutDashboard,
  FolderOpen,
  ClipboardCheck,
  Settings,
  Search,
  Bell,
  Grid3X3,
  Plus,
  GraduationCap,
  HeartHandshake,
  Zap,
  Clock,
  MapPin,
  Eye,
  Calendar,
} from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <TopNavBar />
      <SideNavBar />

      <main className="min-h-screen px-8 pb-12 pt-24 md:ml-64">
        {/* Welcome */}
        <section className="mb-12">
          <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-secondary">
            Bienvenido de vuelta
          </span>
          <h1 className="font-headline text-4xl font-black tracking-tighter text-on-surface md:text-5xl">
            Hola, Alejandro
          </h1>
          <p className="mt-2 max-w-2xl text-lg text-on-surface-variant">
            Tu progreso academico este semestre es excepcional. Tienes 3 nuevas oportunidades
            de beca que coinciden con tu perfil.
          </p>
        </section>

        {/* Stats */}
        <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          <StatCard
            label="Horas Beca Acumuladas"
            value="124"
            suffix="/ 150"
            progress={82}
            icon={<GraduationCap className="h-16 w-16" />}
            iconColor="text-primary/5"
          />
          <StatCardBadge
            label="Horas de Extension"
            value="45"
            suffix="HRS"
            badge="+12 este mes"
            icon={<HeartHandshake className="h-16 w-16" />}
            iconColor="text-secondary/5"
            valueColor="text-secondary"
            badgeBg="bg-secondary-container"
            badgeColor="text-on-secondary-container"
          />
          <div className="relative flex h-48 flex-col justify-between overflow-hidden rounded-xl bg-primary p-8 text-on-primary">
            <div className="relative z-10">
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-primary-container">
                Proyectos Activos
              </span>
              <span className="text-5xl font-black leading-none tracking-tighter">02</span>
            </div>
            <div className="relative z-10 flex gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
                <Calendar className="h-5 w-5 text-white" />
              </div>
            </div>
            <Zap className="absolute -bottom-4 -right-4 h-20 w-20 text-white/10" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Column */}
          <div className="space-y-12 lg:col-span-8">
            <RecommendedProjects />
            <ApplicationsStatus />
          </div>

          {/* Right Column */}
          <div className="space-y-8 lg:col-span-4">
            <UpcomingDates />
            <NewsCard />
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------- Top Nav ---------- */
function TopNavBar() {
  return (
    <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between bg-white/80 px-8 shadow-[0_20px_40px_rgba(24,28,32,0.06)] backdrop-blur-xl">
      <div className="flex items-center gap-8">
        <span className="font-headline text-2xl font-black tracking-tighter text-green-800">
          UVG Scholar
        </span>
        <nav className="hidden gap-6 md:flex">
          <a href="#" className="border-b-2 border-green-800 py-5 font-bold text-green-800">
            Dashboard
          </a>
          <Link
            href="/dashboard/proyectos"
            className="px-2 py-5 text-slate-500 transition-colors hover:bg-slate-100"
          >
            Projects
          </Link>
          <Link
            href="/dashboard/mis-postulaciones"
            className="px-2 py-5 text-slate-500 transition-colors hover:bg-slate-100"
          >
            My Applications
          </Link>
          <a href="#" className="px-2 py-5 text-slate-500 transition-colors hover:bg-slate-100">
            Settings
          </a>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Search projects..."
            className="w-64 rounded-xl border-none bg-surface-container-low py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary"
          />
        </div>
        <button className="rounded-full p-2 transition-colors hover:bg-slate-100">
          <Bell className="h-5 w-5 text-on-surface-variant" />
        </button>
        <button className="rounded-full p-2 transition-colors hover:bg-slate-100">
          <Grid3X3 className="h-5 w-5 text-on-surface-variant" />
        </button>
        <div className="h-8 w-8 rounded-full border border-outline-variant/30 bg-primary-container" />
      </div>
    </header>
  );
}

/* ---------- Side Nav ---------- */
function SideNavBar() {
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard', active: true },
    { icon: FolderOpen, label: 'Projects', href: '/dashboard/proyectos', active: false },
    { icon: ClipboardCheck, label: 'My Applications', href: '/dashboard/mis-postulaciones', active: false },
    { icon: Settings, label: 'Settings', href: '#', active: false },
  ];

  return (
    <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col gap-y-2 bg-slate-50 pt-20 md:flex">
      <div className="mb-8 px-6">
        <h2 className="font-headline text-lg font-bold text-green-900">Academic Ledger</h2>
        <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Student Portal
        </p>
      </div>
      <nav className="flex flex-col gap-y-1">
        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`mx-2 flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200 ${
              item.active
                ? 'bg-white text-green-800 shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/50 hover:text-green-700'
            }`}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto px-4 pb-8">
        <Link
          href="/dashboard/proyectos"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-on-primary shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus className="h-5 w-5" />
          New Project
        </Link>
      </div>
    </aside>
  );
}

/* ---------- Stat Cards ---------- */
function StatCard({
  label,
  value,
  suffix,
  progress,
  icon,
  iconColor,
}: {
  label: string;
  value: string;
  suffix: string;
  progress: number;
  icon: React.ReactNode;
  iconColor: string;
}) {
  return (
    <div className="relative flex h-48 flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-8">
      <div className="relative z-10">
        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-tertiary">
          {label}
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-black leading-none tracking-tighter text-primary">
            {value}
          </span>
          <span className="text-lg font-bold text-primary-container">{suffix}</span>
        </div>
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
        <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
      </div>
      <div className={`absolute -bottom-4 -right-4 ${iconColor}`}>{icon}</div>
    </div>
  );
}

function StatCardBadge({
  label,
  value,
  suffix,
  badge,
  icon,
  iconColor,
  valueColor,
  badgeBg,
  badgeColor,
}: {
  label: string;
  value: string;
  suffix: string;
  badge: string;
  icon: React.ReactNode;
  iconColor: string;
  valueColor: string;
  badgeBg: string;
  badgeColor: string;
}) {
  return (
    <div className="relative flex h-48 flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-8">
      <div className="relative z-10">
        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-tertiary">
          {label}
        </span>
        <div className="flex items-baseline gap-2">
          <span className={`text-5xl font-black leading-none tracking-tighter ${valueColor}`}>
            {value}
          </span>
          <span className={`text-lg font-bold ${badgeBg.replace('bg-', 'text-')}`}>{suffix}</span>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeBg} ${badgeColor}`}
        >
          {badge}
        </span>
      </div>
      <div className={`absolute -bottom-4 -right-4 ${iconColor}`}>{icon}</div>
    </div>
  );
}

/* ---------- Recommended Projects ---------- */
function RecommendedProjects() {
  const projects = [
    {
      id: 1,
      tag: 'Hora Beca',
      tagBg: 'bg-secondary-container text-on-secondary-container',
      code: 'PRJ-2024',
      title: 'Asistente de Investigacion',
      description:
        'Colaboracion en el Laboratorio de Innovacion para el desarrollo de sensores inteligentes aplicados a agricultura.',
      meta: '10 hrs/semana',
      metaIcon: <Clock className="h-4 w-4" />,
    },
    {
      id: 2,
      tag: 'Extension',
      tagBg: 'bg-surface-container-highest text-tertiary',
      code: 'PRJ-2983',
      title: 'Apoyo en Evento de Asociacion',
      description:
        'Logistica y soporte tecnico durante el Congreso Nacional de Estudiantes de Ciencias 2024.',
      meta: 'Campus Central',
      metaIcon: <MapPin className="h-4 w-4" />,
    },
  ];

  return (
    <section>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="font-headline text-2xl font-black tracking-tight">
            Proyectos Recomendados
          </h2>
          <p className="text-sm text-on-surface-variant">
            Basado en tus habilidades de Ingenieria
          </p>
        </div>
        <Link
          href="/dashboard/proyectos"
          className="text-sm font-bold text-primary hover:underline"
        >
          Ver todos
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {projects.map((p) => (
          <div
            key={p.id}
            className="group rounded-xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-4 flex items-start justify-between">
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${p.tagBg}`}
              >
                {p.tag}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                ID: {p.code}
              </span>
            </div>
            <h3 className="mb-2 text-lg font-bold text-on-surface transition-colors group-hover:text-primary">
              {p.title}
            </h3>
            <p className="mb-6 line-clamp-2 text-sm text-on-surface-variant">{p.description}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-on-surface-variant">
                {p.metaIcon}
                {p.meta}
              </div>
              <button className="rounded-xl bg-surface-container-high px-6 py-2 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary">
                Aplicar
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Applications Status ---------- */
function ApplicationsStatus() {
  const apps = [
    {
      name: 'Tutor de Matematicas I',
      dept: 'Departamento de Educacion',
      date: '12 Oct, 2023',
      status: 'En Revision',
      statusBg: 'bg-blue-100 text-blue-800',
    },
    {
      name: 'Digitalizacion de Archivos',
      dept: 'Biblioteca Central',
      date: '05 Oct, 2023',
      status: 'Aceptado',
      statusBg: 'bg-green-100 text-green-800',
    },
    {
      name: 'Soporte TI Nocturno',
      dept: 'Laboratorios de Computo',
      date: '28 Sep, 2023',
      status: 'Entrevista',
      statusBg: 'bg-amber-100 text-amber-800',
    },
  ];

  return (
    <section>
      <h2 className="mb-6 font-headline text-2xl font-black tracking-tight">
        Estado de Aplicaciones
      </h2>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Proyecto
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Fecha
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Estado
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Accion
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {apps.map((a, i) => (
                <tr key={i}>
                  <td className="px-6 py-5">
                    <div className="text-sm font-bold text-on-surface">{a.name}</div>
                    <div className="text-xs text-on-surface-variant">{a.dept}</div>
                  </td>
                  <td className="px-6 py-5 text-sm text-on-surface-variant">{a.date}</td>
                  <td className="px-6 py-5">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${a.statusBg}`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <button className="text-primary">
                      <Eye className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ---------- Upcoming Dates ---------- */
function UpcomingDates() {
  const events = [
    { month: 'OCT', day: '24', title: 'Entrega Reporte Horas', sub: 'Investigacion Sensores', color: 'bg-error/10 text-error' },
    { month: 'OCT', day: '28', title: 'Reunion de Avance', sub: 'Depto. Innovacion', color: 'bg-primary/10 text-primary' },
    { month: 'NOV', day: '02', title: 'Cierre de Convocatoria', sub: 'Becas de Verano', color: 'bg-secondary/10 text-secondary' },
  ];

  return (
    <div className="rounded-xl bg-surface-container-low p-6">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="font-headline text-lg font-black tracking-tight">Proximas Fechas</h3>
        <Calendar className="h-5 w-5 text-primary" />
      </div>
      <div className="space-y-4">
        {events.map((e, i) => (
          <div key={i} className="group flex items-center gap-4 rounded-lg bg-white p-4">
            <div
              className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded ${e.color}`}
            >
              <span className="text-xs font-bold">{e.month}</span>
              <span className="text-lg font-black leading-none">{e.day}</span>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-on-surface group-hover:text-primary">
                {e.title}
              </h4>
              <p className="text-xs text-on-surface-variant">{e.sub}</p>
            </div>
          </div>
        ))}
      </div>
      <button className="mt-6 w-full py-2 text-xs font-bold uppercase tracking-widest text-primary hover:underline">
        Ver calendario completo
      </button>
    </div>
  );
}

/* ---------- News Card ---------- */
function NewsCard() {
  return (
    <div className="group relative h-64 overflow-hidden rounded-xl bg-slate-900">
      <img
        alt="UVG Campus"
        className="absolute inset-0 h-full w-full object-cover opacity-40 transition-transform duration-700 group-hover:scale-105"
        src="https://lh3.googleusercontent.com/aida-public/AB6AXuBifKYl2ZPwNxUUrxL1zg895S9VG8AYf5WAQ2wVk_TcR3BgmShDFM4jDR_98CGHPF8DoPjfrQntosl2LdZIMYKe03ecZWYZsiq-hlfDygtpjhV201YXBU7h3tHlwJV2eg5UyCJS5XC3yn-7mktHRzhAUetPu-D_OxH6PVA1paFhEU0miKy9WhXiIWzQaxhNi0DuBxPJMKlzVaYQPtSNFJqUAU_Eov67uDapmxcsrSaPdnrXf5bZv0gazXR6Ztjxw1d8O4AX3_2xTw"
      />
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-6">
        <h3 className="mb-1 text-lg font-bold text-white">UVG Institutional News</h3>
        <p className="text-xs text-white/70">
          Nueva convocatoria para proyectos de sostenibilidad ambiental abierta hasta Diciembre.
        </p>
        <button className="mt-4 text-xs font-black uppercase tracking-tighter text-white underline underline-offset-4">
          Leer mas
        </button>
      </div>
    </div>
  );
}
