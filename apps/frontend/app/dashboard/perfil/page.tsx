"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useForm, type Control, type FieldPath } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  AlertCircle, ArrowLeft, CheckCircle2, FileText, FolderKanban,
  LayoutDashboard, Lightbulb, Loader2, Settings, Sparkles, Target, User, Users, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"

const schema = z.object({
  nombreCompleto: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  correoInstitucional: z.string().email("Ingresa un correo válido").regex(/@uvg\.edu\.gt$/, "Debe ser un correo institucional @uvg.edu.gt"),
  carrera: z.string().min(1, "Selecciona tu carrera"),
  anioAcademico: z.string().min(1, "Ingresa tu año académico"),
  biografia: z.string().max(500, "La biografía no puede exceder 500 caracteres").optional(),
  habilidades: z.array(z.string()).min(1, "Selecciona al menos una habilidad"),
  intereses: z.array(z.string()).min(1, "Selecciona al menos un área de interés"),
  disponibilidad: z.string().min(1, "Selecciona tu disponibilidad"),
  modalidadPreferida: z.string().min(1, "Selecciona tu modalidad preferida"),
  horarioDisponible: z.string().optional(),
  objetivoColaboracion: z.string().optional(),
})

type FormValues = z.infer<typeof schema>
type Catalog = { id: string; nombre: string }
type Modalidad = { value: string; label: string }
type Bootstrap = {
  profile: FormValues
  catalogs: {
    carreras: Catalog[]
    habilidades: Catalog[]
    intereses: Catalog[]
    disponibilidades: Catalog[]
    modalidades: Modalidad[]
  }
}

async function getProfileBootstrap(): Promise<Bootstrap> {
  const res = await fetch("/api/profile/bootstrap", { method: "GET", headers: { "Content-Type": "application/json" }, cache: "no-store" })
  if (!res.ok) throw new Error("No se pudo cargar la información del perfil")
  return res.json()
}

