"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Settings,
  User,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  Target,
  Users,
  Sparkles,
  X,
} from "lucide-react"

// Zod schema for form validation
const profileFormSchema = z.object({
  nombreCompleto: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  correoInstitucional: z.string().email("Ingresa un correo válido").regex(/@uvg\.edu\.gt$/, "Debe ser un correo institucional @uvg.edu.gt"),
  carrera: z.string().min(1, "Selecciona tu carrera"),
  anioAcademico: z.string().min(1, "Selecciona tu año académico"),
  biografia: z.string().max(500, "La biografía no puede exceder 500 caracteres").optional(),
  habilidades: z.array(z.string()).min(1, "Selecciona al menos una habilidad"),
  intereses: z.array(z.string()).min(1, "Selecciona al menos un área de interés"),
  disponibilidad: z.string().min(1, "Selecciona tu disponibilidad"),
  modalidadPreferida: z.string().min(1, "Selecciona tu modalidad preferida"),
  horarioDisponible: z.string().optional(),
  objetivoColaboracion: z.string().optional(),
})

type ProfileFormValues = z.infer<typeof profileFormSchema>

// Catalog data
const carreras = [
  "Ingeniería en Ciencias de la Computación",
  "Ingeniería en Sistemas",
  "Ingeniería Industrial",
  "Ingeniería Mecánica",
  "Ingeniería Electrónica",
  "Ingeniería Química",
  "Ingeniería Civil",
  "Arquitectura",
  "Diseño Industrial",
  "Diseño Gráfico",
  "Comunicación",
  "Psicología",
  "Administración de Empresas",
  "Economía",
  "Derecho",
  "Medicina",
  "Nutrición",
  "Biología",
  "Química",
  "Matemática Aplicada",
]

const aniosAcademicos = [
  "1er año",
  "2do año",
  "3er año",
  "4to año",
  "5to año",
  "Postgrado",
]

const habilidadesCatalog = [
  "Programación",
  "Diseño UX/UI",
  "Análisis de datos",
  "Gestión de proyectos",
  "Comunicación",
  "Liderazgo",
  "Marketing digital",
  "Redacción",
  "Fotografía",
  "Video y edición",
  "Investigación",
  "Diseño gráfico",
  "Desarrollo web",
  "Desarrollo móvil",
  "Machine Learning",
  "Bases de datos",
  "Trabajo en equipo",
  "Resolución de problemas",
  "Presentaciones",
  "Idiomas",
]

const interesesCatalog = [
  "Tecnología",
  "Sostenibilidad",
  "Emprendimiento",
  "Innovación social",
  "Educación",
  "Salud",
  "Arte y cultura",
  "Deportes",
  "Investigación científica",
  "Desarrollo comunitario",
  "Finanzas",
  "Inteligencia artificial",
  "Energías renovables",
  "Diseño",
  "Comunicación",
  "Voluntariado",
  "Liderazgo estudiantil",
  "Networking",
]

const disponibilidades = [
  "Tiempo completo (20+ horas/semana)",
  "Medio tiempo (10-20 horas/semana)",
  "Pocas horas (5-10 horas/semana)",
  "Ocasional (menos de 5 horas/semana)",
]

const modalidades = [
  { value: "presencial", label: "Presencial" },
  { value: "hibrido", label: "Híbrido" },
  { value: "remoto", label: "Remoto" },
]

