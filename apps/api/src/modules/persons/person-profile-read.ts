import type { Prisma } from '@prisma/client';

export const PERSON_PRESENTATION_SELECT = {
  id: true, name: true, departmentId: true, position: true,
  department: { select: { name: true } },
} satisfies Prisma.PersonProfileSelect;

/** The existing account ID remains the task foreign key. A linked profile is
 * authoritative for personnel presentation; null department is deliberate. */
export function personPresentation(user: {
  id: string; name: string; departmentId: string | null; department?: { name: string } | null;
  personProfile?: { id: string; name: string; departmentId: string | null; position: string | null; department: { name: string } | null } | null;
}) {
  const person = user.personProfile;
  return { id: user.id, personId: person?.id ?? null, name: person ? person.name : user.name,
    departmentId: person ? person.departmentId : user.departmentId,
    departmentName: person ? person.department?.name ?? null : user.department?.name ?? null,
    position: person?.position ?? null };
}