export default function PerfilPage() {
  const [data, setData] = useState<Bootstrap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombreCompleto: "", correoInstitucional: "", carrera: "", anioAcademico: "", biografia: "",
      habilidades: [], intereses: [], disponibilidad: "", modalidadPreferida: "", horarioDisponible: "", objetivoColaboracion: "",
    },
  })

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError("")
        const bootstrap = await getProfileBootstrap()
        setData(bootstrap)
        form.reset(bootstrap.profile)
      } catch {
        setError("No se pudo cargar la información del perfil.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [form])

  const values = form.watch()
  const completion = useMemo(() => {
    const checks = [values.nombreCompleto, values.correoInstitucional, values.carrera, values.anioAcademico, values.habilidades?.length, values.intereses?.length, values.disponibilidad, values.modalidadPreferida]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  }, [values])

  const initials = (values.nombreCompleto || "U").split(" ").slice(0, 2).map((x) => x[0]).join("").toUpperCase()

  const nav = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", active: false },
    { icon: FolderKanban, label: "Proyectos", href: "/dashboard/proyectos", active: false },
    { icon: FileText, label: "Mis aplicaciones", href: "/dashboard/aplicaciones", active: false },
    { icon: User, label: "Perfil", href: "/dashboard/perfil", active: true },
    { icon: Settings, label: "Configuración", href: "/dashboard/configuracion", active: false },
  ]

  const benefits = [
    ["Mejores recomendaciones", "Proyectos alineados con tus habilidades e intereses", <Target className="h-4 w-4 text-primary" key="t" />],
    ["Mayor visibilidad", "Los organizadores pueden encontrarte más fácil", <Users className="h-4 w-4 text-primary" key="u" />],
    ["Oportunidades relevantes", "Acceso a proyectos que realmente te interesan", <Sparkles className="h-4 w-4 text-primary" key="s" />],
  ] as const

  async function onSubmit(payload: FormValues) {
    try {
      setSaving(true)
      console.log(payload)
      await new Promise((r) => setTimeout(r, 1000))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <StateView icon={<Loader2 className="h-5 w-5 animate-spin text-primary" />} text="Cargando perfil..." />
  if (error || !data) return <StateView icon={<AlertCircle className="h-5 w-5 text-red-600" />} text={error || "Ocurrió un error al cargar la vista."} />

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground">U</span>
          </div>
          <span className="text-xl font-bold text-foreground">UVG <span className="text-primary">Collab</span></span>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {nav.map((item) => (
            <Link key={item.label} href={item.href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${item.active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 font-semibold text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{values.nombreCompleto}</p>
              <p className="truncate text-xs text-muted-foreground">{values.carrera || "Carrera no seleccionada"}</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="space-y-4">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Volver al dashboard
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Perfil académico</h1>
              <p className="mt-1 text-muted-foreground">Completa tu información para recibir mejores recomendaciones de proyectos y oportunidades de colaboración.</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card className="border-border/50">
                <CardContent className="p-5">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 border-2 border-primary/20">
                      <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground">{values.nombreCompleto}</h3>
                      <p className="text-sm text-muted-foreground">{values.carrera || "Carrera no seleccionada"}</p>
                      <div className="mt-2 flex items-center gap-2">
                        {completion < 100 ? (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700"><AlertCircle className="mr-1 h-3 w-3" />Perfil incompleto</Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" />Perfil actualizado</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{completion}% completado</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <Section title="Información personal" description="Tu información básica de contacto" icon={<User className="h-5 w-5 text-primary" />}>
                    <TextField control={form.control} name="nombreCompleto" label="Nombre completo" placeholder="Tu nombre completo" />
                    <TextField control={form.control} name="correoInstitucional" label="Correo institucional" placeholder="usuario@uvg.edu.gt" description="Usa tu correo oficial de la universidad" />
                    <TextAreaField control={form.control} name="biografia" label="Biografía breve" placeholder="Cuéntanos un poco sobre ti, tus intereses y lo que te motiva..." rows={4} description="Máximo 500 caracteres" />
                  </Section>

                  <Section title="Información académica" description="Tu carrera y progreso académico" icon={<FolderKanban className="h-5 w-5 text-primary" />}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <SelectField control={form.control} name="carrera" label="Carrera *" placeholder="Selecciona tu carrera" options={data.catalogs.carreras.map((x) => ({ value: x.nombre, label: x.nombre }))} />
                      <TextField control={form.control} name="anioAcademico" label="Año académico" placeholder="Ej: 3er año" />
                    </div>
                  </Section>

                  <Section title="Habilidades e intereses" description="Selecciona las áreas donde puedes contribuir y lo que te interesa" icon={<Sparkles className="h-5 w-5 text-primary" />}>
                    <MultiCheckField control={form.control} name="habilidades" label="Habilidades *" description="Selecciona las habilidades que dominas o estás desarrollando" options={data.catalogs.habilidades.map((x) => x.nombre)} badgeClassName="bg-primary/10 text-primary hover:bg-primary/20" />
                    <div className="border-t border-border pt-6">
                      <MultiCheckField control={form.control} name="intereses" label="Áreas de interés *" description="Selecciona las áreas en las que te gustaría colaborar" options={data.catalogs.intereses.map((x) => x.nombre)} badgeClassName="bg-secondary/30 hover:bg-secondary/40" />
                    </div>
                  </Section>

                  <Section title="Disponibilidad y preferencias" description="Tu tiempo disponible y cómo prefieres colaborar" icon={<Target className="h-5 w-5 text-primary" />}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <SelectField control={form.control} name="disponibilidad" label="Disponibilidad *" placeholder="Selecciona tu disponibilidad" options={data.catalogs.disponibilidades.map((x) => ({ value: x.nombre, label: x.nombre }))} />
                      <SelectField control={form.control} name="modalidadPreferida" label="Modalidad preferida *" placeholder="Selecciona modalidad" options={data.catalogs.modalidades.map((x) => ({ value: x.value, label: x.label }))} />
                    </div>
                    <TextField control={form.control} name="horarioDisponible" label="Horario disponible" placeholder="Ej: Lunes a viernes de 14:00 a 18:00" description="Indica tus horarios preferidos para colaborar" />
                    <TextAreaField control={form.control} name="objetivoColaboracion" label="Objetivo de colaboración" placeholder="Describe qué tipo de proyectos te gustaría realizar o en qué áreas deseas crecer..." rows={3} />
                  </Section>

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button variant="outline" type="button" asChild><Link href="/dashboard">Cancelar</Link></Button>
                    <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={saving}>{saving ? "Guardando..." : "Guardar perfil"}</Button>
                  </div>
                </form>
              </Form>
            </div>

            <div className="space-y-6">
              <Card className="sticky top-6 border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-primary/10 p-1.5"><Lightbulb className="h-4 w-4 text-primary" /></div>
                    <CardTitle className="text-base font-semibold">Por qué completar tu perfil</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {benefits.map(([title, description, icon]) => (
                    <div key={title} className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">{icon}</div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{title}</p>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-border pt-4">
                    <p className="text-xs text-muted-foreground">Los perfiles completos tienen un 3x más de probabilidad de ser contactados para proyectos.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground">Consejos</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {["Sé específico en tu biografía", "Selecciona habilidades que puedas demostrar", "Mantén tu disponibilidad actualizada"].map((tip) => (
                      <li key={tip} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{tip}</span></li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function Section({ title, description, icon, children }: { title: string; description: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">{icon}{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function TextField<T extends FormValues>({ control, name, label, placeholder, description }: { control: Control<T>; name: FieldPath<T>; label: string; placeholder: string; description?: string }) {
  return (
    <FormField control={control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl><Input placeholder={placeholder} {...field} value={field.value ?? ""} /></FormControl>
        {description && <FormDescription>{description}</FormDescription>}
        <FormMessage />
      </FormItem>
    )} />
  )
}

function TextAreaField<T extends FormValues>({ control, name, label, placeholder, rows = 3, description }: { control: Control<T>; name: FieldPath<T>; label: string; placeholder: string; rows?: number; description?: string }) {
  return (
    <FormField control={control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl><Textarea placeholder={placeholder} className="resize-none" rows={rows} {...field} value={field.value ?? ""} /></FormControl>
        {description && <FormDescription>{description}</FormDescription>}
        <FormMessage />
      </FormItem>
    )} />
  )
}

function SelectField<T extends FormValues>({ control, name, label, placeholder, options }: { control: Control<T>; name: FieldPath<T>; label: string; placeholder: string; options: { value: string; label: string }[] }) {
  return (
    <FormField control={control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <Select onValueChange={field.onChange} defaultValue={field.value as string}>
          <FormControl><SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger></FormControl>
          <SelectContent>{options.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
        </Select>
        <FormMessage />
      </FormItem>
    )} />
  )
}

function MultiCheckField<T extends FormValues>({ control, name, label, description, options, badgeClassName }: { control: Control<T>; name: FieldPath<T>; label: string; description: string; options: string[]; badgeClassName?: string }) {
  return (
    <FormField control={control} name={name} render={({ field }) => {
      const values = (field.value as string[]) || []
      return (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormDescription>{description}</FormDescription>
          {values.length > 0 && (
            <div className="flex flex-wrap gap-2 py-2">
              {values.map((item) => (
                <Badge key={item} variant="secondary" className={`cursor-pointer gap-1 ${badgeClassName || ""}`} onClick={() => field.onChange(values.filter((v) => v !== item))}>
                  {item}<X className="h-3 w-3" />
                </Badge>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3">
            {options.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <Checkbox checked={values.includes(option)} onCheckedChange={(checked) => field.onChange(checked ? [...values, option] : values.filter((v) => v !== option))} />
                <label className="cursor-pointer text-sm font-normal">{option}</label>
              </div>
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )
    }} />
  )
}

function StateView({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{icon}<span>{text}</span></div>
    </div>
  )
