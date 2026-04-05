import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Settings,
  Search,
  Bell,
  Calendar,
  Clock,
  Users,
  Star,
  TrendingUp,
  ChevronRight,
  MapPin,
  ArrowUpRight,
  Megaphone,
} from "lucide-react"

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Header />

        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            <WelcomeSection />
            <SummaryCards />

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <RecommendedProjects />
                <ApplicationsStatus />
              </div>

              <div className="space-y-6">
                <UpcomingDates />
                <AnnouncementCard />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function Sidebar() {
  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", active: true },
    { icon: FolderKanban, label: "Proyectos", href: "/dashboard/proyectos", active: false },
    { icon: FileText, label: "Mis aplicaciones", href: "/dashboard/aplicaciones", active: false },
    { icon: Settings, label: "Configuración", href: "/dashboard/configuracion", active: false },
  ]

  return (
    <aside className="hidden w-64 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <span className="text-lg font-bold text-primary-foreground">U</span>
        </div>
        <span className="text-xl font-bold text-foreground">
          UVG <span className="text-primary">Collab</span>
        </span>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              item.active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border-2 border-primary/20">
            <AvatarFallback className="bg-primary/10 font-semibold text-primary">
              AR
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              Alejandro Robledo
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Ingeniería en Sistemas
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}

function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-2 lg:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <span className="text-sm font-bold text-primary-foreground">U</span>
        </div>
        <span className="text-lg font-bold text-foreground">UVG Collab</span>
      </div>

      <div className="hidden max-w-md flex-1 md:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar proyectos, asociaciones..."
            className="w-full border-border bg-muted/50 pl-10"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
            3
          </span>
        </Button>
        <Avatar className="h-9 w-9 border-2 border-primary/20 lg:hidden">
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
            AR
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}

function WelcomeSection() {
  return (
    <div className="rounded-xl bg-gradient-to-r from-primary to-primary/80 p-6 text-primary-foreground">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hola, Alejandro</h1>
          <p className="mt-1 text-primary-foreground/90">
            Descubre nuevos proyectos y oportunidades de colaboración que se
            alinean con tus intereses.
          </p>
        </div>
        <Button variant="secondary" className="shrink-0 bg-card text-foreground hover:bg-card/90">
          <FolderKanban className="mr-2 h-4 w-4" />
          Explorar proyectos
        </Button>
      </div>
    </div>
  )
}

