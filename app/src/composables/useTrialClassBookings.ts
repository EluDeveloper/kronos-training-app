import type { Timestamp } from 'firebase/firestore'
import { addDoc, collection, getCountFromServer, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from '@/plugins/firebase'

// DTO para registrar la clase muestra. Comentarios en español para claridad de cada campo.
export interface TrialClassBooking {
  id?: string
  fullName: string // Nombre completo del participante
  phone: string // Teléfono de contacto
  hasDiscomfort: boolean // Indica si presenta alguna molestia
  discomfortDescription?: string // Descripción de la molestia (opcional)
  hasDisease: boolean // Indica si presenta alguna enfermedad
  diseaseDescription?: string // Detalle de la enfermedad (opcional)
  classDateLabel: string // Etiqueta legible de la fecha seleccionada
  classDate: string // Fecha ISO (YYYY-MM-DD)
  timeSlotLabel: string // Horario seleccionado legible
  timeSlotKey: string // Clave del horario para consultas
  createdAt: Date | Timestamp // Marca de tiempo de creación
  updatedAt?: Date | Timestamp // Marca de tiempo de actualización
}

const COLLECTION_NAME = 'trialClassBookings'
const capacity = 15

export const useTrialClassBookings = () => {
  const bookingsRef = collection(db, COLLECTION_NAME)

  // Obtiene la cantidad de lugares restantes para la fecha y horario solicitados.
  const getRemainingSeats = async (date: string, timeSlotKey: string): Promise<number> => {
    const seatsQuery = query(
      bookingsRef,
      where('classDate', '==', date),
      where('timeSlotKey', '==', timeSlotKey),
    )

    const snapshot = await getCountFromServer(seatsQuery)
    const booked = snapshot.data().count

    return capacity - booked
  }

  // Crea un registro de clase muestra en Firestore.
  const createTrialBooking = async (payload: TrialClassBooking): Promise<void> => {
    await addDoc(bookingsRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  return {
    capacity,
    createTrialBooking,
    getRemainingSeats,
  }
}
