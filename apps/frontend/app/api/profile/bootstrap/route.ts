import { NextResponse } from "next/server"

export async function GET() {
  const bootstrap = {
    profile: {
      nombreCompleto: "Juan Pérez García",
      correoInstitucional: "jperez@uvg.edu.gt",
      carrera: "Ingeniería en Ciencias de la Computación",
      anioAcademico: "3er año",
      biografia: "Estudiante apasionado por el desarrollo de software y la inteligencia artificial.",
      habilidades: ["JavaScript", "React", "Node.js"],
      intereses: ["Inteligencia Artificial", "Desarrollo Web"],
      disponibilidad: "Tiempo parcial",
      modalidadPreferida: "hibrido",
      horarioDisponible: "Lunes a viernes de 14:00 a 18:00",
      objetivoColaboracion: "Quiero participar en proyectos de desarrollo web y aprender sobre machine learning.",
    },
    catalogs: {
      carreras: [
        { id: "1", nombre: "Ingeniería en Ciencias de la Computación" },
        { id: "2", nombre: "Ingeniería en Sistemas" },
        { id: "3", nombre: "Ingeniería Industrial" },
        { id: "4", nombre: "Ingeniería Mecánica" },
        { id: "5", nombre: "Ingeniería Química" },
        { id: "6", nombre: "Administración de Empresas" },
        { id: "7", nombre: "Psicología" },
        { id: "8", nombre: "Arquitectura" },
      ],
      habilidades: [
        { id: "1", nombre: "JavaScript" },
        { id: "2", nombre: "React" },
        { id: "3", nombre: "Node.js" },
        { id: "4", nombre: "Python" },
        { id: "5", nombre: "Java" },
        { id: "6", nombre: "C++" },
        { id: "7", nombre: "SQL" },
        { id: "8", nombre: "Diseño UI/UX" },
        { id: "9", nombre: "Machine Learning" },
        { id: "10", nombre: "Data Analysis" },
        { id: "11", nombre: "Project Management" },
        { id: "12", nombre: "Comunicación" },
      ],
      intereses: [
        { id: "1", nombre: "Inteligencia Artificial" },
        { id: "2", nombre: "Desarrollo Web" },
        { id: "3", nombre: "Desarrollo Móvil" },
        { id: "4", nombre: "Ciencia de Datos" },
        { id: "5", nombre: "Ciberseguridad" },
        { id: "6", nombre: "IoT" },
        { id: "7", nombre: "Blockchain" },
        { id: "8", nombre: "Game Development" },
        { id: "9", nombre: "Cloud Computing" },
        { id: "10", nombre: "DevOps" },
      ],
      disponibilidades: [
        { id: "1", nombre: "Tiempo completo" },
        { id: "2", nombre: "Tiempo parcial" },
        { id: "3", nombre: "Fines de semana" },
        { id: "4", nombre: "Solo noches" },
        { id: "5", nombre: "Flexible" },
      ],
      modalidades: [
        { value: "presencial", label: "Presencial" },
        { value: "remoto", label: "Remoto" },
        { value: "hibrido", label: "Híbrido" },
      ],
    },
  }

  return NextResponse.json(bootstrap)
}