function SummaryCards() {
  const stats = [
    {
      title: "Proyectos activos",
      value: "3",
      change: "+1 este mes",
      icon: FolderKanban,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Aplicaciones enviadas",
      value: "7",
      change: "2 pendientes",
      icon: FileText,
      color: "text-secondary",
      bgColor: "bg-secondary/20",
    },
    {
      title: "Oportunidades recomendadas",
      value: "12",
      change: "Basado en tu perfil",
      icon: Star,
      color: "text-amber-600",
      bgColor: "bg-amber-100",
    },
    {
      title: "Horas de colaboración",
      value: "48",
      change: "+12 esta semana",
      icon: TrendingUp,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="border-border/50">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </p>
                <p className="mt-1 text-3xl font-bold text-foreground">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stat.change}
                </p>
              </div>
              <div className={`rounded-lg p-2.5 ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function RecommendedProjects() {
  const projects = [
    {
      id: 1,
      title: "Plataforma de tutorías peer-to-peer",
      description:
        "Desarrollo de una aplicación web para conectar estudiantes que necesitan ayuda con tutores voluntarios.",
      category: "Tecnología",
      status: "Buscando miembros",
      statusColor: "bg-amber-100 text-amber-700",
      team: ["Ing. Sistemas", "Diseño UX", "Educación"],
      members: 4,
      maxMembers: 8,
      deadline: "20 Abr 2026",
      location: "Híbrido",
    },
    {
      id: 2,
      title: "Campaña de reciclaje campus verde",
      description:
        "Iniciativa ambiental para implementar estaciones de reciclaje inteligentes en todo el campus.",
      category: "Sostenibilidad",
      status: "En progreso",
      statusColor: "bg-primary/10 text-primary",
      team: ["Ing. Ambiental", "Comunicación", "Diseño"],
      members: 6,
      maxMembers: 10,
      deadline: "15 May 2026",
      location: "Presencial",
    },
    {
      id: 3,
      title: "Hackathon de innovación social",
      description:
        "Organización de evento de 48 horas enfocado en soluciones tecnológicas para problemas sociales locales.",
      category: "Eventos",
      status: "Buscando miembros",
      statusColor: "bg-amber-100 text-amber-700",
      team: ["Cualquier carrera", "Liderazgo", "Logística"],
      members: 3,
      maxMembers: 12,
      deadline: "30 Jun 2026",
      location: "Presencial",
    },
    {
      id: 4,
      title: "Investigación de UX en apps educativas",
      description:
        "Estudio de usabilidad sobre herramientas digitales utilizadas por estudiantes universitarios.",
      category: "Investigación",
      status: "Próximamente",
      statusColor: "bg-muted text-muted-foreground",
      team: ["Psicología", "Diseño UX", "Estadística"],
      members: 2,
      maxMembers: 6,
      deadline: "10 Jul 2026",
      location: "Remoto",
    },
  ]

  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-lg font-semibold">
            Proyectos disponibles
          </CardTitle>
          <CardDescription>
            Oportunidades recomendadas según tu perfil e intereses
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
          Ver todos
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {projects.map((project) => (
          <div
            key={project.id}
            className="group rounded-lg border border-border/50 bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs font-medium">
                    {project.category}
                  </Badge>
                  <Badge className={`text-xs ${project.statusColor}`}>
                    {project.status}
                  </Badge>
                </div>
                <h3 className="font-semibold text-foreground transition-colors group-hover:text-primary">
                  {project.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {project.description}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {project.members}/{project.maxMembers} miembros
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {project.deadline}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {project.location}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {project.team.map((role) => (
                    <span
                      key={role}
                      className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 sm:flex-col">
                <Button size="sm" className="bg-primary hover:bg-primary/90">
                  Aplicar
                  <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline">
                  Ver detalles
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function UpcomingDates() {
  const events = [
    {
      title: "Reunión equipo Tutorías",
      date: "Hoy",
      time: "14:00",
      type: "Reunión",
      typeColor: "bg-blue-100 text-blue-700",
    },
    {
      title: "Deadline: Propuesta Campus Verde",
      date: "Mañana",
      time: "23:59",
      type: "Entrega",
      typeColor: "bg-red-100 text-red-700",
    },
    {
      title: "Workshop de Design Thinking",
      date: "15 Abr",
      time: "10:00",
      type: "Evento",
      typeColor: "bg-primary/10 text-primary",
    },
    {
      title: "Presentación de avances",
      date: "18 Abr",
      time: "16:00",
      type: "Reunión",
      typeColor: "bg-blue-100 text-blue-700",
    },
  ]

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Calendar className="h-5 w-5 text-primary" />
          Próximas fechas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.map((event, index) => (
          <div
            key={index}
            className="flex items-start gap-3 rounded-lg border border-border/50 p-3"
          >
            <div className="min-w-[50px] rounded-lg bg-muted px-2 py-1 text-center">
              <span className="text-xs font-medium text-muted-foreground">
                {event.date}
              </span>
              <span className="block text-sm font-bold text-foreground">
                {event.time}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {event.title}
              </p>
              <Badge className={`mt-1 text-xs ${event.typeColor}`}>
                {event.type}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ApplicationsStatus() {
  const applications = [
    {
      project: "Plataforma de mentorías",
      appliedDate: "28 Mar 2026",
      status: "Aceptada",
      statusColor: "bg-emerald-100 text-emerald-700",
    },
    {
      project: "App de bienestar estudiantil",
      appliedDate: "25 Mar 2026",
      status: "En revisión",
      statusColor: "bg-amber-100 text-amber-700",
    },
    {
      project: "Revista digital UVG",
      appliedDate: "20 Mar 2026",
      status: "En revisión",
      statusColor: "bg-amber-100 text-amber-700",
    },
    {
      project: "Programa de radio campus",
      appliedDate: "15 Mar 2026",
      status: "Rechazada",
      statusColor: "bg-red-100 text-red-700",
    },
  ]

  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-lg font-semibold">
            Estado de aplicaciones
          </CardTitle>
          <CardDescription>
            Seguimiento de tus postulaciones a proyectos
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
          Ver historial
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-3 text-left text-sm font-medium text-muted-foreground">
                  Proyecto
                </th>
                <th className="hidden pb-3 text-left text-sm font-medium text-muted-foreground sm:table-cell">
                  Fecha
                </th>
                <th className="pb-3 text-left text-sm font-medium text-muted-foreground">
                  Estado
                </th>
                <th className="pb-3 text-right text-sm font-medium text-muted-foreground">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {applications.map((app, index) => (
                <tr key={index} className="group">
                  <td className="py-3">
                    <span className="text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                      {app.project}
                    </span>
                  </td>
                  <td className="hidden py-3 sm:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {app.appliedDate}
                    </span>
                  </td>
                  <td className="py-3">
                    <Badge className={`text-xs ${app.statusColor}`}>
                      {app.status}
                    </Badge>
                  </td>
                  <td className="py-3 text-right">
                    <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
                      Ver
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function AnnouncementCard() {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-primary/10 p-1.5">
            <Megaphone className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">
            Convocatoria abierta
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <h4 className="font-semibold text-foreground">
            Feria de Innovación 2026
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Inscribe tu proyecto para participar en la feria anual de innovación
            y emprendimiento de UVG.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Cierre: 30 Abr 2026</span>
        </div>
        <Button size="sm" className="w-full bg-primary hover:bg-primary/90">
          Inscribir proyecto
        </Button>
      </CardContent>
    </Card>
  )
}
