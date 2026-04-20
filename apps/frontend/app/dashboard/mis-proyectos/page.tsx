"use client"

import { useEffect, useState, useCallback, type ElementType } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  FolderKanban,
  CheckCircle2,
  Users,
  Calendar,
  Briefcase,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  FolderOpen,
  Settings2,
  Loader2,
  Monitor,
} from "lucide-react"

type ProjectStatus =
  | "BORRADOR"
  | "PUBLICADO"
  | "EN_PROGRESO"
  | "FINALIZADO"
  | "PAUSADO"
  | "CANCELADO"

interface Project {
  idProyecto: number
  tituloProyecto: string
  descripcionProyecto: string
  estadoProyecto: ProjectStatus
  tipoProyecto: string
  modalidadProyecto: string
  fechaCreacion: string
  fechaPublicacion: string | null
  cantidadPostulaciones: number
  rolesCubiertos: number
  rolesTotales: number
}

const statusConfig: Record<ProjectStatus, { label: string; className: string }> = {
  BORRADOR: {
    label: "Borrador",
    className: "bg-gray-100 text-gray-700 border-gray-300",
  },
  PUBLICADO: {
    label: "Publicado",
    className: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
  EN_PROGRESO: {
    label: "En progreso",
    className: "bg-teal-100 text-teal-800 border-teal-300",
  },
  FINALIZADO: {
    label: "Finalizado",
    className: "bg-slate-200 text-slate-700 border-slate-400",
  },
  PAUSADO: {
    label: "Pausado",
    className: "bg-amber-100 text-amber-800 border-amber-300",
  },
  CANCELADO: {
    label: "Cancelado",
    className: "bg-red-100 text-red-700 border-red-300",
  },
}

const statusOptions: ProjectStatus[] = [
  "BORRADOR",
  "PUBLICADO",
  "EN_PROGRESO",
  "FINALIZADO",
  "PAUSADO",
  "CANCELADO",
]

function formatDate(dateString: string | null): string {
  if (!dateString) return "—"
  return new Date(dateString).toLocaleDateString("es-GT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function SummaryCardSkeleton() {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-12" />
          </div>
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  )
}

function ProjectCardSkeleton() {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-6 w-3/5" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-28" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="ml-auto h-9 w-40" />
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  iconBg,
}: {
  title: string
  value: number
  icon: ElementType
  iconBg: string
}) {
  return (
    <Card className="border shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
            <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
          </div>
          <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <Card className="border border-dashed shadow-sm">
      <CardContent className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <FolderOpen className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Sin proyectos todavía</h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Aún no tienes proyectos creados. Ingresa al módulo de proyectos para comenzar.
        </p>
        <Button asChild className="mt-5">
          <Link href="/dashboard/proyectos">Ir a proyectos</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function ProjectCard({
  project,
  selectedStatus,
  onSelectStatus,
  onUpdateStatus,
  isUpdating,
}: {
  project: Project
  selectedStatus: ProjectStatus
  onSelectStatus: (status: ProjectStatus) => void
  onUpdateStatus: () => void
  isUpdating: boolean
}) {
  const statusInfo = statusConfig[project.estadoProyecto]
  const hasChanges = selectedStatus !== project.estadoProyecto

  return (
    <Card className="border shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="line-clamp-1 text-lg font-semibold leading-tight text-foreground">
            {project.tituloProyecto}
          </CardTitle>
          <Badge
            variant="outline"
            className={`shrink-0 border px-2.5 py-0.5 text-xs font-medium ${statusInfo.className}`}
          >
            {statusInfo.label}
          </Badge>
        </div>
        <CardDescription className="mt-1.5 line-clamp-2 text-sm">
          {project.descripcionProyecto}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="bg-primary/10 text-primary text-xs font-medium">
            <Briefcase className="mr-1 h-3 w-3" />
            {project.tipoProyecto}
          </Badge>

          <Badge variant="secondary" className="bg-secondary/20 text-foreground text-xs font-medium">
            <Monitor className="mr-1 h-3 w-3" />
            {project.modalidadProyecto}
          </Badge>

          <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs font-medium">
            <Calendar className="mr-1 h-3 w-3" />
            {formatDate(project.fechaPublicacion || project.fechaCreacion)}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">{project.cantidadPostulaciones}</span>
            postulaciones
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">
              {project.rolesCubiertos}/{project.rolesTotales}
            </span>
            roles cubiertos
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Select
            value={selectedStatus}
            onValueChange={(value) => onSelectStatus(value as ProjectStatus)}
            disabled={isUpdating}
          >
            <SelectTrigger className="h-9 w-[160px] text-sm">
              <Settings2 className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {statusConfig[status].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            disabled={isUpdating || !hasChanges}
            onClick={onUpdateStatus}
            className="h-9"
          >
            {isUpdating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Actualizar estado
          </Button>

          <Button variant="outline" size="sm" asChild className="ml-auto h-9">
            <Link href={`/dashboard/proyectos/${project.idProyecto}`}>
              Gestionar postulaciones
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function MisProyectosPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStatuses, setSelectedStatuses] = useState<Record<number, ProjectStatus>>({})
  const [updatingProjectId, setUpdatingProjectId] = useState<number | null>(null)
  const [notification, setNotification] = useState<{
    type: "success" | "error"
    message: string
  } | null>(null)

  const fetchProjects = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/projects/mine", { cache: "no-store" })
      if (!response.ok) throw new Error("Error al cargar los proyectos")

      const data: Project[] = await response.json()
      setProjects(data)

      const initialStatuses: Record<number, ProjectStatus> = {}
      data.forEach((project) => {
        initialStatuses[project.idProyecto] = project.estadoProyecto
      })
      setSelectedStatuses(initialStatuses)
    } catch {
      setError("No se pudieron cargar tus proyectos.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    if (!notification) return
    const timer = setTimeout(() => setNotification(null), 4000)
    return () => clearTimeout(timer)
  }, [notification])

  const handleUpdateStatus = async (projectId: number) => {
    const newStatus = selectedStatuses[projectId]
    const currentProject = projects.find((project) => project.idProyecto === projectId)

    if (!newStatus || !currentProject) return

    setUpdatingProjectId(projectId)
    setNotification(null)

    try {
      const response = await fetch(`/api/projects/${projectId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estadoProyecto: newStatus }),
      })

      if (!response.ok) {
        throw new Error("Error al actualizar")
      }

      setProjects((prev) =>
        prev.map((project) =>
          project.idProyecto === projectId
            ? { ...project, estadoProyecto: newStatus }
            : project,
        ),
      )

      setNotification({
        type: "success",
        message: "Estado actualizado correctamente",
      })
    } catch {
      setNotification({
        type: "error",
        message: "No se pudo actualizar el estado",
      })

      setSelectedStatuses((prev) => ({
        ...prev,
        [projectId]: currentProject.estadoProyecto,
      }))
    } finally {
      setUpdatingProjectId(null)
    }
  }

  const summary = {
    total: projects.length,
    active: projects.filter(
      (project) =>
        project.estadoProyecto === "PUBLICADO" ||
        project.estadoProyecto === "EN_PROGRESO",
    ).length,
    applications: projects.reduce(
      (sum, project) => sum + project.cantidadPostulaciones,
      0,
    ),
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Mis proyectos</h1>
          <p className="mt-1 text-muted-foreground">
            Administra tus proyectos creados y gestiona las postulaciones recibidas.
          </p>
        </header>

        {notification && (
          <div
            className={`mb-6 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${
              notification.type === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-red-300 bg-red-50 text-red-800"
            }`}
            role="alert"
          >
            {notification.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {notification.message}
          </div>
        )}

        <section className="mb-8" aria-label="Resumen de proyectos">
          <div className="grid gap-4 sm:grid-cols-3">
            {isLoading ? (
              <>
                <SummaryCardSkeleton />
                <SummaryCardSkeleton />
                <SummaryCardSkeleton />
              </>
            ) : (
              <>
                <SummaryCard
                  title="Total de proyectos"
                  value={summary.total}
                  icon={FolderKanban}
                  iconBg="bg-primary"
                />
                <SummaryCard
                  title="Proyectos activos"
                  value={summary.active}
                  icon={CheckCircle2}
                  iconBg="bg-emerald-600"
                />
                <SummaryCard
                  title="Postulaciones recibidas"
                  value={summary.applications}
                  icon={Users}
                  iconBg="bg-secondary"
                />
              </>
            )}
          </div>
        </section>

        <section aria-label="Lista de proyectos">
          {isLoading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ProjectCardSkeleton />
              <ProjectCardSkeleton />
              <ProjectCardSkeleton />
              <ProjectCardSkeleton />
            </div>
          ) : error ? (
            <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
              <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
              <p className="text-sm text-foreground">{error}</p>
              <Button onClick={fetchProjects} variant="outline" size="sm" className="ml-0 sm:ml-2">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Reintentar
              </Button>
            </div>
          ) : projects.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {projects.map((project) => (
                <ProjectCard
                  key={project.idProyecto}
                  project={project}
                  selectedStatus={selectedStatuses[project.idProyecto] || project.estadoProyecto}
                  onSelectStatus={(status) =>
                    setSelectedStatuses((prev) => ({
                      ...prev,
                      [project.idProyecto]: status,
                    }))
                  }
                  onUpdateStatus={() => handleUpdateStatus(project.idProyecto)}
                  isUpdating={updatingProjectId === project.idProyecto}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