export default function PerfilPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      nombreCompleto: "Alejandro Robledo",
      correoInstitucional: "rob23456@uvg.edu.gt",
      carrera: "",
      anioAcademico: "",
      biografia: "",
      habilidades: [],
      intereses: [],
      disponibilidad: "",
      modalidadPreferida: "",
      horarioDisponible: "",
      objetivoColaboracion: "",
    },
  })

  const selectedHabilidades = form.watch("habilidades")
  const selectedIntereses = form.watch("intereses")

  async function onSubmit(data: ProfileFormValues) {
    setIsSubmitting(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500))
    console.log(data)
    setIsSubmitting(false)
  }

  const profileCompletion = () => {
    const values = form.getValues()
    let completed = 0
    const total = 8
    if (values.nombreCompleto) completed++
    if (values.correoInstitucional) completed++
    if (values.carrera) completed++
    if (values.anioAcademico) completed++
    if (values.habilidades.length > 0) completed++
    if (values.intereses.length > 0) completed++
    if (values.disponibilidad) completed++
    if (values.modalidadPreferida) completed++
    return Math.round((completed / total) * 100)
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-5xl space-y-6">
            {/* Back Button & Page Header */}
            <div className="space-y-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver al dashboard
              </Link>
              
              <div>
                <h1 className="text-2xl font-bold text-foreground">Perfil académico</h1>
                <p className="mt-1 text-muted-foreground">
                  Completa tu información para recibir mejores recomendaciones de proyectos y oportunidades de colaboración.
                </p>
              </div>
            </div>

            {/* Main Grid */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Left Column - Form */}
              <div className="lg:col-span-2 space-y-6">
                {/* Profile Summary Card */}
                <Card className="border-border/50">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-16 w-16 border-2 border-primary/20">
                        <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                          AR
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground">Alejandro Robledo</h3>
                        <p className="text-sm text-muted-foreground">
                          {form.watch("carrera") || "Carrera no seleccionada"}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          {profileCompletion() < 100 ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                              <AlertCircle className="mr-1 h-3 w-3" />
                              Perfil incompleto
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Perfil actualizado
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {profileCompletion()}% completado
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Form */}
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {/* Información Personal */}
                    <Card className="border-border/50">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <User className="h-5 w-5 text-primary" />
                          Información personal
                        </CardTitle>
                        <CardDescription>
                          Tu información básica de contacto
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <FormField
                          control={form.control}
                          name="nombreCompleto"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nombre completo</FormLabel>
                              <FormControl>
                                <Input placeholder="Tu nombre completo" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="correoInstitucional"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Correo institucional</FormLabel>
                              <FormControl>
                                <Input placeholder="usuario@uvg.edu.gt" {...field} />
                              </FormControl>
                              <FormDescription>
                                Usa tu correo oficial de la universidad
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="biografia"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Biografía breve</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Cuéntanos un poco sobre ti, tus intereses y lo que te motiva..."
                                  className="resize-none"
                                  rows={4}
                                  {...field}
                                />
                              </FormControl>
                              <FormDescription>
                                Máximo 500 caracteres
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>

                    {/* Información Académica */}
                    <Card className="border-border/50">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FolderKanban className="h-5 w-5 text-primary" />
                          Información académica
                        </CardTitle>
                        <CardDescription>
                          Tu carrera y progreso académico
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <FormField
                            control={form.control}
                            name="carrera"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Carrera *</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Selecciona tu carrera" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {carreras.map((carrera) => (
                                      <SelectItem key={carrera} value={carrera}>
                                        {carrera}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="anioAcademico"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Año académico</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Selecciona tu año" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {aniosAcademicos.map((anio) => (
                                      <SelectItem key={anio} value={anio}>
                                        {anio}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Habilidades e Intereses */}
                    <Card className="border-border/50">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-primary" />
                          Habilidades e intereses
                        </CardTitle>
                        <CardDescription>
                          Selecciona las áreas donde puedes contribuir y lo que te interesa
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <FormField
                          control={form.control}
                          name="habilidades"
                          render={() => (
                            <FormItem>
                              <FormLabel>Habilidades *</FormLabel>
                              <FormDescription>
                                Selecciona las habilidades que dominas o estás desarrollando
                              </FormDescription>
                              
                              {/* Selected Habilidades */}
                              {selectedHabilidades.length > 0 && (
                                <div className="flex flex-wrap gap-2 py-2">
                                  {selectedHabilidades.map((hab) => (
                                    <Badge
                                      key={hab}
                                      variant="secondary"
                                      className="bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer gap-1"
                                      onClick={() => {
                                        const current = form.getValues("habilidades")
                                        form.setValue(
                                          "habilidades",
                                          current.filter((h) => h !== hab),
                                          { shouldValidate: true }
                                        )
                                      }}
                                    >
                                      {hab}
                                      <X className="h-3 w-3" />
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                                {habilidadesCatalog.map((item) => (
                                  <FormField
                                    key={item}
                                    control={form.control}
                                    name="habilidades"
                                    render={({ field }) => {
                                      const isSelected = field.value?.includes(item)
                                      return (
                                        <FormItem
                                          key={item}
                                          className="flex items-center space-x-2 space-y-0"
                                        >
                                          <FormControl>
                                            <Checkbox
                                              checked={isSelected}
                                              onCheckedChange={(checked) => {
                                                const current = field.value || []
                                                if (checked) {
                                                  field.onChange([...current, item])
                                                } else {
                                                  field.onChange(
                                                    current.filter((value) => value !== item)
                                                  )
                                                }
                                              }}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm font-normal cursor-pointer">
                                            {item}
                                          </FormLabel>
                                        </FormItem>
                                      )
                                    }}
                                  />
                                ))}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="border-t border-border pt-6">
                          <FormField
                            control={form.control}
                            name="intereses"
                            render={() => (
                              <FormItem>
                                <FormLabel>Áreas de interés *</FormLabel>
                                <FormDescription>
                                  Selecciona las áreas en las que te gustaría colaborar
                                </FormDescription>

                                {/* Selected Intereses */}
                                {selectedIntereses.length > 0 && (
                                  <div className="flex flex-wrap gap-2 py-2">
                                    {selectedIntereses.map((int) => (
                                      <Badge
                                        key={int}
                                        variant="secondary"
                                        className="bg-secondary/30 text-secondary-foreground hover:bg-secondary/40 cursor-pointer gap-1"
                                        onClick={() => {
                                          const current = form.getValues("intereses")
                                          form.setValue(
                                            "intereses",
                                            current.filter((i) => i !== int),
                                            { shouldValidate: true }
                                          )
                                        }}
                                      >
                                        {int}
                                        <X className="h-3 w-3" />
                                      </Badge>
                                    ))}
                                  </div>
                                )}

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                                  {interesesCatalog.map((item) => (
                                    <FormField
                                      key={item}
                                      control={form.control}
                                      name="intereses"
                                      render={({ field }) => {
                                        const isSelected = field.value?.includes(item)
                                        return (
                                          <FormItem
                                            key={item}
                                            className="flex items-center space-x-2 space-y-0"
                                          >
                                            <FormControl>
                                              <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={(checked) => {
                                                  const current = field.value || []
                                                  if (checked) {
                                                    field.onChange([...current, item])
                                                  } else {
                                                    field.onChange(
                                                      current.filter((value) => value !== item)
                                                    )
                                                  }
                                                }}
                                              />
                                            </FormControl>
                                            <FormLabel className="text-sm font-normal cursor-pointer">
                                              {item}
                                            </FormLabel>
                                          </FormItem>
                                        )
                                      }}
                                    />
                                  ))}
                                </div>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Disponibilidad y Preferencias */}
                    <Card className="border-border/50">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Target className="h-5 w-5 text-primary" />
                          Disponibilidad y preferencias
                        </CardTitle>
                        <CardDescription>
                          Tu tiempo disponible y cómo prefieres colaborar
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <FormField
                            control={form.control}
                            name="disponibilidad"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Disponibilidad *</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Selecciona tu disponibilidad" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {disponibilidades.map((disp) => (
                                      <SelectItem key={disp} value={disp}>
                                        {disp}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="modalidadPreferida"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Modalidad preferida *</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Selecciona modalidad" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {modalidades.map((mod) => (
                                      <SelectItem key={mod.value} value={mod.value}>
                                        {mod.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="horarioDisponible"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Horario disponible</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Ej: Lunes a viernes de 14:00 a 18:00"
                                  {...field}
                                />
                              </FormControl>
                              <FormDescription>
                                Indica tus horarios preferidos para colaborar
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="objetivoColaboracion"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Objetivo de colaboración</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Describe qué tipo de proyectos te gustaría realizar o en qué áreas deseas crecer..."
                                  className="resize-none"
                                  rows={3}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>

                    {/* Action Buttons */}
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <Button variant="outline" type="button" asChild>
                        <Link href="/dashboard">Cancelar</Link>
                      </Button>
                      <Button
                        type="submit"
                        className="bg-primary hover:bg-primary/90"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Guardando..." : "Guardar perfil"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>

              {/* Right Column - Helper Panel */}
              <div className="space-y-6">
                {/* Benefits Card */}
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5 sticky top-6">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-primary/10 p-1.5">
                        <Lightbulb className="h-4 w-4 text-primary" />
                      </div>
                      <CardTitle className="text-base font-semibold">
                        Por qué completar tu perfil
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Target className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Mejores recomendaciones
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Proyectos alineados con tus habilidades e intereses
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Users className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Mayor visibilidad
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Los organizadores pueden encontrarte más fácil
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Sparkles className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Oportunidades relevantes
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Acceso a proyectos que realmente te interesan
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground">
                        Los perfiles completos tienen un 3x más de probabilidad de ser contactados para proyectos.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Tips Card */}
                <Card className="border-border/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-muted-foreground">
                      Consejos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                        <span>Sé específico en tu biografía</span>
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                        <span>Selecciona habilidades que puedas demostrar</span>
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                        <span>Mantén tu disponibilidad actualizada</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
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
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", active: false },
    { icon: FolderKanban, label: "Proyectos", href: "/dashboard/proyectos", active: false },
    { icon: FileText, label: "Mis aplicaciones", href: "/dashboard/aplicaciones", active: false },
    { icon: User, label: "Perfil", href: "/dashboard/perfil", active: true },
    { icon: Settings, label: "Configuración", href: "/dashboard/configuracion", active: false },
  ]

  return (
    <aside className="hidden w-64 flex-col border-r border-border bg-card lg:flex">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <span className="text-lg font-bold text-primary-foreground">U</span>
        </div>
        <span className="text-xl font-bold text-foreground">
          UVG <span className="text-primary">Collab</span>
        </span>
      </div>

      {/* Navigation */}
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

      {/* User Section at Bottom */}
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border-2 border-primary/20">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">AR</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">Alejandro Robledo</p>
            <p className="text-xs text-muted-foreground truncate">Ingeniería en Sistemas</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
