import type { Timestamp } from 'firebase/firestore'
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/plugins/firebase'

// Interface principal para los miembros registrados. Todos los comentarios están en español
// para clarificar el significado de cada campo dentro del modelo.
export interface Member {
  id?: string
  memberNumber: string // Número de socio generado automáticamente
  enrollmentDate: string // Fecha de inscripción en formato ISO

  lastName: string // Apellidos
  firstName: string // Nombre(s)
  birthDate: string // Fecha de nacimiento ISO
  age: number // Edad
  gender: string // Sexo
  maritalStatus: string // Estado civil
  address: string // Dirección
  city: string // Localidad
  neighborhood: string // Colonia
  postalCode: string // Código postal
  email: string // Correo electrónico
  phone: string // Teléfono
  socialProfile: string // Perfil de redes sociales
  membershipCost: number // Costo de la membresía
  discountPercent: number // Descuento aplicado en porcentaje

  emergencyContactName: string // Nombre del contacto de emergencia
  emergencyContactRelation: string // Relación del contacto de emergencia
  emergencyContactPhone: string // Teléfono de emergencia

  profession: string // Profesión actual
  currentlyWorking: boolean // Si está trabajando actualmente
  workerType: string // Tipo de trabajador (privado/autónomo)
  isStudent: boolean // Indica si es estudiante

  hasBoneInjury: boolean // Lesión ósea
  boneInjuryDescription?: string // Descripción de lesión ósea
  hasMuscleInjury: boolean // Lesión muscular
  muscleInjuryDescription?: string // Descripción de lesión muscular
  hasCardioDisease: boolean // Enfermedad cardiovascular
  cardioDiseaseDescription?: string // Descripción de enfermedad cardiovascular
  getsEasilyShortOfBreath: boolean // Se asfixia con facilidad al ejercitarse

  isAsthmatic: boolean // Condición asmática
  isEpileptic: boolean // Condición epiléptica
  isDiabetic: boolean // Condición diabética
  otherCondition?: string // Otras condiciones

  isPregnant: boolean // Embarazo o sospecha
  hasAnemia: boolean // Anemia

  symptomDizziness: boolean // Mareos al ejercitarse
  symptomFainting: boolean // Desmayos al ejercitarse
  symptomNausea: boolean // Náuseas al ejercitarse
  symptomBreathingDifficulty: boolean // Dificultad para respirar al ejercitarse

  hasSportBackground: boolean // Antecedentes deportivos
  hasBeenInGym: boolean // Ha estado inscrito en gimnasio

  createdAt: Date | Timestamp // Fecha de creación del registro
  updatedAt?: Date | Timestamp // Última fecha de actualización
}

const COLLECTION_NAME = 'members'

export const useMembers = () => {
  const membersRef = collection(db, COLLECTION_NAME)

  // Crea un nuevo miembro
  const createMember = async (payload: Member): Promise<void> => {
    await addDoc(membersRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  // Actualiza un miembro existente
  const updateMember = async (id: string, payload: Member): Promise<void> => {
    const memberDoc = doc(db, COLLECTION_NAME, id)

    await updateDoc(memberDoc, {
      ...payload,
      updatedAt: serverTimestamp(),
    })
  }

  // Obtiene un miembro por ID
  const getMemberById = async (id: string): Promise<Member | null> => {
    const memberDoc = doc(db, COLLECTION_NAME, id)
    const snapshot = await getDoc(memberDoc)

    if (!snapshot.exists())
      return null

    const data = snapshot.data() as Member

    return {
      ...data,
      id: snapshot.id,
    }
  }

  // Lista todos los miembros registrados
  const listMembers = async (): Promise<Member[]> => {
    const snapshot = await getDocs(membersRef)

    return snapshot.docs.map(docSnap => ({
      ...(docSnap.data() as Member),
      id: docSnap.id,
    }))
  }

  return {
    createMember,
    getMemberById,
    listMembers,
    updateMember,
  }
}
